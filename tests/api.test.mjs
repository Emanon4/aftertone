import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./worker/index.ts";export * from "./worker/jobs.ts";export * from "./lib/server/recommend.ts";export * from "./lib/server/catalog.ts";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {createApi,rankWithJev,loadLibrarySample}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const schema=await readFile(new URL('../worker/migrations/0001_jobs.sql',import.meta.url),'utf8');
class LocalD1{
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');this.db.exec(schema);}
 prepare(sql){
  const db=this.db;let values=[];const beforeFirst=()=>this.beforeFirst?.(sql,values);
  const execute=()=>{const stmt=db.prepare(sql);const rows=stmt.columns().length?stmt.all(...values):(stmt.run(...values),[]);return {success:true,results:rows,meta:{changes:db.prepare('SELECT changes() AS n').get().n}};};
  return {bind(...args){values=args;return this;},async first(){await beforeFirst();return execute().results[0]||null;},async all(){return execute();},async run(){return execute();},_execute:execute};
 }
 async batch(statements){this.db.exec('BEGIN');try{const results=statements.map(s=>s._execute());this.db.exec('COMMIT');return results;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
const seed={id:'1',provider:'deezer',title:'Seed',artist:'Radiohead',album:'Album',image:'',url:'',duration:180,previewAvailable:true};
const songs=n=>Array.from({length:n},(_,i)=>({...seed,id:String(i+2),title:`Song ${i}`,artist:`Artist ${i%500}`,source:'曲库开放探索'}));
const req=(path,body,method='POST',origin='https://emanon4.github.io')=>new Request(`https://api.example${path}`,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body||{})}:{})});
function setup(count=5000,fetcher,overrides={}){
 const db=new LocalD1();let calls=0,now=1_800_000_000_000;const seen=new Set();
 const mock=async(_url,opts)=>{calls++;const p=JSON.parse(opts.body);for(const id of Object.keys(p.questions)){assert.equal(seen.has(id),false);seen.add(id);}if(fetcher)return fetcher(p,calls);return Response.json({model:'mock',usage:{input_tokens:100,output_tokens:20},answers:Object.fromEntries(Object.keys(p.questions).map(k=>[k,{type:'score',score:2,confidence:.8}]))});};
 const env={DB:db,ASSETS:{fetch:async()=>new Response('',{status:404})},TYPESAFE_API_KEY:'test-only'};
 const api=createApi({now:()=>now,getTrack:async()=>seed,searchSongs:async()=>[seed],getLibraryManifest:async()=>({version:2,tracks:100000,artists:2000,previewable:100000,collectedAt:'2026-09-23',shards:[]}),recall:async(_s,_e,_d,_u,options)=>{assert.equal(options.limit,5000);return {seed,candidates:songs(count),libraryCount:100000,recallMeta:{targetCount:5000,rowsScanned:20000,shardsRead:10,returnedCount:count,scope:'bounded-index-sample-and-live-relations'}};},rankWithJev:(...args)=>rankWithJev(...args.slice(0,6),{...args[6],fetcher:mock}),...overrides});
 return {db,env,api,get calls(){return calls;},get seen(){return seen;},setNow:value=>{now=value;},now:()=>now};
}
const create=async f=>{const res=await f.api(req('/api/recommend',{seed:{id:'1',provider:'deezer'},direction:'sideways',notes:'',excluded:[]}),f.env);assert.equal(res.status,201);return res.json();};
const scoreResponse=p=>Response.json({model:'mock',usage:{input_tokens:100,output_tokens:20},answers:Object.fromEntries(Object.keys(p.questions).map(k=>[k,{type:'score',score:2,confidence:.8}]))});

test('5000-candidate job uses ten steps and forty real mock batches, keeping global artist diversity',async()=>{
 const f=setup();let job=await create(f);assert.equal(job.progress.totalCount,5000);assert.equal(job.totalSteps,10);assert.equal(job.progress.totalBatches,40);assert.equal(job.tracks,undefined);
 for(let step=0;step<10;step++){f.setNow(f.now()+1000);const response=await f.api(req(`/api/jobs/${job.jobId}/step`,{step}),f.env);job=await response.json();assert.equal(response.status,200);assert.equal(job.progress.scoredCount,Math.min(5000,(step+1)*512));if(step<9)assert.equal(job.tracks,undefined);}
 assert.equal(job.status,'done');assert.equal(f.calls,40);assert.equal(f.seen.size,5000);assert.equal(job.meta.actualScoredCount,5000);assert.equal(job.meta.wallMs,10000);assert.equal(new Set(job.tracks.map(t=>t.artist)).size,job.tracks.length);assert.equal(job.tracks.length,14);
 await f.api(req(`/api/jobs/${job.jobId}/step`,{}),f.env);assert.equal(f.calls,40);
});
test('concurrent step requests and stale step replays cannot call the model twice',async()=>{
 let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r);const f=setup(900,async p=>{start();await gate;return scoreResponse(p);});const job=await create(f);
 const first=f.api(req(`/api/jobs/${job.jobId}/step`,{step:0}),f.env);await started;
 const concurrent=await f.api(req(`/api/jobs/${job.jobId}/step`,{step:0}),f.env);assert.equal(concurrent.status,202);assert.equal((await concurrent.json()).status,'running');release();await first;assert.equal(f.calls,4);
 const replay=await f.api(req(`/api/jobs/${job.jobId}/step`,{step:0}),f.env);assert.equal((await replay.json()).nextStep,1);assert.equal(f.calls,4);
});
test('one failed batch makes the job terminal and exposes no partial recommendations',async()=>{
 const f=setup(1000,async(p,call)=>call===2?new Response('',{status:429}):scoreResponse(p));const job=await create(f);
 const failed=await (await f.api(req(`/api/jobs/${job.jobId}/step`,{step:0}),f.env)).json();assert.equal(failed.status,'failed');assert.equal(failed.tracks,undefined);assert.equal(failed.progress.scoredCount,384);assert.equal(f.calls,4);
 await f.api(req(`/api/jobs/${job.jobId}/step`,{step:0}),f.env);assert.equal(f.calls,4);
});
test('cancellation wins the race with active work and prevents future steps',async()=>{
 let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r);const f=setup(900,async p=>{start();await gate;return scoreResponse(p);});const job=await create(f);
 const running=f.api(req(`/api/jobs/${job.jobId}/step`,{step:0}),f.env);await started;
 const cancel=await (await f.api(req(`/api/jobs/${job.jobId}/cancel`,{}),f.env)).json();assert.equal(cancel.status,'cancelled');release();const settled=await (await running).json();assert.equal(settled.status,'cancelled');assert.equal(settled.tracks,undefined);assert.equal(settled.progress.scoredCount,512);
 await f.api(req(`/api/jobs/${job.jobId}/step`,{}),f.env);assert.equal(f.calls,4);
});
test('a disconnected create request never consumes quota after provider recall',async()=>{
 const controller=new AbortController();
 const f=setup(900,undefined,{recall:async()=>{controller.abort();return {seed,candidates:songs(900),libraryCount:100000,recallMeta:{}};}});
 const request=new Request(req('/api/recommend',{seed:{id:'1',provider:'deezer'},direction:'close'}),{signal:controller.signal});
 const response=await f.api(request,f.env);assert.equal(response.status,499);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM api_jobs').get().n,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM api_daily_budget').get().n,0);assert.equal(f.calls,0);
});
test('a disconnect during job creation commits a cancelled job without model calls',async()=>{
 const f=setup(900),controller=new AbortController(),batch=f.db.batch.bind(f.db);
 f.db.batch=async statements=>{const result=await batch(statements);controller.abort();return result;};
 const request=new Request(req('/api/recommend',{seed:{id:'1',provider:'deezer'},direction:'close'}),{signal:controller.signal});
 const response=await f.api(request,f.env);assert.equal(response.status,499);const job=f.db.db.prepare('SELECT status,scored_count,request_count FROM api_jobs').get();assert.equal(job.status,'cancelled');assert.equal(job.scored_count,0);assert.equal(job.request_count,0);assert.equal(f.calls,0);
});
test('cancellation while reading candidates prevents the claimed step from starting model calls',async()=>{
 const f=setup(900),job=await create(f);let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r);
 f.db.beforeFirst=async sql=>{if(sql.startsWith('SELECT candidates_json')){start();await gate;}};
 const running=f.api(req(`/api/jobs/${job.jobId}/step`,{step:0}),f.env);await started;
 const cancelled=await(await f.api(req(`/api/jobs/${job.jobId}/cancel`,{}),f.env)).json();assert.equal(cancelled.status,'cancelled');release();
 const result=await(await running).json();assert.equal(result.status,'cancelled');assert.equal(result.progress.scoredCount,0);assert.equal(f.calls,0);
});
test('an already aborted step request cancels the pending task without model calls',async()=>{
 const f=setup(900),job=await create(f),controller=new AbortController();controller.abort();
 const request=new Request(req(`/api/jobs/${job.jobId}/step`,{step:0}),{signal:controller.signal});const response=await f.api(request,f.env);
 assert.equal((await response.json()).status,'cancelled');assert.equal(f.calls,0);
});
test('lost leases fail closed, while never-started expired jobs have an explicit expired state',async()=>{
 const f=setup(5);const first=await create(f);f.db.db.prepare("UPDATE api_jobs SET status='running',lease_token='lost',lease_until=? WHERE id=?").run(f.now()-1,first.jobId);
 const lost=await (await f.api(req(`/api/jobs/${first.jobId}`,null,'GET'),f.env)).json();assert.equal(lost.status,'failed');await f.api(req(`/api/jobs/${first.jobId}/step`,{}),f.env);assert.equal(f.calls,0);
 const second=await create(f);f.setNow(f.now()+31*60_000);const expired=await (await f.api(req(`/api/jobs/${second.jobId}`,null,'GET'),f.env)).json();assert.equal(expired.status,'expired');
});
test('daily 30-job quota is atomic under concurrent job creation',async()=>{
 const f=setup(1);const responses=await Promise.all(Array.from({length:31},()=>f.api(req('/api/recommend',{seed:{id:'1',provider:'deezer'},direction:'close',notes:'',excluded:[]}),f.env)));
 assert.equal(responses.filter(r=>r.status===201).length,30);assert.equal(responses.filter(r=>r.status===429).length,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM api_jobs').get().n,30);assert.equal(f.calls,0);
});
test('CORS restricts origins; search and library remain public without authentication',async()=>{
 const f=setup();const blocked=await f.api(req('/api/library',null,'GET','https://evil.example'),f.env);assert.equal(blocked.status,403);assert.equal(blocked.headers.get('Access-Control-Allow-Origin'),null);
 const lib=await f.api(req('/api/library',null,'GET'),f.env);assert.equal(lib.status,200);assert.equal(lib.headers.get('Access-Control-Allow-Origin'),'https://emanon4.github.io');assert.equal((await lib.json()).candidateLimit,5000);
 const search=await f.api(req('/api/music?q=Radiohead',null,'GET','http://localhost:5173'),f.env);assert.equal(search.status,200);assert.equal((await search.json()).tracks.length,1);
 const invalid=await f.api(req('/api/recommend',{seed:{id:'bad',provider:'deezer'},direction:'close'}),f.env);assert.equal(invalid.status,400);assert.equal(f.calls,0);
});
test('v2 catalog samples at most ten shards/20000 rows, mixing seed groups with global shards',async()=>{
 const manifest={version:2,tracks:100000,artists:2000,previewable:100000,collectedAt:'2026-09-23',shards:Array.from({length:50},(_,i)=>({file:`part-${String(i).padStart(3,'0')}.json`,count:2000,groups:[i<4?'rock':'other']}))};const files=[];
 const assets={fetch:async input=>{const path=new URL(String(input)).pathname;if(path.endsWith('manifest.json'))return Response.json(manifest);if(path.endsWith('artists.json'))return Response.json([{id:'1',name:'Radiohead',groups:['rock']}]);files.push(path);return Response.json(songs(2000));}};
 const result=await loadLibrarySample(seed,'https://api.example',{assets,random:()=>.5});assert.equal(result.rowsScanned,20000);assert.equal(result.shardsRead,10);assert.equal(new Set(files).size,10);assert.ok(files.some(p=>Number(p.match(/part-(\d+)/)[1])<4));assert.ok(files.some(p=>Number(p.match(/part-(\d+)/)[1])>=4));assert.deepEqual(result.seed.collectionGroups,['rock']);assert.equal(result.seed.genre,undefined);
});

test('notes preserve both scoring questions per song across twenty bounded steps',async()=>{
 const f=setup();let response=await f.api(req('/api/recommend',{seed:{id:'1',provider:'deezer'},direction:'close',notes:'Try something related',excluded:[]}),f.env);let job=await response.json();
 assert.equal(job.totalSteps,20);assert.equal(job.progress.totalBatches,79);
 for(let step=0;step<20;step++)job=await(await f.api(req(`/api/jobs/${job.jobId}/step`,{step}),f.env)).json();
 assert.equal(job.status,'done');assert.equal(f.calls,79);assert.equal(f.seen.size,10000);assert.equal(job.progress.scoredCount,5000);
});
