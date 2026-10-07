// Convert a v2 catalog (part-NNN.json of full track objects) into the compact v3 format.
// Usage: node scripts/compact-catalog.mjs [catalog-dir]      (default public/catalog, in place)
//
// v3 shard: { "albums": [[albumId, title, coverHash, year|null, genres|null], ...],
//             "tracks": [[id, title, artistIndex, albumIndex, duration, groupMask, previewable], ...] }
// - artistIndex points into artists.json (unchanged), groupMask bits follow manifest.collectionGroups.
// - Image and track URLs are rebuilt from the cover hash / id; only Deezer rows are supported.
// Every converted row is expanded again and compared with the source before anything is written.
import { readFile, readdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { expandCompactShard } from "./catalog-format.mjs";

const dir = process.argv[2] || "public/catalog";
const read = file => readFile(path.join(dir, file), "utf8").then(JSON.parse);
const manifest = await read("manifest.json");
if (manifest.version !== 2) throw new Error(`expected a v2 catalog, found version ${manifest.version}`);
const artists = await read("artists.json");
const artistIndex = new Map(artists.map((a, i) => [a.id, i]));
const groups = manifest.collectionGroups;
if (!Array.isArray(groups) || groups.length > 30) throw new Error("collectionGroups must list at most 30 groups");
const COVER = /^https:\/\/cdn-images\.dzcdn\.net\/images\/cover\/([0-9a-f]{32})\/500x500-000000-80-0-0\.jpg$/;

const mask = list => list.reduce((m, g) => { const bit = groups.indexOf(g); if (bit < 0) throw new Error(`unknown group ${g}`); return m | (1 << bit); }, 0);
const expand = shard => expandCompactShard(shard, artists, groups);
const comparable = t => JSON.stringify({ ...t, collectionGroups: [...t.collectionGroups].sort() }, Object.keys(t).sort());

const out = [];
for (const [n, shard] of manifest.shards.entries()) {
 const rows = await read(shard.file);
 const albums = [], albumIndex = new Map(), tracks = [];
 for (const t of rows) {
  const cover = t.image.match(COVER)?.[1];
  if (t.provider !== "deezer" || !cover || t.url !== `https://www.deezer.com/track/${t.id}` || !artistIndex.has(t.artistId) || artists[artistIndex.get(t.artistId)].name !== t.artist)
   throw new Error(`row ${t.id} in ${shard.file} does not fit the compact format`);
  const key = `${t.albumId}|${t.album}|${cover}`;
  if (!albumIndex.has(key)) { albumIndex.set(key, albums.length); albums.push([t.albumId, t.album, cover, null, null]); }
  tracks.push([t.id, t.title, artistIndex.get(t.artistId), albumIndex.get(key), t.duration, mask(t.collectionGroups), t.previewAvailable ? 1 : 0]);
 }
 const compact = { albums, tracks };
 const back = expand(compact);
 if (back.length !== rows.length || back.some((t, i) => comparable(t) !== comparable(rows[i]))) throw new Error(`round trip mismatch in ${shard.file}`);
 out.push({ file: `shard-${String(n).padStart(3, "0")}.json`, count: tracks.length, groups: shard.groups, compact, source: shard.file });
}
// Remove shards left from a previous, larger conversion before writing the new set.
for (const name of await readdir(dir)) if (/^shard-\d{3,6}\.json$/.test(name)) await rm(path.join(dir, name));
for (const s of out) await writeFile(path.join(dir, s.file), JSON.stringify(s.compact));
await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, version: 3, format: "compact-v3", shards: out.map(({ file, count, groups: g }) => ({ file, count, groups: g })) }, null, 1));
for (const s of out) await rm(path.join(dir, s.source));
console.log(`converted ${out.length} shards, ${out.reduce((n, s) => n + s.count, 0)} tracks`);
