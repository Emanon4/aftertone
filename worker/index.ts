import { getLibraryManifest, getTrack, recall, searchSongs, type AssetReader } from "../lib/server/catalog";
import { applyExplicitFilters } from "../lib/server/filters";
import { DEFAULT_CANDIDATE_LIMIT, prerankCandidates } from "../lib/server/prerank";
import { rankWithJev, type Direction } from "../lib/server/recommend";
import { COMPATIBLE_BASE_URLS, parseModelConfig, rankWithCompatible, type ModelConfig } from "../lib/server/model-provider";
import { cancelJob, consumeRateBudget, createJob, jobView, readJob } from "./jobs";
import { jobModelConfig, runJobStep } from "./step";

export const DEFAULT_ALLOWED_ORIGINS = "https://emanon4.github.io";
const RECALL_POOL = 5000;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Exact configured origins, plus local development hosts. A missing Origin is only accepted for reads. */
export function allowedOrigin(origin: string | null, configured = DEFAULT_ALLOWED_ORIGINS): boolean {
 if (!origin) return true;
 if (configured.split(",").map(value => value.trim().replace(/\/$/, "")).filter(Boolean).includes(origin)) return true;
 try { const url = new URL(origin); return /^(http:|https:)$/.test(url.protocol) && LOCAL_HOSTS.includes(url.hostname); } catch { return false; }
}
class ApiError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
function ensureConnected(request: Request) { if (request.signal.aborted) throw new ApiError("请求已取消。", 499); }
function intSetting(value: string | undefined, fallback: number, min: number, max: number) {
 const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
export function settings(env: AftertoneApiEnv) {
 return {
  origins: env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS,
  candidateLimit: intSetting(env.CANDIDATE_LIMIT, DEFAULT_CANDIDATE_LIMIT, 50, RECALL_POOL),
  siteDaily: intSetting(env.SITE_DAILY_ROUNDS, 100, 0, 100_000),
  personalDaily: intSetting(env.PERSONAL_DAILY_ROUNDS, 30, 0, 10_000),
  ipDaily: intSetting(env.IP_DAILY_ROUNDS, 20, 0, 10_000),
  personalGlobalDaily: intSetting(env.PERSONAL_GLOBAL_DAILY_ROUNDS, 300, 0, 1_000_000),
  country: /^[A-Z]{2}$/.test(env.ITUNES_COUNTRY || "") ? env.ITUNES_COUNTRY! : "SG",
 };
}
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
async function sha256(value: string): Promise<string> {
 const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}
const fingerprint = (key: string) => sha256(key);
function sameFingerprint(left: string, right: string): boolean {
 if (left.length !== right.length) return false;
 let difference = 0; for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
 return difference === 0;
}
async function jsonBody(request: Request, optional = false): Promise<Record<string, unknown>> {
 const reader = request.body?.getReader(); if (!reader) { if (optional) return {}; throw new ApiError("请求格式无效。"); }
 const decoder = new TextDecoder(); let text = "", bytes = 0;
 try { while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length;
  if (bytes > 24_000) { await reader.cancel(); throw new ApiError("请求内容过长。", 413); }
  text += decoder.decode(value, { stream: true });
 } } finally { reader.releaseLock(); }
 text += decoder.decode(); if (!text && optional) return {};
 try { const data = JSON.parse(text); if (!data || typeof data !== "object" || Array.isArray(data)) throw Error(); return data; } catch { throw new ApiError("请求格式无效。"); }
}
const shortStrings = (value: unknown, max: number, length: number) => Array.isArray(value)
 ? value.filter((x: unknown): x is string => typeof x === "string").slice(0, max).map(x => x.slice(0, length).trim()).filter(Boolean) : [];
export function validateRecommendation(body: Record<string, unknown>) {
 const seed = body.seed as { id?: unknown; provider?: unknown } | undefined;
 const direction = body.direction, notes = body.notes ?? "", excluded = body.excluded ?? [];
 if (!seed || typeof seed.id !== "string" || !/^\d{1,18}$/.test(seed.id) || typeof seed.provider !== "string" || !["deezer", "itunes"].includes(seed.provider)
  || typeof direction !== "string" || !["close", "sideways", "bold"].includes(direction) || typeof notes !== "string" || notes.length > 200
  || !Array.isArray(excluded) || excluded.length > 150 || excluded.some(x => typeof x !== "string" || !/^(deezer|itunes):\d{1,18}$/.test(x))
  || (body.avoidArtists !== undefined && (!Array.isArray(body.avoidArtists) || body.avoidArtists.length > 30))) throw new ApiError("找歌条件无效，请重新选一首歌。");
 const supplied = body.feedback as Record<string, unknown> | undefined;
 const feedback = { liked: shortStrings(supplied?.liked, 8, 140), disliked: shortStrings(supplied?.disliked, 8, 140) };
 return { seed: { id: seed.id, provider: seed.provider }, direction: direction as Direction, notes: notes.trim(), excluded: excluded as string[], feedback, avoidArtists: shortStrings(body.avoidArtists, 30, 80) };
}

/** Cheap pre-flight for OpenAI-compatible keys: listing models costs no tokens. Only an explicit 401/403 rejects. */
export async function verifyCompatibleKey(config: ModelConfig, key: string, fetcher: typeof fetch = fetch): Promise<boolean> {
 if (config.provider !== "openai-compatible" || !(COMPATIBLE_BASE_URLS as readonly string[]).includes(config.baseUrl)) return true;
 try {
  const response = await fetcher(`${config.baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` }, redirect: "manual", signal: AbortSignal.timeout(8_000) });
  try { await response.body?.cancel(); } catch { /* Nothing from the body is used. */ }
  return response.status !== 401 && response.status !== 403;
 } catch { return true; }
}
export async function verifyTurnstile(secret: string, token: string, ip: string | null, fetcher: typeof fetch = fetch): Promise<boolean> {
 const form = new FormData(); form.set("secret", secret); form.set("response", token); if (ip) form.set("remoteip", ip);
 try {
  const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(8_000) });
  return Boolean(((await response.json()) as { success?: unknown }).success === true);
 } catch { return false; }
}
/** Reads catalog files from R2 when bound, so the large index can live outside Git and static assets. */
export function r2Reader(bucket: R2Bucket): AssetReader {
 return { fetch: async input => {
  const key = new URL(String(input)).pathname.replace(/^\/+/, "");
  if (!/^catalog\/[a-z0-9-]+\.json$/.test(key)) return new Response(null, { status: 404 });
  const object = await bucket.get(key);
  return object ? new Response(object.body, { headers: { "Content-Type": "application/json" } }) : new Response(null, { status: 404 });
 } };
}

// Zone cache: a no-op on *.workers.dev, effective once the API has a custom domain.
const edgeCache = (): Cache | undefined => typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
const defaults = { getLibraryManifest, getTrack, recall, searchSongs, rankWithJev, rankWithCompatible, verifyCompatibleKey, verifyTurnstile, now: Date.now, cache: undefined as Cache | undefined };
export function createApi(overrides: Partial<typeof defaults> = {}) {
 const deps = { ...defaults, ...overrides };
 return async (request: Request, env: AftertoneApiEnv): Promise<Response> => {
  const config = settings(env);
  const origin = request.headers.get("origin"), url = new URL(request.url);
  const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" });
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!allowedOrigin(origin, config.origins)) return respond({ error: "请求来源无效。" }, 403);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Model-Api-Key");
  if (request.method === "OPTIONS") { headers.set("Access-Control-Max-Age", "600"); return new Response(null, { status: 204, headers }); }
  // Writes and paid work need a browser Origin; scripts without one may only read.
  if (request.method === "POST" && !origin) return respond({ error: "请求来源无效。" }, 403);
  const assets = env.CATALOG ? r2Reader(env.CATALOG) : env.ASSETS;
  try {
   if (url.pathname === "/api/library" && request.method === "GET") {
    const manifest = await deps.getLibraryManifest(request.url, assets);
    return respond({ ...manifest, candidateLimit: config.candidateLimit, recallPool: RECALL_POOL, engine: "jev", available: Boolean(env.TYPESAFE_API_KEY), byokAvailable: Boolean(env.DB),
     quota: { siteDaily: config.siteDaily, personalDaily: config.personalDaily, ipDaily: config.ipDaily }, serverDriven: Boolean(env.JOB_RUNNER),
     turnstileSiteKey: env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY ? env.TURNSTILE_SITE_KEY : null, country: config.country });
   }
   if (url.pathname === "/api/music" && request.method === "GET") {
    const id = url.searchParams.get("id"), provider = url.searchParams.get("provider") || "deezer";
    const q = url.searchParams.get("q")?.trim();
    if (id) { if (!["deezer", "itunes"].includes(provider) || !/^\d{1,18}$/.test(id)) throw new ApiError("歌曲编号或音乐来源无效。"); }
    else if (!q || q.length < 2 || q.length > 120) throw new ApiError("请输入 2–120 字的歌名或歌手。");
    // Shared edge cache: popular searches and lookups never reach Deezer/iTunes twice. Lookups carry
    // short-lived signed preview URLs, so they expire sooner than search results.
    const cacheKey = new Request(`https://music-cache.aftertone/${id ? `track/${provider}/${id}` : `search/${encodeURIComponent(q!.toLowerCase())}`}?c=${config.country}`);
    const cache = deps.cache ?? edgeCache();
    const cached = await cache?.match(cacheKey);
    if (cached) return respond(await cached.json());
    // Only provider round-trips count against the per-visitor limit; cache hits are free.
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip && env.MUSIC_LIMITER && !(await env.MUSIC_LIMITER.limit({ key: ip })).success) throw new ApiError("搜索太频繁了，请稍等一会儿再试。", 429);
    const body = id ? { track: await deps.getTrack(id, provider, config.country) } : { tracks: await deps.searchSongs(q!, config.country) };
    await cache?.put(cacheKey, Response.json(body, { headers: { "Cache-Control": `public, max-age=${id ? 300 : 900}` } }));
    return respond(body);
   }
   if (url.pathname === "/api/recommend" && request.method === "POST") {
    if (!env.DB) throw new ApiError("筛选任务服务暂不可用。", 503);
    const body = await jsonBody(request);
    const input = validateRecommendation(body);
    const modelConfig = configuredModel(body.modelConfig, env);
    let keyFingerprint: string | null = null, modelKey: string | null = null;
    if (modelConfig) { modelKey = personalKey(request); keyFingerprint = await fingerprint(modelKey); }
    else {
     if (request.headers.has("X-Model-Api-Key")) throw new ApiError("使用个人密钥时，请同时提供模型配置。");
     if (!env.TYPESAFE_API_KEY) throw new ApiError("站点 Jev 尚未连接，请使用个人 API 密钥，或先搜索、试听和收藏。", 503);
    }
    const ip = request.headers.get("CF-Connecting-IP");
    if (env.TURNSTILE_SECRET_KEY) {
     const token = typeof body.turnstileToken === "string" ? body.turnstileToken.slice(0, 2048) : "";
     if (!token || !(await deps.verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, ip))) throw new ApiError("人机验证未通过，请刷新后再试。", 403);
    }
    // Per-visitor ceiling before any provider recall. Only a salted daily hash is stored, never the IP.
    if (ip) {
     const day = new Date(deps.now()).toISOString().slice(0, 10);
     const bucket = `ip:${(await sha256(`${env.IP_HASH_SALT || "aftertone"}|${day}|${ip}`)).slice(0, 32)}`;
     if (!(await consumeRateBudget(env.DB, bucket, deps.now(), config.ipDaily))) throw new ApiError("今天这台设备的找歌次数已用完，明天再来。你仍然可以试听和收藏。", 429);
    }
    if (modelConfig && modelKey) {
     if (!(await deps.verifyCompatibleKey(modelConfig, modelKey))) throw new ApiError("个人 API 密钥无效或没有权限，请检查后重新填写。", 401);
     if (!(await consumeRateBudget(env.DB, "personal-global", deps.now(), config.personalGlobalDaily))) throw new ApiError("今天个人模型的总轮次已达上限，请明天再试。", 429);
    }
    ensureConnected(request);
    const seed = await deps.getTrack(input.seed.id, input.seed.provider, config.country);
    ensureConnected(request);
    const recalled = await deps.recall(seed, input.excluded, input.direction, request.url, { assets, limit: RECALL_POOL });
    ensureConnected(request);
    const filtered = applyExplicitFilters(recalled.candidates, input.notes);
    const ranked = prerankCandidates(recalled.seed, filtered, input.direction, config.candidateLimit, Math.random, input.avoidArtists);
    const candidates = ranked.candidates;
    const recallMeta = { ...recalled.recallMeta, returnedAfterFilters: filtered.length, prerankPool: ranked.poolCount, prerankExploration: ranked.explorationCount, candidateLimit: config.candidateLimit };
    if (!candidates.length) return respond({ status: "done", jobId: null, tracks: [], modelConfig, credentialMode: modelConfig ? "personal" : "site", progress: { scoredCount: 0, totalCount: 0, completedBatches: 0, totalBatches: 0, elapsedMs: 0 }, meta: { engine: "constraints", candidateCount: 0, actualScoredCount: 0, libraryCount: recalled.libraryCount, requestCount: 0, elapsedMs: 0, wallMs: 0, jevMs: 0, recall: recallMeta } });
    const job = await createJob(env.DB, { ...input, modelConfig, keyFingerprint, seed: recalled.seed, candidates, libraryCount: recalled.libraryCount, recallMeta }, deps.now(), modelConfig ? config.personalDaily : config.siteDaily);
    if (request.signal.aborted) {
     // The transaction may already have committed, but no model work should remain pending.
     if (job) await cancelJob(env.DB, job.id, deps.now());
     ensureConnected(request);
    }
    if (!job) throw new ApiError(modelConfig ? `这把个人密钥今天的 ${config.personalDaily} 轮找歌已用完，请明天再继续。` : `今天全站的 ${config.siteDaily} 轮智能找歌已用完。你仍然可以试听和收藏，或使用个人 API 密钥。`, 429);
    let driver: "server" | "client" = "client";
    if (env.JOB_RUNNER) {
     try {
      const stub = env.JOB_RUNNER.get(env.JOB_RUNNER.idFromName(job.id));
      const started = await stub.fetch("https://job-runner/start", { method: "POST", headers: modelKey ? { "X-Model-Api-Key": modelKey } : {}, body: JSON.stringify({ jobId: job.id }) });
      if (started.status === 202) driver = "server";
     } catch { /* The browser can still drive every step through the same lease. */ }
    }
    return respond({ ...jobView(job, deps.now()), driver }, 201);
   }
   const match = url.pathname.match(/^\/api\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(step|cancel))?$/i);
   if (match) {
    if (!env.DB) throw new ApiError("筛选任务服务暂不可用。", 503);
    let job = await readJob(env.DB, match[1], deps.now());
    if (!job) throw new ApiError("找歌任务不存在或已清理，请重新开始。", 404);
    if (request.method === "GET" && !match[2]) return respond(jobView(job, deps.now()));
    if (request.method === "POST" && match[2] === "cancel") { job = await cancelJob(env.DB, job.id, deps.now()) || job; return respond(jobView(job, deps.now())); }
    if (request.method === "POST" && match[2] === "step") {
     let modelConfig: ModelConfig | null;
     try { modelConfig = jobModelConfig(job, env.MODEL_BASE_URL_ALLOWLIST); } catch { throw new ApiError("个人任务配置不完整，请重新创建任务。", 503); }
     let modelKey: string;
     if (modelConfig) {
      modelKey = personalKey(request);
      if (!sameFingerprint(await fingerprint(modelKey), job.key_fingerprint!)) throw new ApiError("个人密钥与创建这轮任务时不一致，请使用原密钥。", 403);
     } else modelKey = env.TYPESAFE_API_KEY;
     if (job.status !== "pending") return respond(jobView(job, deps.now()), job.status === "running" ? 202 : 200);
     if (!modelKey) throw new ApiError("站点 Jev 暂未连接，本步骤尚未执行。", 503);
     const body = await jsonBody(request, true);
     if (body.step !== undefined && (!Number.isInteger(body.step) || Number(body.step) < 0)) throw new ApiError("步骤编号无效。");
     if (body.step !== undefined && body.step !== job.next_step) return respond(jobView(job, deps.now()));
     const outcome = await runJobStep(env.DB, deps, job, modelKey, modelConfig, request.signal);
     if (outcome.kind === "unconfirmed") throw new ApiError("任务状态暂时无法确认，请查看任务进度；请勿重新创建重复任务。", 503);
     return respond(jobView(outcome.job, deps.now()), outcome.kind === "busy" ? 202 : 200);
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
