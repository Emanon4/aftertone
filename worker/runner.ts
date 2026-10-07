import { rankWithJev } from "../lib/server/recommend";
import { rankWithCompatible } from "../lib/server/model-provider";
import { readJob } from "./jobs";
import { jobModelConfig, runJobStep, type StepDeps } from "./step";

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUSY_RETRY_MS = 2_000;
type RunnerState = { storage: Pick<DurableObjectStorage, "get" | "put" | "deleteAll" | "setAlarm"> };

/**
 * One Durable Object per job drives its steps with alarms, so a round keeps going when the tab is
 * hidden, the phone is locked or the network drops. A personal key lives only in this object's
 * memory (never in storage); if the object is evicted the browser takes over stepping, guarded by
 * the same D1 lease as before.
 */
export class JobRunner {
 private key: string | null = null;
 constructor(private state: RunnerState, private env: AftertoneApiEnv, private deps: StepDeps = { rankWithJev, rankWithCompatible, now: Date.now }) {}

 async fetch(request: Request): Promise<Response> {
  let jobId: unknown;
  try { jobId = (await request.json() as { jobId?: unknown }).jobId; } catch { jobId = undefined; }
  if (request.method !== "POST" || typeof jobId !== "string" || !JOB_ID.test(jobId)) return new Response(null, { status: 400 });
  this.key = request.headers.get("X-Model-Api-Key");
  await this.state.storage.put("jobId", jobId);
  await this.state.storage.setAlarm(this.deps.now());
  return new Response(null, { status: 202 });
 }

 private async stop() { this.key = null; await this.state.storage.deleteAll(); }

 async alarm(): Promise<void> {
  try {
   const jobId = await this.state.storage.get<string>("jobId");
   if (!jobId) return;
   const job = await readJob(this.env.DB, jobId, this.deps.now());
   if (!job || (job.status !== "pending" && job.status !== "running")) return this.stop();
   // Another runner (usually the browser) holds the lease: look again shortly.
   if (job.status === "running") { await this.state.storage.setAlarm(this.deps.now() + BUSY_RETRY_MS); return; }
   const config = jobModelConfig(job, this.env.MODEL_BASE_URL_ALLOWLIST);
   const key = config ? this.key : this.env.TYPESAFE_API_KEY;
   if (!key) return this.stop();
   const outcome = await runJobStep(this.env.DB, this.deps, job, key, config, new AbortController().signal);
   if (outcome.kind === "busy") await this.state.storage.setAlarm(this.deps.now() + BUSY_RETRY_MS);
   else if (outcome.kind !== "unconfirmed" && outcome.job.status === "pending") await this.state.storage.setAlarm(this.deps.now());
   else await this.stop();
  } catch {
   // Never let the platform retry an alarm blindly: the lease decides what may run next.
   await this.stop();
  }
 }
}
