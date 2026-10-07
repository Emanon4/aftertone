// Fill album year and genres in the compact v3 catalog from Deezer's public /album endpoint.
// Usage:
//   node scripts/enrich-albums.mjs --sample 200            # fetch a random sample, report coverage, change nothing
//   node scripts/enrich-albums.mjs --rate 5                # fetch every missing album, then write the shards
//   node scripts/enrich-albums.mjs --apply-only            # write shards from the cache without fetching
// Responses are cached in output/album-cache.json, so an interrupted run resumes where it stopped.
// Only release year and genre names are kept: no audio, previews or other album fields.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes(`--${name}`);
const dir = opt("catalog", "public/catalog");
const cacheFile = opt("cache", "output/album-cache.json");
const rate = Math.min(8, Math.max(1, Number(opt("rate", "5"))));   // Deezer allows 50 requests / 5 s; stay well below.
const sample = Number(opt("sample", "0"));
const applyOnly = flag("apply-only");

const read = file => readFile(path.join(dir, file), "utf8").then(JSON.parse);
const manifest = await read("manifest.json");
if (manifest.version !== 3) throw new Error("run scripts/compact-catalog.mjs first (needs a v3 catalog)");
const shards = await Promise.all(manifest.shards.map(s => read(s.file)));
let cache = {};
try { cache = JSON.parse(await readFile(cacheFile, "utf8")); } catch { /* First run. */ }
const saveCache = async () => { await mkdir(path.dirname(cacheFile), { recursive: true }); await writeFile(`${cacheFile}.tmp`, JSON.stringify(cache)); await rename(`${cacheFile}.tmp`, cacheFile); };

const albumIds = [...new Set(shards.flatMap(s => s.albums.map(a => a[0])))];
let todo = albumIds.filter(id => !(id in cache));
if (sample) todo = todo.sort(() => Math.random() - 0.5).slice(0, sample);
console.log(`${albumIds.length} albums, ${albumIds.length - albumIds.filter(id => !(id in cache)).length} cached, fetching ${applyOnly ? 0 : todo.length} at ${rate}/s`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchAlbum(id, attempt = 0) {
 const response = await fetch(`https://api.deezer.com/album/${id}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
 const data = await response.json();
 // Deezer reports its quota with HTTP 200 and error code 4: back off and retry.
 if (data?.error?.code === 4 && attempt < 5) { await sleep(5_000 * (attempt + 1)); return fetchAlbum(id, attempt + 1); }
 if (data?.error) return null;   // Removed or unavailable albums stay unknown.
 const year = /^\d{4}/.test(data.release_date || "") && data.release_date !== "0000-00-00" ? data.release_date.slice(0, 4) : null;
 const genres = Array.isArray(data.genres?.data) ? [...new Set(data.genres.data.map(g => String(g.name || "").trim()).filter(Boolean))].slice(0, 4) : [];
 return { year, genres };
}

if (!applyOnly) {
 // A few requests in flight, but starts are paced so the overall rate never exceeds --rate.
 let done = 0, failed = 0, next = 0, lastSave = Date.now(), nextStart = Date.now();
 const pace = async () => { const wait = nextStart - Date.now(); nextStart = Math.max(Date.now(), nextStart) + 1000 / rate; if (wait > 0) await sleep(wait); };
 await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < todo.length) {
   const id = todo[next++];
   await pace();
   try { cache[id] = await fetchAlbum(id); } catch { failed++; }
   done++;
   if (Date.now() - lastSave > 15_000) { lastSave = Date.now(); await saveCache(); process.stdout.write(`\r${done}/${todo.length} fetched, ${failed} failed`); }
  }
 }));
 await saveCache();
 console.log(`\n${done} fetched, ${failed} network failures (retried on the next run)`);
}

const known = albumIds.filter(id => cache[id]);
const pct = n => `${(n / Math.max(1, sample ? todo.length : albumIds.length) * 100).toFixed(1)}%`;
const pool = sample ? todo.filter(id => id in cache) : albumIds;
const withYear = pool.filter(id => cache[id]?.year).length, withGenre = pool.filter(id => cache[id]?.genres?.length).length;
console.log(`coverage${sample ? " (sample)" : ""}: year ${withYear} (${pct(withYear)}), genre ${withGenre} (${pct(withGenre)}), cached albums ${known.length}/${albumIds.length}`);
if (sample) { console.log("sample run: catalog unchanged"); process.exit(0); }

let filled = 0;
for (const shard of shards) for (const album of shard.albums) {
 const hit = cache[album[0]];
 if (!hit) continue;
 album[3] = hit.year; album[4] = hit.genres.length ? hit.genres : null; filled++;
}
for (const [i, s] of manifest.shards.entries()) await writeFile(path.join(dir, s.file), JSON.stringify(shards[i]));
const years = shards.reduce((n, s) => n + s.albums.filter(a => a[3]).length, 0), genres = shards.reduce((n, s) => n + s.albums.filter(a => a[4]).length, 0);
await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, albumMetadata: { source: "Deezer /album release_date and genres", enrichedAt: new Date().toISOString(), albums: shards.reduce((n, s) => n + s.albums.length, 0), withYear: years, withGenre: genres } }, null, 1));
console.log(`wrote ${filled} album entries into ${shards.length} shards`);
