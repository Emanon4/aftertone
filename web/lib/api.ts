import type { Track } from "@/lib/music";

export type Direction = "close" | "sideways" | "bold";
export type Progress = { scoredCount: number; totalCount: number; completedBatches: number; totalBatches: number; elapsedMs: number };
export type JobMeta = { candidateCount?: number; wallMs?: number; elapsedMs?: number; model?: string; recall?: { prerankPool?: number } };
export type JobData = {
 error?: string; jobId?: string | null; status?: string; nextStep?: number; totalSteps?: number; progress?: Progress;
 tracks?: Track[]; retryAfterMs?: number; meta?: JobMeta; driver?: "server" | "client";
};
export type LibraryInfo = {
 tracks: number; artists: number; previewable: number; candidateLimit?: number; recallPool?: number;
 available?: boolean; byokAvailable?: boolean; serverDriven?: boolean; turnstileSiteKey?: string | null;
 quota?: { siteDaily: number; personalDaily: number; ipDaily: number };
};

const apiBase = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
export const api = (path: string) => apiBase + path;
/** A production build without an API shows the listening room only and never calls a missing service. */
export const previewOnly = import.meta.env.PROD && !apiBase;

export class ApiResponseError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function parseResponse<T>(response: Response): Promise<T> {
 const type = response.headers.get("content-type") || "";
 if (!type.includes("json")) throw new ApiResponseError("筛选服务暂未连接，稍后再试。你仍可以打开音乐平台收听。", response.status);
 const data = await response.json() as T & { error?: string };
 if (!response.ok) throw new ApiResponseError(data.error || "音乐服务暂时不可用。", response.status);
 return data;
}

export const getJson = <T,>(path: string, signal?: AbortSignal) => fetch(api(path), { signal }).then(r => parseResponse<T>(r));
export const postJson = <T,>(path: string, body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }, signal?: AbortSignal) =>
 fetch(api(path), { method: "POST", headers, body: JSON.stringify(body), signal }).then(r => parseResponse<T>(r));

export const cancelJob = (id: string, keepalive = false) =>
 // A body-less POST stays a CORS "simple" request, so it also works with keepalive on page close.
 fetch(api(`/api/jobs/${encodeURIComponent(id)}/cancel`), { method: "POST", keepalive }).catch(() => undefined);

export const searchTracks = (q: string, signal?: AbortSignal) => getJson<{ tracks: Track[] }>(`/api/music?q=${encodeURIComponent(q.trim())}`, signal).then(d => d.tracks);
export const lookupTrack = (t: Pick<Track, "id" | "provider">) => getJson<{ track: Track }>(`/api/music?id=${encodeURIComponent(t.id)}&provider=${t.provider}`).then(d => d.track);
