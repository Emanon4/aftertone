// Does metadata pre-ranking (default 600) lose songs the model would have picked from the full pool?
//
// Each model question sees only its own candidate plus shared listener state, so one scoring of the
// full recall pool is enough: the "pre-ranked" result is the same scores restricted to the subset.
//
// Usage:
//   TYPESAFE_API_KEY=... node scripts/compare-prerank.mjs --seeds 8 --pool 5000 --limit 600
//   node scripts/compare-prerank.mjs --dry-run            # deterministic fake scores, no model calls
// Writes output/prerank-comparison.json. Live recall calls Deezer for artist radio and related artists.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dryRun = args.includes("--dry-run");
const seedsWanted = Number(opt("seeds", "8")), poolSize = Number(opt("pool", "5000")), limit = Number(opt("limit", "600"));
const directions = opt("directions", "close").split(",");   // each extra direction repeats the full-pool scoring
const key = process.env.TYPESAFE_API_KEY;
if (!dryRun && !key) throw new Error("set TYPESAFE_API_KEY, or pass --dry-run");

const bundle = await build({ stdin: { contents: 'export * from "./lib/server/catalog.ts";export * from "./lib/server/prerank.ts";export * from "./lib/server/recommend.ts";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false });
const { recall, prerankCandidates, rankWithJev, selectTracks } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const catalogDir = path.resolve("public/catalog");
const assets = { fetch: async input => { const name = new URL(String(input)).pathname.replace(/^\/catalog\//, ""); try { return new Response(await readFile(path.join(catalogDir, name))); } catch { return new Response(null, { status: 404 }); } } };
const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// Fixed, varied seeds (looked up live so the provider IDs are current).
const SEEDS = ["Men I Trust Show Me How", "Radiohead No Surprises", "周杰伦 晴天", "Lamp 恋人へ", "Sade Kiss of Life", "Khruangbin Friday Morning", "Fela Kuti Water No Get Enemy", "Bill Evans Waltz for Debby", "Daft Punk Digital Love", "Sufjan Stevens Chicago", "Cocteau Twins Heaven or Las Vegas", "Bad Bunny Tití Me Preguntó"].slice(0, seedsWanted);
async function findSeed(query) {
 const data = await (await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`)).json();
 const t = data.data?.[0];
 if (!t) return null;
 return { id: String(t.id), provider: "deezer", title: t.title, artist: t.artist.name, artistId: String(t.artist.id), album: t.album?.title || "", albumId: String(t.album?.id || ""), image: "", url: t.link, duration: t.duration, previewAvailable: Boolean(t.preview) };
}

const fakeScore = id => (parseInt(createHash("sha1").update(id).digest("hex").slice(0, 6), 16) % 1000) / 1000 * 3;
async function scoreAll(seed, pool, direction) {
 const scores = new Map();
 const fetcher = async (url, init) => {
  const body = JSON.parse(init.body);
  if (dryRun) {
   const answers = Object.fromEntries(Object.keys(body.questions).map(q => [q, { type: "score", score: fakeScore(q), confidence: 1 }]));
   for (const [q, a] of Object.entries(answers)) scores.set(q.replace(/^fit_/, ""), a.score);
   return Response.json({ model: "dry-run", usage: { input_tokens: 0, output_tokens: 0 }, answers });
  }
  const response = await fetch(url, init);
  const copy = response.clone();
  try { const data = await copy.json(); for (const [q, a] of Object.entries(data.answers || {})) if (q.startsWith("fit_")) scores.set(q.slice(4), a.score); } catch { /* Scoring itself reports failures. */ }
  return response;
 };
 const result = await rankWithJev(seed, pool, direction, "", key || "dry-run", { liked: [], disliked: [] }, { fetcher, concurrency: 4 });
 return { scores, usage: result.usage, wallMs: result.wallMs };
}

const id = t => `${t.provider}_${t.id}`;
const pick = (tracks, scores, seed, direction) => selectTracks(tracks.map(t => ({ ...t, score: scores.get(id(t)) ?? 0 })).filter(t => t.score >= 1.5), seed, direction);
const report = [];
for (const query of SEEDS) {
 const seed = await findSeed(query);
 if (!seed) { console.log(`skip ${query}: not found`); continue; }
 for (const direction of directions) {
  const random = mulberry([...query].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7));
  const recalled = await recall(seed, [], direction, "http://catalog.local", { assets, limit: poolSize, random });
  const pool = recalled.candidates;
  const subset = prerankCandidates(recalled.seed, pool, direction, limit, random).candidates;
  const { scores, usage, wallMs } = await scoreAll(recalled.seed, pool, direction);
  const full = pick(pool, scores, recalled.seed, direction), pre = pick(subset, scores, recalled.seed, direction);
  const subsetIds = new Set(subset.map(id)), preIds = new Set(pre.map(id));
  const mean = list => list.length ? list.reduce((n, t) => n + t.score, 0) / list.length : 0;
  const row = { seed: `${seed.artist} — ${seed.title}`, direction, pool: pool.length, subset: subset.length,
   fullPicked: full.length, prePicked: pre.length,
   overlap: full.filter(t => preIds.has(id(t))).length,                 // same songs in both final lists
   fullTopKeptByPrerank: full.filter(t => subsetIds.has(id(t))).length, // full-pool favourites that survived pre-ranking
   meanScoreFull: +mean(full).toFixed(3), meanScorePre: +mean(pre).toFixed(3),
   qualifiedFull: pool.filter(t => (scores.get(id(t)) ?? 0) >= 1.5).length, qualifiedInSubset: subset.filter(t => (scores.get(id(t)) ?? 0) >= 1.5).length,
   inputTokens: usage.input_tokens, wallMs };
 report.push(row);
 console.log(JSON.stringify(row));
 }
}
const avg = k => +(report.reduce((n, r) => n + r[k], 0) / Math.max(1, report.length)).toFixed(3);
const summary = { runs: report.length, dryRun, limit, poolSize, meanOverlapOf14: avg("overlap"), meanFullTopKept: avg("fullTopKeptByPrerank"), meanScoreFull: avg("meanScoreFull"), meanScorePre: avg("meanScorePre"), totalInputTokens: report.reduce((n, r) => n + r.inputTokens, 0) };
await mkdir("output", { recursive: true });
await writeFile("output/prerank-comparison.json", JSON.stringify({ generatedAt: new Date().toISOString(), summary, runs: report }, null, 2));
console.log("summary", JSON.stringify(summary));
