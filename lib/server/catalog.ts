import type { Track } from "../music";
import legacyManifest from "../../data/library-manifest.json";
import { clean, selectCandidatePool } from "./recall";

export type CatalogManifest = {
 version: number; tracks: number; artists: number; previewable: number; collectedAt: string;
 shards?: { file: string; count: number; groups: string[] }[];
};
export type AssetReader = { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
export type CatalogOptions = { assets?: AssetReader; limit?: number; maxRows?: number; random?: () => number };
export const libraryStats = { tracks: legacyManifest.tracks, artists: legacyManifest.artists, previewable: legacyManifest.previewable, collectedAt: legacyManifest.collectedAt };
const MAX_ROWS = 20_000;
async function readJson(response: Response, maxBytes = 4_000_000): Promise<unknown> {
 if (!response.ok) throw new Error("歌曲索引暂时无法加载，请稍后重试。");
 const reader = response.body?.getReader();
 if (!reader) throw new Error("歌曲索引内容为空。");
 let bytes = 0, text = ""; const decoder = new TextDecoder();
 try { while (true) { const { done, value } = await reader.read(); if (done) break;
  bytes += value.length; if (bytes > maxBytes) { await reader.cancel(); throw new Error("歌曲索引分片超过大小限制。"); }
  text += decoder.decode(value, { stream: true });
 } } finally { reader.releaseLock(); }
 return JSON.parse(text + decoder.decode());
}
const assetFetch = (path: string, requestUrl: string, assets?: AssetReader) => assets ? assets.fetch(new URL(path, requestUrl)) : fetch(new URL(path, requestUrl));
export async function getLibraryManifest(requestUrl = "http://localhost", assets?: AssetReader): Promise<CatalogManifest> {
 const response = await assetFetch("/catalog/manifest.json", requestUrl, assets);
 if (response.status === 404) return { version: 1, ...libraryStats };
 const value = await readJson(response, 1_000_000) as CatalogManifest;
 if (value.version !== 2 || !Number.isInteger(value.tracks) || value.tracks < 0 || !Array.isArray(value.shards)
  || value.shards.some(s => !/^part-\d{3,6}\.json$/.test(s.file) || !Number.isInteger(s.count) || s.count < 0 || s.count > MAX_ROWS || !Array.isArray(s.groups))) {
  throw new Error("歌曲索引清单无效，请稍后重试。");
 }
 return value;
}
function shuffled<T>(items: T[], random: () => number): T[] {
 const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy;
}
export async function loadLibrarySample(seed: Track, requestUrl: string, options: CatalogOptions = {}) {
 const manifest = await getLibraryManifest(requestUrl, options.assets);
 const maxRows = Math.min(MAX_ROWS, Math.max(1, options.maxRows || MAX_ROWS));
 const random = options.random || Math.random;
 if (manifest.version === 1) {
  const value = await readJson(await assetFetch("/catalog/library.json", requestUrl, options.assets), 16_000_000);
  if (!Array.isArray(value)) throw new Error("歌曲索引格式无效。");
  const tracks = (value as Track[]).slice(0, maxRows);
  return { seed, tracks, manifest, shardsRead: 1, rowsScanned: tracks.length };
 }
 const artistsResponse = await assetFetch("/catalog/artists.json", requestUrl, options.assets);
 const artists = await readJson(artistsResponse, 3_000_000) as { id: string; name: string; groups: string[] }[];
 if (!Array.isArray(artists)) throw new Error("艺术家索引格式无效。");
 const entry = artists.find(a => clean(a.name) === clean(seed.artist));
 seed = { ...seed, collectionGroups: [...new Set([...(seed.collectionGroups || []), ...(entry?.groups || [])])] };
 const groups = new Set(seed.collectionGroups || []);
 const preferred = shuffled(manifest.shards!.filter(s => s.groups.some(g => groups.has(g))), random);
 const global = shuffled(manifest.shards!, random);
 const selected: NonNullable<CatalogManifest["shards"]> = [];
 const seen = new Set<string>(); let expectedRows = 0;
 // Alternate a relevant shard with an independently shuffled global shard.
 for (let i = 0; i < Math.max(preferred.length, global.length) && selected.length < 10; i++) {
  for (const shard of [preferred[i], global[i]]) {
   if (!shard || seen.has(shard.file) || expectedRows + shard.count > maxRows || selected.length >= 10) continue;
   seen.add(shard.file); selected.push(shard); expectedRows += shard.count;
  }
 }
 const tracks: Track[] = [];
 for (const shard of selected) {
  const value = await readJson(await assetFetch(`/catalog/${shard.file}`, requestUrl, options.assets));
  if (!Array.isArray(value) || value.length !== shard.count) throw new Error("歌曲索引正在更新，请稍后重试。");
  tracks.push(...value as Track[]);
 }
 return { seed, tracks, manifest, shardsRead: selected.length, rowsScanned: tracks.length };
}

type Raw = {
 id: string | number; name: string; title: string; duration: number; readable?: boolean;
 artist: Raw; album?: Raw; cover_big?: string; cover_medium?: string; link?: string;
 preview?: string; isrc?: string; release_date?: string; bpm?: number;
 genres?: { data: Raw[] }; data?: Raw[]; error?: unknown; results: Raw[];
 trackId: string | number; trackName: string; artistName: string; artistId: string | number;
 collectionName?: string; artworkUrl100?: string; trackViewUrl: string; trackTimeMillis: number;
 previewUrl?: string; primaryGenreName?: string; releaseDate?: string; kind?: string;
};
const cache = new Map<string, { expires: number; data: Raw }>();
export async function providerFetch(url: string, ttl = 300_000): Promise<Raw> {
 const prior = cache.get(url); if (prior && prior.expires > Date.now()) return prior.data;
 const response = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json" } });
 if (!response.ok) throw new Error("音乐资料服务暂时无法连接，请稍后重试。");
 const data = await readJson(response, 2_000_000) as Raw;
 if (data.error) throw new Error("暂时无法取得这首歌的资料，请换一首试试。");
 if (ttl) { if (cache.size > 350) cache.clear(); cache.set(url, { expires: Date.now() + ttl, data }); }
 return data;
}
export const deezer = (path: string, ttl?: number) => providerFetch(`https://api.deezer.com/${path}`, ttl);
export function normalizeDeezer(t: Raw, source?: string): Track {
 return { id: String(t.id), provider: "deezer", title: t.title, artist: t.artist.name, artistId: String(t.artist.id), album: t.album?.title || "", albumId: t.album?.id ? String(t.album.id) : undefined, image: t.album?.cover_big || t.album?.cover_medium || "", url: t.link || `https://www.deezer.com/track/${t.id}`, duration: t.duration, preview: t.preview || undefined, previewAvailable: !!t.preview && t.readable !== false, isrc: t.isrc, year: t.release_date?.slice(0, 4), bpm: (t.bpm || 0) > 0 ? t.bpm : undefined, source };
}
function normalizeApple(t: Raw): Track {
 return { id: String(t.trackId), provider: "itunes", country: "SG", title: t.trackName, artist: t.artistName, artistId: String(t.artistId), album: t.collectionName || "", image: t.artworkUrl100?.replace("100x100bb", "600x600bb") || "", url: t.trackViewUrl, duration: Math.round(t.trackTimeMillis / 1000), preview: t.previewUrl, genre: t.primaryGenreName, year: t.releaseDate?.slice(0, 4) };
}
export async function searchSongs(query: string): Promise<Track[]> {
 const calls = [deezer(`search?q=${encodeURIComponent(query)}&limit=16`).then(x => (x.data || []).filter((t: Raw) => t.readable !== false).map((t: Raw) => normalizeDeezer(t)))];
 if (/[\u3400-\u9fff]/.test(query)) calls.push(providerFetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=12&country=SG`, 60_000).then(x => x.results.filter((t: Raw) => t.kind === "song").map(normalizeApple)));
 const results = await Promise.allSettled(calls); const tracks = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
 if (!tracks.length && results.every(r => r.status === "rejected")) throw new Error("搜歌服务暂时不可用，请稍后重试。");
 const seen = new Set<string>(); return tracks.filter(t => { const k = clean(t.title) + "|" + clean(t.artist); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
}
export async function getTrack(id: string, provider = "deezer"): Promise<Track> {
 if (!/^\d{1,18}$/.test(id)) throw new Error("歌曲编号无效。");
 if (provider === "itunes") { const x = await providerFetch(`https://itunes.apple.com/lookup?id=${id}&country=SG`, 0); if (!x.results?.[0]?.trackId) throw new Error("这首歌目前无法取得，请重新搜索。"); return normalizeApple(x.results[0]); }
 return normalizeDeezer(await deezer(`track/${id}`, 0));
}
async function enrichSeed(seed: Track): Promise<Track> {
 if (!seed.albumId || seed.provider !== "deezer") return seed;
 try { const album = await deezer(`album/${seed.albumId}`, 3600_000); return { ...seed, genre: album.genres?.data?.map((g: Raw) => g.name).join(", ") || seed.genre, year: album.release_date?.slice(0, 4) || seed.year }; }
 catch { return seed; }
}
export async function recall(seed: Track, excluded: string[], direction = "close", requestUrl = "http://localhost", options: CatalogOptions = {}) {
 const loaded = await loadLibrarySample(seed, requestUrl, options);
 seed = await enrichSeed(loaded.seed);
 let artistId = seed.provider === "deezer" ? seed.artistId : undefined;
 if (!artistId) { try { const data = await deezer(`search/artist?q=${encodeURIComponent(seed.artist)}&limit=5`); const match = data.data?.find((a: Raw) => clean(a.name) === clean(seed.artist)); artistId = match ? String(match.id) : undefined; } catch { /* The local index remains available. */ } }
 const live: Track[] = [];
 if (artistId) {
  const [radio, related] = await Promise.allSettled([deezer(`artist/${artistId}/radio?limit=80`), deezer(`artist/${artistId}/related?limit=3`)]);
  if (radio.status === "fulfilled") live.push(...(radio.value.data || []).filter((t: Raw) => t.readable !== false).map((t: Raw) => normalizeDeezer(t, "艺术家电台")));
  if (related.status === "fulfilled") await Promise.all((related.value.data || []).slice(0, 3).map(async (a: Raw) => {
   try { const data = await deezer(`artist/${a.id}/top?limit=12`); live.push(...(data.data || []).filter((t: Raw) => t.readable !== false).map((t: Raw) => normalizeDeezer(t, "关联艺术家"))); } catch { /* Missing provider data stays unknown. */ }
  }));
 }
 const candidates = selectCandidatePool(seed, loaded.tracks, live, excluded, direction, options.limit || 5000, options.random);
 if (!candidates.length) throw new Error("这一方向暂时没有新的可试听歌曲，试试另一个起点。");
 return { seed, candidates, libraryCount: loaded.manifest.tracks, recallMeta: { targetCount: options.limit || 5000, rowsScanned: loaded.rowsScanned, shardsRead: loaded.shardsRead, returnedCount: candidates.length, scope: "bounded-index-sample-and-live-relations" } };
}
