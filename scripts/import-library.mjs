import { readFile, writeFile, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Run from the destination project, or an empty temporary directory for validation.
// Copy public metadata only: audio and signed preview URLs never enter the index.
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-library.mjs /path/to/collection');
const SHARD_SIZE = 2000, MIN_TRACKS = 1000;
// Keep punctuation and version suffixes: normalize identity without guessing recording equivalence.
const clean = value => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const unique = values => [...new Set(values)];

async function optionalJson(file, fallback) {
  try { return JSON.parse(await readFile(path.join(input, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function id(value, field) {
  if ((typeof value !== 'string' && typeof value !== 'number')
    || (typeof value === 'number' && !Number.isSafeInteger(value))
    || !/^[1-9]\d{0,17}$/.test(String(value))) throw new Error(`Invalid ${field}`);
  return String(value);
}
function text(value, field, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`Missing ${field}`);
    return '';
  }
  if (typeof value !== 'string' || (required && !value.trim())) throw new Error(`Invalid ${field}`);
  return value.trim();
}
function strings(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid ${field}`);
  return unique(value.map(item => text(item, field, true)));
}
function officialUrl(value, field, trackId) {
  let url;
  try { url = new URL(text(value, field, true)); }
  catch { throw new Error(`Invalid ${field}`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error(`Invalid ${field}: expected an official HTTP(S) URL`);
  }
  if (field === 'track URL') {
    if (!['deezer.com', 'www.deezer.com'].includes(url.hostname)
      || !new RegExp(`^/(?:[a-z]{2}(?:-[a-z]{2})?/)?track/${trackId}/?$`, 'i').test(url.pathname)) {
      throw new Error('Invalid track URL: provider host or track ID does not match');
    }
  } else {
    const cdn = ['cdn-images.dzcdn.net', 'e-cdns-images.dzcdn.net'].includes(url.hostname)
      && /^\/images\/cover\/[a-z0-9]+\//i.test(url.pathname);
    const api = url.hostname === 'api.deezer.com'
      && /^\/album\/[1-9]\d{0,17}\/image(?:\/(?:small|medium|big|xl))?\/?$/.test(url.pathname);
    if (!cdn && !api) throw new Error('Invalid image URL: expected an official Deezer cover');
  }
  url.search = ''; url.hash = '';
  return url.href;
}

const [rawText, artistData, sourceManifest, snapshotManifest] = await Promise.all([
  readFile(path.join(input, 'tracks.json'), 'utf8'),
  optionalJson('artists.json', null), optionalJson('manifest.json', {}), optionalJson('catalog-manifest.json', {}),
]);
const raw = JSON.parse(rawText);
if (!Array.isArray(raw)) throw new Error('tracks.json must contain an array');
if (snapshotManifest.snapshotTracksSha256 !== undefined
  && createHash('sha256').update(rawText).digest('hex') !== snapshotManifest.snapshotTracksSha256) {
  throw new Error('Snapshot checksum mismatch: finish packaging the collection before importing');
}
if (snapshotManifest.snapshotTrackCount !== undefined && snapshotManifest.snapshotTrackCount !== raw.length) {
  throw new Error('Snapshot track count does not match tracks.json');
}
const sourceArtists = artistData ?? sourceManifest.artists ?? [];
const artistRows = Array.isArray(sourceArtists) ? sourceArtists : Object.values(sourceArtists);
const artistGroups = new Map();
for (const artist of artistRows) {
  const artistId = id(artist.id, 'source artist ID');
  const groups = strings(artist.collectionGroups ?? artist.discoveryCategories ?? artist.groups, 'artist groups');
  artistGroups.set(artistId, unique([...(artistGroups.get(artistId) || []), ...groups]));
}

const byId = new Map(), byRecording = new Map();
for (const [index, source] of raw.entries()) {
  try {
    if (!source || source.provider !== 'deezer') throw new Error('Invalid provider');
    const trackId = id(source.id, 'track ID'), artistId = id(source.artistId, 'artist ID');
    const title = text(source.title, 'title', true), artist = text(source.artist, 'artist', true);
    // Preserve punctuation, every version word, and dates while normalizing width/case/spacing.
    const artistKey = clean(artist), titleKey = clean(title);
    if (!artistKey || !titleKey) throw new Error('Empty normalized artist or title');
    const recordingKey = JSON.stringify([artistKey, titleKey]);
    if (byId.has(trackId) && byId.get(trackId).recordingKey !== recordingKey) {
      throw new Error('One track ID has conflicting artist/title metadata');
    }
    const duration = source.duration ?? 0;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) throw new Error('Invalid duration');
    if (source.previewAvailable !== undefined && typeof source.previewAvailable !== 'boolean') throw new Error('Invalid preview availability');
    const collectionGroups = unique([...strings(source.collectionGroups, 'collection groups'), ...(artistGroups.get(artistId) || [])]);
    // Explicit allowlist: no preview, previewUrl, popularity, or unreviewed source fields.
    const track = {
      id: trackId, provider: 'deezer', title, artist, artistId, album: text(source.album, 'album'),
      image: officialUrl(source.image, 'image URL'), url: officialUrl(source.url, 'track URL', trackId),
      duration, previewAvailable: source.previewAvailable === true, collectionGroups,
    };
    if (source.albumId !== undefined && source.albumId !== null && source.albumId !== '') track.albumId = id(source.albumId, 'album ID');
    if (source.year !== undefined && source.year !== null && source.year !== '') {
      if (!/^[12]\d{3}$/.test(String(source.year))) throw new Error('Invalid year');
      track.year = String(source.year);
    }
    const genre = text(source.genre, 'genre');
    if (genre) track.genre = genre;
    const artistGenres = strings(source.artistGenres, 'artist genres');
    if (artistGenres.length) track.artistGenres = artistGenres;
    const isrc = text(source.isrc, 'ISRC');
    if (isrc) {
      if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(isrc)) throw new Error('Invalid ISRC');
      track.isrc = isrc.toUpperCase();
    }
    const previous = byRecording.get(recordingKey);
    if (previous) {
      const mergedGroups = unique([...previous.track.collectionGroups, ...collectionGroups]);
      // Retain an observed playable edition of a duplicate, never inferred availability.
      if (!previous.track.previewAvailable && track.previewAvailable) previous.track = track;
      previous.track.collectionGroups = mergedGroups;
      byId.set(trackId, previous);
      continue;
    }
    const entry = { track, artistKey, titleKey, recordingKey };
    byId.set(trackId, entry); byRecording.set(recordingKey, entry);
  } catch (error) { throw new Error(`Invalid track metadata at row ${index + 1}: ${error.message}`); }
}

const entries = [...byRecording.values()].sort((a, b) =>
  compare(a.track.collectionGroups[0] ?? '\uffff', b.track.collectionGroups[0] ?? '\uffff')
  || compare(a.artistKey, b.artistKey) || compare(a.titleKey, b.titleKey) || compare(a.track.id, b.track.id));
const tracks = entries.map(entry => entry.track);
if (tracks.length < MIN_TRACKS) throw new Error(`Refusing to replace the index with fewer than ${MIN_TRACKS} distinct recordings`);
const artistIndex = new Map();
for (const track of tracks) {
  const artist = artistIndex.get(track.artistId) || { id: track.artistId, name: track.artist, groups: new Set() };
  for (const group of track.collectionGroups) artist.groups.add(group);
  artistIndex.set(track.artistId, artist);
}
const artists = [...artistIndex.values()].map(artist => ({ ...artist, groups: [...artist.groups].sort(compare) }))
  .sort((a, b) => compare(clean(a.name), clean(b.name)) || compare(a.id, b.id));
const snapshotDate = snapshotManifest.snapshotCollectedThrough ?? sourceManifest.collectedAt
  ?? sourceManifest.collectedThrough ?? snapshotManifest.snapshotCollectedFrom ?? sourceManifest.collectedFrom;
if (snapshotDate !== undefined && (typeof snapshotDate !== 'string' || !Number.isFinite(Date.parse(snapshotDate)))) throw new Error('Invalid collection timestamp');
const stats = {
  version: 2, tracks: tracks.length, artists: artists.length,
  previewable: tracks.filter(track => track.previewAvailable).length,
  collectedAt: snapshotDate ? new Date(snapshotDate).toISOString() : new Date().toISOString(),
  collectionGroups: unique(tracks.flatMap(track => track.collectionGroups)).sort(compare),
  source: 'Public Deezer track metadata snapshot',
  grouping: 'Collection discovery paths, not official provider track genres',
  limitations: [
    'A snapshot concentrated on artist top tracks, not a complete global catalog.',
    'Preview availability is a collection-time observation. Playback resolves a fresh provider URL.',
    'No audio files or signed preview URLs are stored.',
  ],
};

// Validate first, then stage the complete output before publishing it.
const catalogDir = path.resolve('public/catalog'), dataDir = path.resolve('data');
await mkdir(catalogDir, { recursive: true });
await mkdir(dataDir, { recursive: true });
const staging = await mkdtemp(path.join(catalogDir, '.import-'));
const json = value => `${JSON.stringify(value)}\n`;
const shards = [];
try {
  for (let offset = 0; offset < tracks.length; offset += SHARD_SIZE) {
    const batch = tracks.slice(offset, offset + SHARD_SIZE);
    const file = `part-${String(shards.length).padStart(3, '0')}.json`;
    // Primary groups remain contiguous; all secondary discovery paths remain searchable.
    shards.push({ file, count: batch.length, groups: unique(batch.flatMap(track => track.collectionGroups)).sort(compare) });
    await writeFile(path.join(staging, file), json(batch));
  }
  await writeFile(path.join(staging, 'artists.json'), json(artists));
  await writeFile(path.join(staging, 'manifest.json'), json({ ...stats, shards }));
  await writeFile(path.join(staging, 'library-manifest.json'), json(stats));
  for (const file of [...shards.map(shard => shard.file), 'artists.json']) await rename(path.join(staging, file), path.join(catalogDir, file));
  await rename(path.join(staging, 'manifest.json'), path.join(catalogDir, 'manifest.json'));
  await rename(path.join(staging, 'library-manifest.json'), path.join(dataDir, 'library-manifest.json'));
  const currentFiles = new Set(shards.map(shard => shard.file));
  for (const entry of await readdir(catalogDir, { withFileTypes: true })) {
    if (entry.isFile() && /^part-\d{3,6}\.json$/.test(entry.name) && !currentFiles.has(entry.name)) await rm(path.join(catalogDir, entry.name));
  }
  await rm(path.join(catalogDir, 'library.json'), { force: true });
} finally { await rm(staging, { recursive: true, force: true }); }
console.log(JSON.stringify({ ...stats, shardCount: shards.length, duplicateRows: raw.length - tracks.length }, null, 2));
