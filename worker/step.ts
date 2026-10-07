import { rankWithJev, JevScoringError } from "../lib/server/recommend";
import { parseModelConfig, rankWithCompatible, type ModelConfig } from "../lib/server/model-provider";
import { cancelJob, claimStep, finishStep, getStepCandidates, readJob, type JobRow } from "./jobs";

export type StepDeps = { rankWithJev: typeof rankWithJev; rankWithCompatible: typeof rankWithCompatible; now: () => number };
export type StepOutcome =
 | { kind: "settled"; job: JobRow }
 | { kind: "busy"; job: JobRow }
 | { kind: "skipped"; job: JobRow }
 | { kind: "unconfirmed" };

export function jobModelConfig(job: JobRow, allowlist?: string): ModelConfig | null {
 if (!job.model_config_json && !job.key_fingerprint) return null;
 if (!job.model_config_json || !job.key_fingerprint) throw new Error("incomplete personal job");
 const config = parseModelConfig(JSON.parse(job.model_config_json), allowlist);
 if (!config) throw new Error("incomplete personal job");
 return config;
}

/**
 * Claim and run exactly one step. Shared by the client-driven HTTP route and the server-side
 * JobRunner, so both obey the same lease: at most one runner can ever pay for a given step.
 */
export async function runJobStep(db: D1Database, deps: StepDeps, job: JobRow, modelKey: string, modelConfig: ModelConfig | null, signal: AbortSignal): Promise<StepOutcome> {
 if (signal.aborted) return { kind: "skipped", job: await cancelJob(db, job.id, deps.now()) || job };
 const claimed = await claimStep(db, job.id, job.next_step, deps.now());
 if (!claimed) {
  const current = await readJob(db, job.id, deps.now()) || job;
  return { kind: current.status === "running" ? "busy" : "skipped", job: current };
 }
 let settled: JobRow | null;
 let scoredResult: Awaited<ReturnType<typeof rankWithJev>> | null = null;
 try {
  const candidates = await getStepCandidates(db, claimed);
  // Candidate reads can overlap a cancellation in another request/isolate.
  const current = signal.aborted ? await cancelJob(db, claimed.id, deps.now()) : await readJob(db, claimed.id, deps.now());
  if (!current || current.status !== "running" || current.lease_token !== claimed.lease_token) {
   if (!current) return { kind: "unconfirmed" };
   return { kind: "skipped", job: current };
  }
  // One step starts at most four bounded requests. Never retry after a lost lease.
  const seed = JSON.parse(claimed.seed_json), feedback = JSON.parse(claimed.feedback_json);
  const options = { batchSize: claimed.batch_size, concurrency: 4, timeoutMs: 60_000, signal, ...(modelConfig?.provider === "jev" ? { model: modelConfig.model } : {}) };
  const result = modelConfig?.provider === "openai-compatible"
   ? await deps.rankWithCompatible(seed, candidates, claimed.direction, claimed.notes, modelKey, feedback, modelConfig, options)
   : await deps.rankWithJev(seed, candidates, claimed.direction, claimed.notes, modelKey, feedback, options);
  scoredResult = result;
  settled = await finishStep(db, claimed, result, result.tracks, null, deps.now());
 } catch (error) {
  const metrics = error instanceof JevScoringError ? error.metrics : scoredResult;
  const message = error instanceof JevScoringError ? error.message : "本步骤未完成；为避免重复调用模型，任务已停止。";
  settled = await finishStep(db, claimed, metrics, null, message, deps.now());
 }
 return settled ? { kind: "settled", job: settled } : { kind: "unconfirmed" };
}
