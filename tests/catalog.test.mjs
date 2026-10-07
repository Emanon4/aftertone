import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/server/catalog.ts";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {loadLibrarySample,getLibraryManifest,voteSeedGroups,scriptGroup}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);

const groups=['indie','jazz','rock'];
const artists=[{id:'10',name:'Men I Trust',groups:['indie']},{id:'11',name:'Lamp',groups:['jazz','indie']}];
const row=(id,a,extra={})=>({id:String(id),provider:'deezer',title:`Song ${id}`,artist:artists[a].name,artistId:artists[a].id,album:`Album ${id%3}`,
 image:`https://cdn-images.dzcdn.net/images/cover/${String(id%3).repeat(32)}/500x500-000000-80-0-0.jpg`,url:`https://www.deezer.com/track/${id}`,
 duration:180+id,previewAvailable:id!==3,collectionGroups:artists[a].groups,albumId:String(900+id%3),...extra});
async function v2Catalog(){
 const dir=await mkdtemp(path.join(tmpdir(),'aftertone-catalog-'));
 const parts=[[row(1,0),row(2,1),row(3,0)],[row(4,1),row(5,0,{collectionGroups:['rock','indie']})]];
 for(const [i,p] of parts.entries())await writeFile(path.join(dir,`part-00${i}.json`),JSON.stringify(p));
 await writeFile(path.join(dir,'artists.json'),JSON.stringify(artists));
 await writeFile(path.join(dir,'manifest.json'),JSON.stringify({version:2,tracks:5,artists:2,previewable:4,collectedAt:'2026-10-06',collectionGroups:groups,shards:parts.map((p,i)=>({file:`part-00${i}.json`,count:p.length,groups:['indie']}))}));
 return {dir,rows:parts.flat()};
}
const reader=dir=>({fetch:async input=>{const name=new URL(String(input)).pathname.replace('/catalog/','');try{return new Response(await readFile(path.join(dir,name)),{headers:{'Content-Type':'application/json'}});}catch{return new Response(null,{status:404});}}});

test('compaction round-trips every row and the Worker reads v3 shards identically',async()=>{
 const {dir,rows}=await v2Catalog();
 const result=spawnSync(process.execPath,['scripts/compact-catalog.mjs',dir],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual((await readdir(dir)).sort(),['artists.json','manifest.json','shard-000.json','shard-001.json']);
 const manifest=await getLibraryManifest('https://api.example',reader(dir));assert.equal(manifest.version,3);
 const loaded=await loadLibrarySample({...rows[0],artist:'Men I Trust'},'https://api.example',{assets:reader(dir),random:()=>.5});
 // Group order follows manifest.collectionGroups after compaction; the set is what matters.
 const sortById=list=>[...list].map(t=>({...t,collectionGroups:[...t.collectionGroups].sort()})).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(sortById(loaded.tracks),sortById(rows));
});
test('enriched album years and genres flow into expanded tracks',async()=>{
 const {dir}=await v2Catalog();spawnSync(process.execPath,['scripts/compact-catalog.mjs',dir]);
 const shard=JSON.parse(await readFile(path.join(dir,'shard-000.json'),'utf8'));
 shard.albums[0][3]='2018';shard.albums[0][4]=['Pop','Indie'];
 await writeFile(path.join(dir,'shard-000.json'),JSON.stringify(shard));
 const loaded=await loadLibrarySample({...row(1,0)},'https://api.example',{assets:reader(dir),random:()=>.5});
 const t=loaded.tracks.find(x=>x.id==='1');assert.equal(t.year,'2018');assert.equal(t.genre,'Pop, Indie');
});
test('v3 manifests with unknown shard names or missing groups are rejected',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'aftertone-bad-'));
 await writeFile(path.join(dir,'manifest.json'),JSON.stringify({version:3,tracks:1,artists:1,previewable:1,collectedAt:'x',collectionGroups:groups,shards:[{file:'../secret.json',count:1,groups:[]}]}));
 await assert.rejects(getLibraryManifest('https://api.example',reader(dir)));
 await writeFile(path.join(dir,'manifest.json'),JSON.stringify({version:3,tracks:1,artists:1,previewable:1,collectedAt:'x',shards:[]}));
 await assert.rejects(getLibraryManifest('https://api.example',reader(dir)));
});

test('seeds without curated groups use inferred groups, then live related artists, then writing system',async()=>{
 const table=[{id:'1',name:'Jay Chou',groups:[]},{id:'2',name:'David Tao',groups:['mandarin-cantonese']},{id:'3',name:'Wang Leehom',groups:['mandarin-cantonese']},
  {id:'4',name:'JJ Lin',groups:[],inferredGroups:['mandarin-cantonese']},{id:'5',name:'Random Rock',groups:['rock']}];
 const seed={id:'9',provider:'deezer',title:'Sunny Day',artist:'Jay Chou',album:'Ye Hui Mei'};
 assert.deepEqual(voteSeedGroups(seed,['David Tao','Wang Leehom','JJ Lin','Random Rock','Unknown'],table),['mandarin-cantonese']);
 assert.deepEqual(voteSeedGroups(seed,['Random Rock'],table),[]);   // one stray artist is not enough
 assert.deepEqual(voteSeedGroups({...seed,title:'晴天'},[],table),['mandarin-cantonese']);
 assert.equal(scriptGroup('夜に駆ける'),'japan-korea');assert.equal(scriptGroup('사랑'),'japan-korea');assert.equal(scriptGroup('Sunny Day'),null);
});
test('the shard sample follows related-artist groups when the seed artist has none',async()=>{
 const {dir}=await v2Catalog();spawnSync(process.execPath,['scripts/compact-catalog.mjs',dir]);
 const table=JSON.parse(await readFile(path.join(dir,'artists.json'),'utf8'));table.push({id:'12',name:'Unlabelled',groups:[]});
 await writeFile(path.join(dir,'artists.json'),JSON.stringify(table));
 const loaded=await loadLibrarySample({...row(1,0),artist:'Unlabelled'},'https://api.example',{assets:reader(dir),random:()=>.5,hintArtists:['Men I Trust','Lamp']});
 assert.equal(loaded.groupSource,'related-artists');assert.deepEqual(loaded.seed.collectionGroups,['indie']);
});
