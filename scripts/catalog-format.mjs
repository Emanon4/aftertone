// Shared by the catalog scripts: expand compact v3 shards back into Track objects.
// The Worker has its own typed copy in lib/server/catalog.ts (expandCompactShard).
export function expandCompactShard(shard, artists, groups) {
 return shard.tracks.map(([id, title, ai, ali, duration, mask, preview]) => {
  const [albumId, album, cover, year, genres] = shard.albums[ali], artist = artists[ai];
  return { id, provider: "deezer", title, artist: artist.name, artistId: artist.id, album,
   image: `https://cdn-images.dzcdn.net/images/cover/${cover}/500x500-000000-80-0-0.jpg`, url: `https://www.deezer.com/track/${id}`,
   duration, previewAvailable: preview === 1, collectionGroups: groups.filter((_, bit) => mask & (1 << bit)), albumId,
   ...(year ? { year } : {}), ...(genres?.length ? { genre: genres.join(", ") } : {}) };
 });
}
