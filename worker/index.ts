import { getLibraryManifest, getTrack, recall, searchSongs } from "../lib/server/catalog";
import { applyExplicitFilters } from "../lib/server/filters";
import { rankWithJev, JevScoringError, type Direction } from "../lib/server/recommend";
import { parseModelConfig, rankWithCompatible, type ModelConfig } from "../lib/server/model-provider";
import { cancelJob, claimStep, createJob, finishStep, getStepCandidates, jobView, readJob } from "./jobs";

const ALLOWED_ORIGIN = "https://emanon4.github.io";
export function allowedOrigin(origin: string | null): boolean {
 if (!origin) return true;
 if (origin === ALLOWED_ORIGIN) return true;
 try { const url = new URL(origin); return /^(http:|https:)$/.test(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname); } catch { return false; }
}
class ApiError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
function ensureConnected(request: Request) { if (request.signal.aborted) throw new ApiError("请求已取消。", 499); }
function configuredModel(value: unknown, env: AftertoneApiEnv) {
 try { return parseModelConfig(value, env.MODEL_BASE_URL_ALLOWLIST); }
 catch { throw new ApiError("模型配置无效，请选择支持的服务地址并填写模型名称。"); }
}
function personalKey(request: Request): string {
 const key = request.headers.get("X-Model-Api-Key")?.trim();
 if (!key) throw new ApiError("请提供这轮任务使用的个人 API 密钥。", 401);
 if (key.length > 4096 || /[^\x21-\x7E]/.test(key)) throw new ApiError("个人 API 密钥格式无效。");
 return key;
}
async function fingerprint(key: string): Promise<string> {
 const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
 return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}
function sameFingerprint(left: string, right: string): boolean {
 if (left.length !== right.length) return false;
 let difference = 0; for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
 return difference === 0;
}
async function jsonBody(request: Request, optional = false): Promise<Record<string, unknown>> {
 const reader = request.body?.getReader(); if (!reader) { if (optional) return {}; throw new ApiError("请求格式无效。"); }
 const decoder = new TextDecoder(); let text = "", bytes = 0;
 try { while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length;
  if (bytes > 20_000) { await reader.cancel(); throw new ApiError("请求内容过长。", 413); }
  text += decoder.decode(value, { stream: true });
 } } finally { reader.releaseLock(); }
 text += decoder.decode(); if (!text && optional) return {};
 try { const data = JSON.parse(text); if (!data || typeof data !== "object" || Array.isArray(data)) throw Error(); return data; } catch { throw new ApiError("请求格式无效。"); }
}
export function validateRecommendation(body: Record<string, unknown>) {
 const seed = body.seed as { id?: unknown; provider?: unknown } | undefined;
 const direction = body.direction, notes = body.notes ?? "", excluded = body.excluded ?? [];
 if (!seed || typeof seed.id !== "string" || !/^\d{1,18}$/.test(seed.id) || typeof seed.provider !== "string" || !["deezer", "itunes"].includes(seed.provider)
  || typeof direction !== "string" || !["close", "sideways", "bold"].includes(direction) || typeof notes !== "string" || notes.length > 200
  || !Array.isArray(excluded) || excluded.length > 150 || excluded.some(x => typeof x !== "string" || !/^(deezer|itunes):\d{1,18}$/.test(x))) throw new ApiError("找歌条件无效，请重新选一首歌。");
 const feedback: { liked: string[]; disliked: string[] } = { liked: [], disliked: [] };
 const supplied = body.feedback as Record<string, unknown> | undefined;
 for (const k of ["liked", "disliked"] as const) if (Array.isArray(supplied?.[k])) feedback[k] = supplied[k].filter((x: unknown): x is string => typeof x === "string").slice(0, 8).map(x => x.slice(0, 140));
 return { seed: { id: seed.id, provider: seed.provider }, direction: direction as Direction, notes: notes.trim(), excluded: excluded as string[], feedback };
}
const defaults = { getLibraryManifest, getTrack, recall, searchSongs, rankWithJev, rankWithCompatible, now: Date.now };
export function createApi(overrides: Partial<typeof defaults> = {}) {
 const deps = { ...defaults, ...overrides };
 return async (request: Request, env: AftertoneApiEnv): Promise<Response> => {
  const origin = request.headers.get("origin"), url = new URL(request.url);
  const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" });
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!allowedOrigin(origin)) return respond({ error: "请求来源无效。" }, 403);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Model-Api-Key");
  if (request.method === "OPTIONS") { headers.set("Access-Control-Max-Age", "600"); return new Response(null, { status: 204, headers }); }
  try {
   if (url.pathname === "/api/library" && request.method === "GET") {
    const manifest = await deps.getLibraryManifest(request.url, env.ASSETS);
    return respond({ ...manifest, candidateLimit: 5000, engine: "jev", available: Boolean(env.TYPESAFE_API_KEY), byokAvailable: Boolean(env.DB) });
   }
   if (url.pathname === "/api/music" && request.method === "GET") {
    const id = url.searchParams.get("id"), provider = url.searchParams.get("provider") || "deezer";
    if (id) { if (!["deezer", "itunes"].includes(provider) || !/^\d{1,18}$/.test(id)) throw new ApiError("歌曲编号或音乐来源无效。"); return respond({ track: await deps.getTrack(id, provider) }); }
    const q = url.searchParams.get("q")?.trim(); if (!q || q.length < 2 || q.length > 120) throw new ApiError("请输入 2–120 字的歌名或歌手。");
    return respond({ tracks: await deps.searchSongs(q) });
   }
   if (url.pathname === "/api/recommend" && request.method === "POST") {
    if (!env.DB) throw new ApiError("筛选任务服务暂不可用。", 503);
    const body = await jsonBody(request);
    const input = validateRecommendation(body);
    const modelConfig = configuredModel(body.modelConfig, env);
    let keyFingerprint: string | null = null;
    if (modelConfig) keyFingerprint = await fingerprint(personalKey(request));
    else {
     if (request.headers.has("X-Model-Api-Key")) throw new ApiError("使用个人密钥时，请同时提供模型配置。");
     if (!env.TYPESAFE_API_KEY) throw new ApiError("站点 Jev 尚未连接，请使用个人 API 密钥，或先搜索、试听和收藏。", 503);
    }
    ensureConnected(request);
    const seed = await deps.getTrack(input.seed.id, input.seed.provider);
    ensureConnected(request);
    const recalled = await deps.recall(seed, input.excluded, input.direction, request.url, { assets: env.ASSETS, limit: 5000 });
    ensureConnected(request);
    const candidates = applyExplicitFilters(recalled.candidates, input.notes);
    if (!candidates.length) return respond({ status: "done", jobId: null, tracks: [], modelConfig, credentialMode: modelConfig ? "personal" : "site", progress: { scoredCount: 0, totalCount: 0, completedBatches: 0, totalBatches: 0, elapsedMs: 0 }, meta: { engine: "constraints", candidateCount: 0, actualScoredCount: 0, libraryCount: recalled.libraryCount, requestCount: 0, elapsedMs: 0, wallMs: 0, jevMs: 0 } });
    const job = await createJob(env.DB, { ...input, modelConfig, keyFingerprint, seed: recalled.seed, candidates, libraryCount: recalled.libraryCount, recallMeta: { ...recalled.recallMeta, returnedAfterFilters: candidates.length } }, deps.now());
    if (request.signal.aborted) {
     // The transaction may already have committed, but no model work should remain pending.
     if (job) await cancelJob(env.DB, job.id, deps.now());
     ensureConnected(request);
    }
    if (!job) throw new ApiError(modelConfig ? "这把个人密钥今天的 30 轮找歌已用完，请明天再继续。" : "今天全站的 30 轮智能找歌已用完。你仍然可以试听和收藏，或使用个人 API 密钥。", 429);
    return respond(jobView(job, deps.now()), 201);
   }
   const match = url.pathname.match(/^\/api\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(step|cancel))?$/i);
   if (match) {
    if (!env.DB) throw new ApiError("筛选任务服务暂不可用。", 503);
    let job = await readJob(env.DB, match[1], deps.now());
    if (!job) throw new ApiError("找歌任务不存在或已清理，请重新开始。", 404);
    if (request.method === "GET" && !match[2]) return respond(jobView(job, deps.now()));
    if (request.method === "POST" && match[2] === "cancel") { job = await cancelJob(env.DB, job.id, deps.now()) || job; return respond(jobView(job, deps.now())); }
    if (request.method === "POST" && match[2] === "step") {
     let modelConfig: ModelConfig | null = null;
     let modelKey: string;
     if (job.model_config_json || job.key_fingerprint) {
      if (!job.model_config_json || !job.key_fingerprint) throw new ApiError("个人任务配置不完整，请重新创建任务。", 503);
      modelConfig = configuredModel(JSON.parse(job.model_config_json), env);
      if (!modelConfig) throw new ApiError("个人任务配置不完整，请重新创建任务。", 503);
      modelKey = personalKey(request);
      if (!sameFingerprint(await fingerprint(modelKey), job.key_fingerprint)) throw new ApiError("个人密钥与创建这轮任务时不一致，请使用原密钥。", 403);
     } else modelKey = env.TYPESAFE_API_KEY;
     if (job.status !== "pending") return respond(jobView(job, deps.now()), job.status === "running" ? 202 : 200);
     if (!modelKey) throw new ApiError("站点 Jev 暂未连接，本步骤尚未执行。", 503);
     const body = await jsonBody(request, true);
     if (body.step !== undefined && (!Number.isInteger(body.step) || Number(body.step) < 0)) throw new ApiError("步骤编号无效。");
     if (body.step !== undefined && body.step !== job.next_step) return respond(jobView(job, deps.now()));
     if (request.signal.aborted) { job = await cancelJob(env.DB, job.id, deps.now()) || job; return respond(jobView(job, deps.now())); }
     const claimed = await claimStep(env.DB, job.id, job.next_step, deps.now());
     if (!claimed) { job = await readJob(env.DB, job.id, deps.now()) || job; return respond(jobView(job, deps.now()), job.status === "running" ? 202 : 200); }
     let settled;
     let scoredResult: Awaited<ReturnType<typeof rankWithJev>> | null = null;
     try {
      const candidates = await getStepCandidates(env.DB, claimed);
      // Candidate reads can overlap a cancellation in another request/isolate.
      const current = request.signal.aborted ? await cancelJob(env.DB, claimed.id, deps.now()) : await readJob(env.DB, claimed.id, deps.now());
      if (!current || current.status !== "running" || current.lease_token !== claimed.lease_token) {
       if (!current) throw new ApiError("找歌任务不存在或已清理，请重新开始。", 404);
       return respond(jobView(current, deps.now()));
      }
      // One step starts at most four bounded requests. Never retry after a lost lease.
      const seed = JSON.parse(claimed.seed_json), feedback = JSON.parse(claimed.feedback_json);
      const options = { batchSize: claimed.batch_size, concurrency: 4, timeoutMs: 60_000, signal: request.signal, ...(modelConfig?.provider === "jev" ? { model: modelConfig.model } : {}) };
      const result = modelConfig?.provider === "openai-compatible"
       ? await deps.rankWithCompatible(seed, candidates, claimed.direction, claimed.notes, modelKey, feedback, modelConfig, options)
       : await deps.rankWithJev(seed, candidates, claimed.direction, claimed.notes, modelKey, feedback, options);
      scoredResult = result;
      settled = await finishStep(env.DB, claimed, result, result.tracks, null, deps.now());
     } catch (error) {
      const metrics = error instanceof JevScoringError ? error.metrics : scoredResult;
      const message = error instanceof JevScoringError ? error.message : "本步骤未完成；为避免重复调用模型，任务已停止。";
      settled = await finishStep(env.DB, claimed, metrics, null, message, deps.now());
     }
     if (!settled) throw new ApiError("任务状态暂时无法确认，请查看任务进度；请勿重新创建重复任务。", 503);
     return respond(jobView(settled, deps.now()));
    }
    throw new ApiError("请求方法无效。", 405);
   }
   return respond({ error: "接口不存在。" }, 404);
  } catch (error) {
   if (error instanceof ApiError) return respond({ error: error.message }, error.status);
   return respond({ error: "服务暂时不可用，请稍后查询任务状态。" }, 502);
  }
 };
}
const handler = createApi();
export default { fetch: handler } satisfies ExportedHandler<AftertoneApiEnv>;
