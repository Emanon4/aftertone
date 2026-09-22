import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
// Import metadata only. Audio URLs are intentionally discarded.
const input=process.argv[2];if(!input)throw new Error('Usage: node scripts/import-library.mjs /path/to/collection');
const raw=JSON.parse(await readFile(path.join(input,'tracks.json'),'utf8'));
const artistData=await readFile(path.join(input,'artists.json'),'utf8').then(JSON.parse).catch(()=>[]);
const artists=Array.isArray(artistData)?artistData:Object.values(artistData);
const groups=new Map(artists.map(a=>[String(a.id),a.discoveryCategories||[]]));
const seen=new Set(),recordings=new Set();
const clean=s=>s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
const tracks=[];
for(const t of raw){
 if(t.provider!=='deezer'||!/^\d{1,18}$/.test(String(t.id))||!t.title||!t.artist||!t.url||!t.image)throw new Error('Invalid track metadata');
 const id=String(t.id),recording=clean(t.artist)+'|'+clean(t.title);
 if(seen.has(id)||recordings.has(recording))continue;seen.add(id);recordings.add(recording);
 tracks.push({id,provider:t.provider,title:t.title,artist:t.artist,artistId:String(t.artistId),album:t.album||'',albumId:t.albumId?String(t.albumId):undefined,image:t.image,url:t.url,duration:t.duration||0,previewAvailable:!!t.previewAvailable,year:t.year||undefined,genre:t.genre||undefined,isrc:t.isrc||undefined,artistGenres:t.artistGenres?.length?t.artistGenres:undefined,collectionGroups:t.collectionGroups||groups.get(String(t.artistId))||[]});
}
if(tracks.length<1000)throw new Error('Refusing to replace the index with an incomplete collection');
await mkdir('data',{recursive:true});await mkdir('public/catalog',{recursive:true});await writeFile('public/catalog/library.json',JSON.stringify(tracks)+'\n');
const manifest={collectedAt:new Date().toISOString(),tracks:tracks.length,artists:new Set(tracks.map(t=>clean(t.artist))).size,previewable:tracks.filter(t=>t.previewAvailable).length,collectionGroups:[...new Set(tracks.flatMap(t=>t.collectionGroups))].sort(),source:'Deezer artist top endpoints, artist identity checked using search/artist',grouping:'Human-curated artist discovery paths, not provider track genres',limitations:['A snapshot concentrated on artist top tracks, not a complete global catalog.','Preview availability is a collection-time observation. Playback resolves a fresh provider URL.','No audio files or signed preview URLs are stored.']};
await writeFile('data/library-manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
