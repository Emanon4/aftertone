import type { Track } from "../music";
import { clean } from "./recall";
import type { Direction } from "./recommend";

/**
 * Cheap metadata pre-ranking before paid model scoring.
 * The recall pool can hold thousands of mostly unlabelled index rows; scoring all of them with a
 * model costs tokens without adding evidence. This keeps the best-supported candidates plus a
 * fixed exploration share, so the model only scores a few hundred songs per round.
 */
export const DEFAULT_CANDIDATE_LIMIT = 600;
const EXPLORATION_SHARE: Record<Direction, number> = { close: 0.1, sideways: 0.2, bold: 0.35 };
const SOURCE_WEIGHT: Record<Direction, Record<string, number>> = {
 close: { "艺术家电台": 3, "关联艺术家": 2.5, "曲库关联探索": 1.5, "曲库邻近探索": 1 },
 sideways: { "艺术家电台": 2, "关联艺术家": 2.5, "曲库关联探索": 1.5, "曲库邻近探索": 1.2 },
 bold: { "艺术家电台": 1, "关联艺术家": 1.5, "曲库关联探索": 1.2, "曲库邻近探索": 1.4 },
};
const OVERLAP_WEIGHT: Record<Direction, number> = { close: 2, sideways: 1.6, bold: 0.8 };

export const trackTags = (t: Track) => [
 ...[t.genre || "", ...(t.artistGenres || [])].flatMap(g => g.split(",")).map(clean).filter(Boolean).map(g => `genre:${g}`),
 ...(t.collectionGroups || []).map(g => `collection:${clean(g)}`),
];

export type PrerankResult = { candidates: Track[]; poolCount: number; explorationCount: number };

export function prerankScore(track: Track, seed: Track, seedTags: Set<string>, direction: Direction): number {
 let score = SOURCE_WEIGHT[direction][track.source || ""] ?? 0;
 const tags = trackTags(track);
 if (tags.length) score += OVERLAP_WEIGHT[direction] * tags.filter(tag => seedTags.has(tag)).length / Math.sqrt(tags.length);
 const seedYear = Number(seed.year), year = Number(track.year);
 if (seedYear && year) score += Math.exp(-Math.abs(seedYear - year) / 8);
 if (seed.bpm && track.bpm) score += 0.5 * Math.exp(-Math.abs(seed.bpm - track.bpm) / 20);
 return score;
}

export function prerankCandidates(seed: Track, pool: Track[], direction: Direction, limit = DEFAULT_CANDIDATE_LIMIT, random: () => number = Math.random, avoidArtists: string[] = []): PrerankResult {
 const avoided = new Set(avoidArtists.map(clean).filter(Boolean));
 const usable = avoided.size ? pool.filter(t => !avoided.has(clean(t.artist))) : pool;
 if (usable.length <= limit) return { candidates: usable, poolCount: usable.length, explorationCount: 0 };
 const seedTags = new Set([...trackTags(seed), ...(seed.relatedArtistAlbumGenres || []).map(g => `genre:${clean(g)}`)]);
 // A small jitter breaks ties between equally (un)documented rows without dominating evidence.
 const ranked = usable.map(t => ({ t, s: prerankScore(t, seed, seedTags, direction) + random() * 0.5 })).sort((a, b) => b.s - a.s);
 const explorationCount = Math.round(limit * EXPLORATION_SHARE[direction]);
 const perArtist = new Map<string, number>(), artistCap = Math.max(3, Math.ceil(limit / 120));
 const picked: Track[] = [], rest: Track[] = [];
 for (const { t } of ranked) {
  const artist = clean(t.artist), count = perArtist.get(artist) || 0;
  if (picked.length < limit - explorationCount && count < artistCap) { picked.push(t); perArtist.set(artist, count + 1); }
  else rest.push(t);
 }
 // Exploration is sampled from everything not picked, so lesser-documented songs keep a chance.
 for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
 const exploration = rest.slice(0, limit - picked.length);
 return { candidates: [...picked, ...exploration], poolCount: usable.length, explorationCount: exploration.length };
}
