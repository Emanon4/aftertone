// Infer discovery groups for artists that the curated collection left without any group.
// Usage: node scripts/infer-artist-groups.mjs [catalog-dir]     (after enrich-albums.mjs)
//
// Votes come from the artist's own tracks: each album genre maps to a group (see GENRE_GROUP), and
// "Asian Music" is split by the writing system of titles and names (Han → mandarin-cantonese,
// kana/Hangul → japan-korea). A group needs at least 30% of the artist's tracks; at most two are kept.
// Results go to `inferredGroups` in artists.json — curated `groups` are never changed.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dir = process.argv[2] || "public/catalog";
const read = file => readFile(path.join(dir, file), "utf8").then(JSON.parse);
const manifest = await read("manifest.json");
if (manifest.version !== 3) throw new Error("needs a v3 catalog");
const artists = await read("artists.json");

const GENRE_GROUP = {
 "Rap/Hip Hop": "hip-hop", "East Coast": "hip-hop", "Dirty South": "hip-hop", "Old School": "hip-hop", "Jazz Hip Hop": "hip-hop", "Grime": "hip-hop", "Electro Hip Hop": "hip-hop",
 "R&B": "soul-rnb", "Soul & Funk": "soul-rnb", "Contemporary R&B": "soul-rnb", "Contemporary Soul": "soul-rnb", "Gospel": "soul-rnb", "Blues": "soul-rnb",
 "Electro": "electronic", "Dance": "electronic", "Techno/House": "electronic", "Disco": "electronic", "Dubstep": "electronic", "Trance": "electronic", "Chill Out/Trip-Hop/Lounge": "electronic", "Electro Pop/Electro Rock": "electronic",
 "Jazz": "jazz", "Instrumental Jazz": "jazz", "Vocal Jazz": "jazz",
 "Country": "folk-country", "Folk": "folk-country", "Bluegrass": "folk-country", "Singer & Songwriter": "folk-country", "Urban Cowboy": "folk-country",
 "Classical": "classical-contemporary", "Film Scores": "classical-contemporary", "Baroque": "classical-contemporary", "Opera": "classical-contemporary", "Classical Period": "classical-contemporary",
 "Latin Music": "brazil-latin", "Brazilian Music": "brazil-latin", "Traditional Mexicano": "brazil-latin", "Reggaeton": "brazil-latin", "Salsa": "brazil-latin", "Tango": "brazil-latin", "Flamenco": "brazil-latin",
 "Bolero": "brazil-latin", "Corridos": "brazil-latin", "Norteño": "brazil-latin", "Banda/Grupero": "brazil-latin", "Cumbia": "brazil-latin", "Ranchera": "brazil-latin", "Tropical": "brazil-latin",
 "Metal": "metal", "Rock": "rock", "Hard Rock": "rock", "Rock & Roll/Rockabilly": "rock",
 "Alternative": "indie", "Indie Rock": "indie", "Indie Pop": "indie", "Indie Rock/Rock Pop": "indie", "Indie Pop/Folk": "indie",
 "Reggae": "reggae", "Dub": "reggae", "Ska": "reggae", "Dancehall/Ragga": "reggae",
 "African Music": "africa-world", "Bollywood": "south-asia-middle-east", "Indian Music": "south-asia-middle-east",
};
export const scriptGroup = text => /[぀-ヿ가-힯ᄀ-ᇿ]/.test(text) ? "japan-korea" : /[㐀-鿿]/.test(text) ? "mandarin-cantonese" : null;
const known = new Set(manifest.collectionGroups);
for (const g of Object.values(GENRE_GROUP)) if (!known.has(g)) throw new Error(`unknown group ${g}`);

const votes = new Map(), totals = new Map();
for (const s of manifest.shards) {
 const shard = await read(s.file);
 for (const [, title, ai, ali] of shard.tracks) {
  if (artists[ai].groups.length) continue;
  totals.set(ai, (totals.get(ai) || 0) + 1);
  const v = votes.get(ai) || new Map(); votes.set(ai, v);
  const add = (g, w) => v.set(g, (v.get(g) || 0) + w);
  const genres = shard.albums[ali][4] || [];
  const script = scriptGroup(`${title} ${artists[ai].name} ${shard.albums[ali][1]}`);
  const mapped = [...new Set(genres.map(g => g === "Asian Music" ? script : GENRE_GROUP[g]).filter(Boolean))];
  for (const g of mapped) add(g, 1 / mapped.length);
  if (script && !mapped.includes(script)) add(script, 0.5);   // Writing system alone is a weaker cue.
 }
}
let inferred = 0;
const next = artists.map((a, i) => {
 const rest = { ...a }; delete rest.inferredGroups;   // Re-runs start from curated data only.
 const v = votes.get(i);
 if (!v) return rest;
 const groups = [...v].filter(([, n]) => n / totals.get(i) >= 0.3).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([g]) => g);
 if (!groups.length) return rest;
 inferred++;
 return { ...rest, inferredGroups: groups };
});
await writeFile(path.join(dir, "artists.json"), JSON.stringify(next));
const empty = artists.filter(a => !a.groups.length).length;
await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, inferredArtistGroups: { method: "album genres + writing system, >=30% of tracks, max 2", artistsWithoutCurated: empty, inferred } }, null, 1));
console.log(`${empty} artists had no curated group; inferred groups for ${inferred}`);
