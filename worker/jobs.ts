import type { Track } from "../lib/music";
import { selectTracks, type Direction, type JevMetrics } from "../lib/server/recommend";
import type { ModelConfig } from "../lib/server/model-provider";

export const JOB_TTL_MS = 30 * 60_000;
export const LEASE_MS = 90_000;
export const MAX_BATCHES_PER_STEP = 4;
export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled" | "expired";
export type JobRow = {
 id: string; status: JobStatus; created_at: number; updated_at: number; expires_at: number; finished_at: number | null;
 seed_json: string; direction: Direction; notes: string; feedback_json: string;
 total_count: number; total_batches: number; batch_size: number; total_steps: number; next_step: number;
 scored_count: number; completed_batches: number; request_count: number; failed_request_count: number;
 input_tokens: number; output_tokens: number; usage_complete: number; jev_ms: number;
 top_json: string; models_json: string; library_count: number; recall_json: string; remaining: number;
 lease_token: string | null; lease_until: number | null; error: string | null;
 model_config_json: string | null; key_fingerprint: string | null; quota_bucket: string;
};
export type NewJob = {
 seed: Track; candidates: Track[]; direction: Direction; notes: string;
 feedback: { liked: string[]; disliked: string[] }; libraryCount: number; recallMeta: unknown;
 modelConfig?: ModelConfig | null; keyFingerprint?: string | null;
};
export async function createJob(db: D1Database, data: NewJob, now: number): Promise<JobRow | null> {
 const id = crypto.randomUUID();
 if (Boolean(data.modelConfig) !== Boolean(data.keyFingerprint)) throw new Error("Personal model credentials must match the job configuration.");
 const batchSize = data.modelConfig?.provider === "openai-compatible" || data.notes.trim() ? 64 : 128;
 const stepSize = batchSize * MAX_BATCHES_PER_STEP;
 const chunks: Track[][] = [];
 for (let i = 0; i < data.candidates.length; i += stepSize) chunks.push(data.candidates.slice(i, i + stepSize));
 const totalBatches = Math.ceil(data.candidates.length / batchSize);
 const day = new Date(now).toISOString().slice(0, 10);
 const bucket = data.keyFingerprint ? `key:${data.keyFingerprint}` : "site";
 const budget = data.keyFingerprint
  ? db.prepare("INSERT INTO api_personal_daily_budget(bucket,day,count) VALUES (?,?,1) ON CONFLICT(bucket,day) DO UPDATE SET count=count+1 WHERE count<30 RETURNING count").bind(bucket, day)
  : db.prepare("INSERT INTO api_daily_budget(day,count) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1 WHERE count<30 RETURNING count").bind(day);
 const countSql = data.keyFingerprint ? "SELECT count FROM api_personal_daily_budget WHERE day=? AND bucket=?" : "SELECT count FROM api_daily_budget WHERE day=?";
 const countArgs = data.keyFingerprint ? [day, bucket] : [day];
 const values = [id, now, now, now + JOB_TTL_MS, JSON.stringify(data.seed), data.direction, data.notes, JSON.stringify(data.feedback), data.candidates.length, totalBatches, batchSize, chunks.length, data.libraryCount, JSON.stringify(data.recallMeta), data.modelConfig ? JSON.stringify(data.modelConfig) : null, data.keyFingerprint || null, bucket];
 // The budget increment, conditional job insert, and candidate chunks commit together.
 const statements = [
  db.prepare("DELETE FROM api_job_steps WHERE job_id IN (SELECT id FROM api_jobs WHERE expires_at < ?)").bind(now - 86_400_000),
  db.prepare("DELETE FROM api_jobs WHERE expires_at < ?").bind(now - 86_400_000),
  budget,
  db.prepare(`INSERT INTO api_jobs(id,status,created_at,updated_at,expires_at,seed_json,direction,notes,feedback_json,total_count,total_batches,batch_size,total_steps,library_count,recall_json,model_config_json,key_fingerprint,quota_bucket,remaining)
   SELECT ?,'pending',${values.slice(1).map(() => "?").join(",")},30-(${countSql}) WHERE changes()=1 RETURNING *`)
   .bind(...values, ...countArgs),
  ...chunks.map((tracks, i) => db.prepare("INSERT INTO api_job_steps(job_id,step_index,candidates_json) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM api_jobs WHERE id=?)").bind(id, i, JSON.stringify(tracks), id)),
 ];
 const results = await db.batch<JobRow>(statements);
 return results[3].results[0] || null;
}
export async function readJob(db: D1Database, id: string, now: number): Promise<JobRow | null> {
 // A lost lease is terminal: a paid batch might already have run, so never reclaim it.
 const expired = await db.prepare(`UPDATE api_jobs SET
  status=CASE WHEN status='running' THEN 'failed' ELSE 'expired' END,
  error=CASE WHEN status='running' THEN '这一步已中断或超时；为避免重复调用模型，任务不再重试。' ELSE '找歌任务已过期，请重新开始。' END,
  usage_complete=CASE WHEN status='running' THEN 0 ELSE usage_complete END,finished_at=?,updated_at=?
  WHERE id=? AND status IN ('pending','running') AND (expires_at<=? OR (status='running' AND lease_until<=?)) RETURNING *`)
  .bind(now, now, id, now, now).first<JobRow>();
 return expired || db.prepare("SELECT * FROM api_jobs WHERE id=?").bind(id).first<JobRow>();
}
export async function claimStep(db: D1Database, id: string, expectedStep: number, now: number) {
 const token = crypto.randomUUID();
 return db.prepare(`UPDATE api_jobs SET status='running',lease_token=?,lease_until=?,updated_at=?
  WHERE id=? AND status='pending' AND next_step=? AND expires_at>? RETURNING *`)
  .bind(token, now + LEASE_MS, now, id, expectedStep, now).first<JobRow>();
}
export async function getStepCandidates(db: D1Database, job: JobRow): Promise<Track[]> {
 const row = await db.prepare("SELECT candidates_json FROM api_job_steps WHERE job_id=? AND step_index=?").bind(job.id, job.next_step).first<{ candidates_json: string }>();
 if (!row) throw new Error("这一批候选已不可用，任务已停止。");
 return JSON.parse(row.candidates_json) as Track[];
}
export async function cancelJob(db: D1Database, id: string, now: number) {
 const cancelled = await db.prepare(`UPDATE api_jobs SET status='cancelled',error='找歌已取消。',finished_at=?,updated_at=?
  WHERE id=? AND status IN ('pending','running') RETURNING *`).bind(now, now, id).first<JobRow>();
 return cancelled || readJob(db, id, now);
}
export async function finishStep(db: D1Database, job: JobRow, metrics: JevMetrics | null, tracks: Track[] | null, error: string | null, now: number): Promise<JobRow | null> {
 const done = !error && job.next_step + 1 === job.total_steps;
 const status: JobStatus = error ? "failed" : done ? "done" : "pending";
 const seed = JSON.parse(job.seed_json) as Track;
 const top = tracks ? selectTracks([...(JSON.parse(job.top_json) as Track[]), ...tracks], seed, job.direction) : [];
 const models = [...new Set([...(JSON.parse(job.models_json) as string[]), ...(metrics?.models || [])])];
 const finished = done || error ? now : null;
 // Keep a concurrent cancellation/expiry terminal, but record confirmed work from this lease.
 const results = await db.batch<JobRow>([
  db.prepare(`UPDATE api_jobs SET
   status=CASE WHEN status='running' THEN ? ELSE status END,
   next_step=CASE WHEN status='running' AND ? IS NULL THEN next_step+1 ELSE next_step END,
   scored_count=scored_count+?,completed_batches=completed_batches+?,request_count=request_count+?,failed_request_count=failed_request_count+?,
   input_tokens=input_tokens+?,output_tokens=output_tokens+?,usage_complete=MIN(usage_complete,?),jev_ms=jev_ms+?,
   top_json=CASE WHEN status='running' AND ? IS NULL THEN ? ELSE '[]' END,models_json=?,
   error=CASE WHEN status='running' THEN ? ELSE error END,
   finished_at=COALESCE(finished_at,?),updated_at=?,lease_token=NULL,lease_until=NULL
   WHERE id=? AND lease_token=? RETURNING *`)
   .bind(status, error, metrics?.actualScoredCount || 0, metrics?.completedBatches || 0, metrics?.requestCount || 0, metrics?.failedRequestCount || 0,
    metrics?.usage.input_tokens || 0, metrics?.usage.output_tokens || 0, metrics ? Number(metrics.usageComplete) : 0, metrics?.wallMs || 0,
    error, JSON.stringify(top), JSON.stringify(models), error, finished, now, job.id, job.lease_token),
  db.prepare("DELETE FROM api_job_steps WHERE job_id=? AND step_index=?").bind(job.id, job.next_step),
 ]);
 return results[0].results[0] || readJob(db, job.id, now);
}
export function jobView(job: JobRow, now: number) {
 const elapsedMs = Math.max(0, (job.finished_at ?? now) - job.created_at);
 const progress = { scoredCount: job.scored_count, totalCount: job.total_count, completedBatches: job.completed_batches, totalBatches: job.total_batches, elapsedMs };
 const models = JSON.parse(job.models_json) as string[];
 const modelConfig = job.model_config_json ? JSON.parse(job.model_config_json) as ModelConfig : null;
 const credentialMode = modelConfig ? "personal" : "site";
 const meta = { candidateCount: job.total_count, actualScoredCount: job.scored_count, libraryCount: job.library_count,
  requestCount: job.request_count, failedRequestCount: job.failed_request_count, wallMs: elapsedMs, elapsedMs, jevMs: job.jev_ms,
  model: models.length === 1 ? models[0] : models.length ? "mixed" : "unknown", models,
  engine: modelConfig?.provider || "jev", credentialMode, modelConfig, modelMs: job.jev_ms, evidence: "metadata", usage: { input_tokens: job.input_tokens, output_tokens: job.output_tokens }, usageComplete: Boolean(job.usage_complete),
  remaining: job.remaining, recall: JSON.parse(job.recall_json),
 };
 return { jobId: job.id, status: job.status, nextStep: job.next_step, totalSteps: job.total_steps, expiresAt: job.expires_at, progress, modelConfig, credentialMode,
  ...(job.status === "running" ? { retryAfterMs: 750 } : {}), ...(job.error ? { error: job.error } : {}),
  ...(job.status === "done" ? { tracks: JSON.parse(job.top_json) as Track[], meta } : {}),
 };
}
