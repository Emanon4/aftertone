import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./worker/index.ts";export * from "./worker/jobs.ts";export * from "./lib/server/recommend.ts";export * from "./lib/server/catalog.ts";export * from "./lib/server/model-provider.ts";export * from "./worker/runner.ts";export * from "./lib/server/prerank.ts";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {createApi,rankWithJev,rankWithCompatible,loadLibrarySample,JobRunner,verifyCompatibleKey,prerankCandidates,explainTrack}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const schema=await readFile(new URL('../worker/migrations/0001_jobs.sql',import.meta.url),'utf8');
const personalSchema=await readFile(new URL('../worker/migrations/0002_personal_models.sql',import.meta.url),'utf8');
const quotaSchema=await readFile(new URL('../worker/migrations/0003_quotas.sql',import.meta.url),'utf8');
class LocalD1{
 constructor(beforeMigration){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');this.db.exec(schema);beforeMigration?.(this.db);this.db.exec(personalSchema);this.db.exec(quotaSchema);}
 prepare(sql){
  const db=this.db;let values=[];const beforeFirst=()=>this.beforeFirst?.(sql,values);
  const execute=()=>{const stmt=db.prepare(sql);const rows=stmt.columns().length?stmt.all(...values):(stmt.run(...values),[]);return {success:true,results:rows,meta:{changes:db.prepare('SELECT changes() AS n').get().n}};};
  return {bind(...args){values=args;return this;},async first(){await beforeFirst();return execute().results[0]||null;},async all(){return execute();},async run(){return execute();},_execute:execute};
 }
 async batch(statements){this.db.exec('BEGIN');try{const results=statements.map(s=>s._execute());this.db.exec('COMMIT');return results;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
const seed={id:'1',provider:'deezer',title:'Seed',artist:'Radiohead',album:'Album',image:'',url:'',duration:180,previewAvailable:true};
const songs=n=>Array.from({length:n},(_,i)=>({...seed,id:String(i+2),title:`Song ${i}`,artist:`Artist ${i%500}`,source:'曲库开放探索'}));
const req=(path,body,method='POST',origin='https://emanon4.github.io',key)=>new Request(`https://api.example${path}`,{method,headers:{Origin:origin,'Content-Type':'application/json',...(key?{'X-Model-Api-Key':key}:{})},...(method==='POST'?{body:JSON.stringify(body||{})}:{})});
function setup(count=5000,fetcher,overrides={}){
 const db=new LocalD1();let calls=0,now=1_800_000_000_000;const seen=new Set(),authorizations=[];
 const mock=async(_url,opts)=>{calls++;authorizations.push(new Headers(opts.headers).get('Authorization'));const p=JSON.parse(opts.body);for(const id of Object.keys(p.questions)){assert.equal(seen.has(id),false);seen.add(id);}if(fetcher)return fetcher(p,calls);return Response.json({model:'mock',usage:{input_tokens:100,output_tokens:20},answers:Object.fromEntries(Object.keys(p.questions).map(k=>[k,{type:'score',score:2,confidence:.8}]))});};
 const env={DB:db,ASSETS:{fetch:async()=>new Response('',{status:404})},TYPESAFE_API_KEY:'test-only',SITE_DAILY_ROUNDS:'30',CANDIDATE_LIMIT:'5000'};
 const api=createApi({now:()=>now,getTrack:async()=>seed,searchSongs:async()=>[seed],getLibraryManifest:async()=>({version:2,tracks:100000,artists:2000,previewable:100000,collectedAt:'2026-09-23',shards:[]}),recall:async(_s,_e,_d,_u,options)=>{assert.equal(options.limit,5000);return {seed,candidates:songs(count),libraryCount:100000,recallMeta:{targetCount:5000,rowsScanned:20000,shardsRead:10,returnedCount:count,scope:'bounded-index-sample-and-live-relations'}};},rankWithJev:(...args)=>rankWithJev(...args.slice(0,6),{...args[6],fetcher:mock}),verifyCompatibleKey:async()=>true,verifyTurnstile:async()=>true,...overrides});
 return {db,env,api,authorizations,get calls(){return calls;},get seen(){return seen;},setNow:value=>{now=value;},now:()=>now};
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

const personalRequest=(path,body,key='personal-test-key-one',method='POST')=>req(path,body,method,'https://emanon4.github.io',key);
const personalBody={seed:{id:'1',provider:'deezer'},direction:'sideways',notes:'',excluded:[],modelConfig:{provider:'jev'}};
test('personal Jev works without a site secret and never stores or returns its API key',async()=>{
 const f=setup(900,p=>{assert.equal(p.model,'jev-personal-model');return scoreResponse(p);});f.env.TYPESAFE_API_KEY='';
 const created=await f.api(personalRequest('/api/recommend',{...personalBody,modelConfig:{provider:'jev',model:'jev-personal-model'}}),f.env);assert.equal(created.status,201);let job=await created.json();
 assert.equal(job.credentialMode,'personal');assert.deepEqual(job.modelConfig,{provider:'jev',model:'jev-personal-model'});
 const stored=f.db.db.prepare('SELECT * FROM api_jobs').get();assert.match(stored.key_fingerprint,/^[a-f0-9]{64}$/);assert.equal(stored.quota_bucket,`key:${stored.key_fingerprint}`);assert.equal(JSON.stringify(stored).includes('personal-test-key-one'),false);assert.equal(JSON.stringify(job).includes(stored.key_fingerprint),false);
 for(let step=0;step<2;step++)job=await(await f.api(personalRequest(`/api/jobs/${job.jobId}/step`,{step}),f.env)).json();
 assert.equal(job.status,'done');assert.equal(job.progress.scoredCount,900);assert.equal(job.meta.credentialMode,'personal');assert.equal(f.calls,8);assert.ok(f.authorizations.every(value=>value==='Bearer personal-test-key-one'));
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM api_daily_budget').get().n,0);assert.equal(f.db.db.prepare('SELECT count FROM api_personal_daily_budget').get().count,1);
});
test('personal steps reject missing or changed keys before claiming work, without a site-key fallback',async()=>{
 const f=setup(5);const job=await(await f.api(personalRequest('/api/recommend',personalBody),f.env)).json();
 const missing=await f.api(req(`/api/jobs/${job.jobId}/step`,{step:0}),f.env);assert.equal(missing.status,401);
 const changed=await f.api(personalRequest(`/api/jobs/${job.jobId}/step`,{step:0},'different-personal-key'),f.env);assert.equal(changed.status,403);
 assert.equal(f.calls,0);assert.equal(f.db.db.prepare('SELECT status FROM api_jobs').get().status,'pending');
 const read=await f.api(req(`/api/jobs/${job.jobId}`,null,'GET'),f.env);assert.equal(read.status,200);
 const done=await(await f.api(personalRequest(`/api/jobs/${job.jobId}/step`,{step:0}),f.env)).json();assert.equal(done.status,'done');assert.equal(f.calls,1);
 const replay=await f.api(req(`/api/jobs/${job.jobId}/step`,{step:0}),f.env);assert.equal(replay.status,401);assert.equal(f.calls,1);
 const cancel=await f.api(req(`/api/jobs/${job.jobId}/cancel`,{}),f.env);assert.equal(cancel.status,200);
});
test('personal quota is atomic per key and independent of the existing site daily quota',async()=>{
 const f=setup(1);const responses=await Promise.all(Array.from({length:31},()=>f.api(personalRequest('/api/recommend',personalBody),f.env)));
 assert.equal(responses.filter(r=>r.status===201).length,30);assert.equal(responses.filter(r=>r.status===429).length,1);
 const other=await f.api(personalRequest('/api/recommend',personalBody,'personal-test-key-two'),f.env);assert.equal(other.status,201);
 const site=await create(f);assert.equal(site.credentialMode,'site');assert.equal(site.modelConfig,null);
 assert.equal(f.db.db.prepare('SELECT count FROM api_daily_budget').get().count,1);assert.deepEqual(f.db.db.prepare('SELECT count FROM api_personal_daily_budget ORDER BY count').all().map(r=>r.count),[1,30]);assert.equal(f.calls,0);
});
test('invalid personal configuration and missing credentials fail without charging a quota',async()=>{
 const f=setup(1);
 assert.equal((await f.api(req('/api/recommend',personalBody),f.env)).status,401);
 assert.equal((await f.api(personalRequest('/api/recommend',{...personalBody,modelConfig:undefined}),f.env)).status,400);
 for(const modelConfig of [null,{provider:'jev',apiKey:'must-not-be-stored'},{provider:'openai-compatible',baseUrl:'https://evil.example/v1',model:'any'},{provider:'openai-compatible',baseUrl:'http://127.0.0.1/v1',model:'any'}]){
  assert.equal((await f.api(personalRequest('/api/recommend',{...personalBody,modelConfig}),f.env)).status,400);
 }
 f.env.TYPESAFE_API_KEY='';assert.equal((await f.api(req('/api/recommend',{...personalBody,modelConfig:undefined}),f.env)).status,503);
 const library=await(await f.api(req('/api/library',null,'GET'),f.env)).json();assert.equal(library.available,false);assert.equal(library.byokAvailable,true);
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM api_jobs').get().n,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM api_personal_daily_budget').get().n,0);assert.equal(f.calls,0);
 const preflight=await f.api(req('/api/recommend',null,'OPTIONS'),f.env);assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/X-Model-Api-Key/);
});
test('migration preserves old site quota and lets legacy jobs finish with the site model',async()=>{
 const f=setup(1),id='11111111-1111-4111-8111-111111111111';
 const db=new LocalD1(old=>{
  old.prepare('INSERT INTO api_daily_budget(day,count) VALUES (?,?)').run(new Date(f.now()).toISOString().slice(0,10),29);
  old.prepare(`INSERT INTO api_jobs(id,status,created_at,updated_at,expires_at,seed_json,direction,notes,feedback_json,total_count,total_batches,batch_size,total_steps,library_count,recall_json,remaining) VALUES (?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,f.now(),f.now(),f.now()+10000,JSON.stringify(seed),'sideways','',JSON.stringify({liked:[],disliked:[]}),1,1,128,1,100000,'{}',1);
  old.prepare('INSERT INTO api_job_steps(job_id,step_index,candidates_json) VALUES (?,0,?)').run(id,JSON.stringify(songs(1)));
 });
 f.env.DB=db;
 const finished=await(await f.api(req(`/api/jobs/${id}/step`,{step:0}),f.env)).json();assert.equal(finished.status,'done');assert.equal(finished.credentialMode,'site');assert.equal(finished.modelConfig,null);assert.equal(f.calls,1);
 const admitted=await create(f);assert.equal(admitted.credentialMode,'site');
 const rejected=await f.api(req('/api/recommend',{...personalBody,modelConfig:undefined}),f.env);assert.equal(rejected.status,429);assert.equal(db.db.prepare('SELECT count FROM api_daily_budget').get().count,30);
 const personal=await f.api(personalRequest('/api/recommend',personalBody),f.env);assert.equal(personal.status,201);
});
test('5000 personal compatible candidates receive both dimensions across twenty steps with no site calls',async()=>{
 let requests=0;const seen=new Set(),config={provider:'openai-compatible',baseUrl:'https://api.deepseek.com/v1',model:'deepseek-chat'};
 const f=setup(5000,undefined,{rankWithCompatible:(...args)=>rankWithCompatible(...args.slice(0,7),{...args[7],fetcher:async(url,init)=>{
  requests++;assert.equal(url,'https://api.deepseek.com/v1/chat/completions');assert.equal(init.redirect,'manual');assert.equal(new Headers(init.headers).get('Authorization'),'Bearer personal-compatible-key');
  const body=JSON.parse(init.body),{state,questions}=JSON.parse(body.messages[1].content);assert.equal(body.model,'deepseek-chat');assert.equal(body.temperature,.1);assert.deepEqual(body.response_format,{type:'json_object'});assert.deepEqual(state.feedback,{liked:['Liked artist — Song'],disliked:['Rejected artist — Song']});assert.equal(state.currentRequest,'Try something related');
  const ids=Object.keys(questions);assert.ok(ids.length<=128);for(const id of ids){assert.equal(seen.has(id),false);seen.add(id);}
  return Response.json({model:'deepseek-chat',usage:{prompt_tokens:100,completion_tokens:20},choices:[{finish_reason:'stop',message:{content:JSON.stringify({scores:ids.map(id=>({id,score:id.startsWith('fit_')?.8:.6}))})}}]});
 }})});f.env.TYPESAFE_API_KEY='';
 let response=await f.api(personalRequest('/api/recommend',{...personalBody,modelConfig:config,notes:'Try something related',feedback:{liked:['Liked artist — Song'],disliked:['Rejected artist — Song']}},'personal-compatible-key'),f.env);assert.equal(response.status,201);let job=await response.json();
 assert.equal(job.totalSteps,20);assert.equal(job.progress.totalBatches,79);assert.equal(job.progress.totalCount,5000);
 for(let step=0;step<20;step++)job=await(await f.api(personalRequest(`/api/jobs/${job.jobId}/step`,{step},'personal-compatible-key'),f.env)).json();
 assert.equal(job.status,'done');assert.equal(job.meta.engine,'openai-compatible');assert.equal(job.meta.credentialMode,'personal');assert.equal(job.meta.model,'deepseek-chat');assert.equal(job.progress.scoredCount,5000);assert.equal(job.tracks.length,14);assert.equal(new Set(job.tracks.map(t=>t.artist)).size,14);assert.equal(requests,79);assert.equal(seen.size,10000);assert.equal(f.calls,0);assert.equal(job.meta.usage.input_tokens,7900);assert.equal(job.meta.usageComplete,true);
 const replay=await(await f.api(personalRequest(`/api/jobs/${job.jobId}/step`,{step:19},'personal-compatible-key'),f.env)).json();assert.equal(replay.status,'done');assert.equal(requests,79);
});
test('incomplete compatible scoring becomes terminal and never falls back to Jev',async()=>{
 let requests=0;const config={provider:'openai-compatible',baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini'};
 const f=setup(3,undefined,{rankWithCompatible:(...args)=>rankWithCompatible(...args.slice(0,7),{...args[7],fetcher:async()=>{requests++;return Response.json({model:'gpt-4.1-mini',usage:{prompt_tokens:123,completion_tokens:4},choices:[{finish_reason:'stop',message:{content:'{"scores":[]}'}}]});}})});
 const job=await(await f.api(personalRequest('/api/recommend',{...personalBody,modelConfig:config}),f.env)).json();
 const failed=await(await f.api(personalRequest(`/api/jobs/${job.jobId}/step`,{step:0}),f.env)).json();assert.equal(failed.status,'failed');assert.equal(failed.tracks,undefined);assert.equal(failed.progress.scoredCount,0);assert.equal(requests,1);assert.equal(f.calls,0);
 await f.api(personalRequest(`/api/jobs/${job.jobId}/step`,{step:0}),f.env);assert.equal(requests,1);assert.equal(f.calls,0);
 const stored=f.db.db.prepare('SELECT input_tokens,request_count,usage_complete FROM api_jobs').get();assert.equal(stored.input_tokens,123);assert.equal(stored.request_count,1);assert.equal(stored.usage_complete,1);
});
test('personal Jev failures cannot persist an upstream response that echoes the key',async()=>{
 const key='personal-upstream-echo-key';
 const f=setup(1,()=>new Response(`{"bad":"${key}"`));
 const job=await(await f.api(personalRequest('/api/recommend',personalBody,key),f.env)).json();
 const failed=await(await f.api(personalRequest(`/api/jobs/${job.jobId}/step`,{step:0},key),f.env)).json();assert.equal(failed.status,'failed');assert.equal(JSON.stringify(failed).includes(key),false);assert.equal(JSON.stringify(f.db.db.prepare('SELECT * FROM api_jobs').all()).includes(key),false);
});

// ---- Hardening: abuse limits, pre-ranking and server-side driving ----
const body={seed:{id:'1',provider:'deezer'},direction:'close',notes:'',excluded:[]};
const withIp=(path,b,ip,extra={})=>new Request(`https://api.example${path}`,{method:'POST',headers:{Origin:'https://emanon4.github.io','Content-Type':'application/json','CF-Connecting-IP':ip,...extra},body:JSON.stringify(b)});
test('writes without a browser Origin are rejected; reads stay public',async()=>{
 const f=setup(5);
 const post=await f.api(new Request('https://api.example/api/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),f.env);assert.equal(post.status,403);
 const get=await f.api(new Request('https://api.example/api/library'),f.env);assert.equal(get.status,200);
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM api_jobs').get().n,0);
});
test('per-IP daily limit stops one visitor before recall, without storing the raw IP',async()=>{
 let recalls=0;const f=setup(5,undefined,{recall:async()=>{recalls++;return {seed,candidates:songs(5),libraryCount:1,recallMeta:{}};}});f.env.IP_DAILY_ROUNDS='2';
 for(let i=0;i<2;i++)assert.equal((await f.api(withIp('/api/recommend',body,'203.0.113.9'),f.env)).status,201);
 const blocked=await f.api(withIp('/api/recommend',body,'203.0.113.9'),f.env);assert.equal(blocked.status,429);assert.equal(recalls,2);
 assert.equal((await f.api(withIp('/api/recommend',body,'198.51.100.4'),f.env)).status,201);
 assert.equal(JSON.stringify(f.db.db.prepare('SELECT * FROM api_rate_budget').all()).includes('203.0.113.9'),false);
});
test('Turnstile, when configured, must pass before any quota or recall is spent',async()=>{
 let verified=0;const f=setup(5,undefined,{verifyTurnstile:async(_secret,token)=>{verified++;return token==='good';}});f.env.TURNSTILE_SECRET_KEY='secret';
 assert.equal((await f.api(req('/api/recommend',body),f.env)).status,403);
 assert.equal((await f.api(req('/api/recommend',{...body,turnstileToken:'bad'}),f.env)).status,403);
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM api_daily_budget').get().n,0);
 assert.equal((await f.api(req('/api/recommend',{...body,turnstileToken:'good'}),f.env)).status,201);assert.equal(verified,2);
});
test('an invalid compatible key is rejected before recall and before any personal quota',async()=>{
 let recalls=0;const f=setup(5,undefined,{verifyCompatibleKey:async()=>false,recall:async()=>{recalls++;return {seed,candidates:songs(5),libraryCount:1,recallMeta:{}};}});
 const cfg={provider:'openai-compatible',baseUrl:'https://api.openai.com/v1',model:'any-model'};
 const response=await f.api(req('/api/recommend',{...body,modelConfig:cfg},'POST','https://emanon4.github.io','random-guess'),f.env);
 assert.equal(response.status,401);assert.equal(recalls,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM api_personal_daily_budget').get().n,0);
});
test('a global ceiling bounds personal-key jobs however many random keys are used',async()=>{
 const f=setup(1);f.env.PERSONAL_GLOBAL_DAILY_ROUNDS='3';
 const statuses=[];for(let i=0;i<5;i++)statuses.push((await f.api(req('/api/recommend',{...body,modelConfig:{provider:'jev'}},'POST','https://emanon4.github.io',`random-key-${i}`),f.env)).status);
 assert.deepEqual(statuses,[201,201,201,429,429]);
});
test('verifyCompatibleKey only rejects explicit 401/403 from an allow-listed base',async()=>{
 const cfg={provider:'openai-compatible',baseUrl:'https://api.deepseek.com/v1',model:'m'};
 for(const [status,ok] of [[200,true],[401,false],[403,false],[404,true],[500,true]]){
  let seenUrl;assert.equal(await verifyCompatibleKey(cfg,'k',async url=>{seenUrl=url;return new Response('',{status});}),ok);assert.equal(seenUrl,'https://api.deepseek.com/v1/models');
 }
 assert.equal(await verifyCompatibleKey(cfg,'k',async()=>{throw new Error('offline');}),true);
});
test('default pre-ranking scores 600 candidates in two steps instead of 5000',async()=>{
 const f=setup(5000);delete f.env.CANDIDATE_LIMIT;
 const job=await(await f.api(req('/api/recommend',body),f.env)).json();
 assert.equal(job.progress.totalCount,600);assert.equal(job.totalSteps,2);assert.equal(job.progress.totalBatches,5);
 const lib=await(await f.api(req('/api/library',null,'GET'),f.env)).json();assert.equal(lib.candidateLimit,600);
});
test('pre-ranking prefers documented relations, keeps an exploration share and honours avoided artists',()=>{
 const s={...seed,artist:'Seed',collectionGroups:['indie']};
 const pool=[...Array.from({length:300},(_,i)=>({...seed,id:String(i+10),artist:`Rel ${i}`,title:`R${i}`,source:'关联艺术家',collectionGroups:['indie']})),
  ...Array.from({length:3000},(_,i)=>({...seed,id:String(i+5000),artist:`Open ${i}`,title:`O${i}`,source:'曲库开放探索',collectionGroups:['metal']}))];
 const r=prerankCandidates(s,pool,'close',400,()=>.5);
 assert.equal(r.candidates.length,400);assert.equal(r.explorationCount,40);
 assert.equal(r.candidates.filter(t=>t.source==='关联艺术家').length,300);
 const avoided=prerankCandidates(s,pool,'close',400,()=>.5,['Rel 0','rel 1']);assert.equal(avoided.candidates.some(t=>t.artist==='Rel 0'||t.artist==='Rel 1'),false);
 const small=prerankCandidates(s,pool.slice(0,10),'bold',400);assert.equal(small.candidates.length,10);
});
test('avoidArtists from structured feedback never reach the scored candidates',async()=>{
 const f=setup(50);const job=await(await f.api(req('/api/recommend',{...body,avoidArtists:['Artist 3','Artist 4']}),f.env)).json();
 const stored=f.db.db.prepare('SELECT candidates_json FROM api_job_steps WHERE job_id=?').all(job.jobId).flatMap(r=>JSON.parse(r.candidates_json));
 assert.equal(stored.length,48);assert.equal(stored.some(t=>['Artist 3','Artist 4'].includes(t.artist)),false);
});
test('reasons describe metadata links, not sound',()=>{
 const s={...seed,artist:'Men I Trust',year:'2018',collectionGroups:['indie']};
 assert.equal(explainTrack({...seed,source:'关联艺术家',collectionGroups:['indie'],year:'2020'},s),'Men I Trust 的关联艺人 · 同属「独立」 · 年代相近（2020）');
 assert.match(explainTrack({...seed,source:'曲库开放探索'},s),/开放探索/);
});
test('job polling is read-only until a deadline or lease passes',async()=>{
 const f=setup(5);const job=await create(f);let writes=0;const prepare=f.db.prepare.bind(f.db);
 f.db.prepare=sql=>{if(/^\s*(UPDATE|INSERT|DELETE)/i.test(sql))writes++;return prepare(sql);};
 for(let i=0;i<5;i++)assert.equal((await(await f.api(req(`/api/jobs/${job.jobId}`,null,'GET'),f.env)).json()).status,'pending');
 assert.equal(writes,0);
});
class FakeStorage{constructor(){this.map=new Map();this.alarm=null;}async get(k){return this.map.get(k);}async put(k,v){this.map.set(k,v);}async deleteAll(){this.map.clear();this.alarm=null;}async setAlarm(t){this.alarm=t;}}
test('JobRunner drives every step server-side and stops when the job is done',async()=>{
 const f=setup(1200);const job=await create(f);const storage=new FakeStorage();
 const runner=new JobRunner({storage},f.env,{rankWithJev:(...a)=>rankWithJev(...a.slice(0,6),{...a[6],fetcher:async(_u,o)=>scoreResponse(JSON.parse(o.body))}),rankWithCompatible,now:f.now});
 assert.equal((await runner.fetch(new Request('https://job-runner/start',{method:'POST',body:JSON.stringify({jobId:job.jobId})}))).status,202);
 for(let i=0;i<10&&storage.alarm!==null;i++)await runner.alarm();
 const done=await(await f.api(req(`/api/jobs/${job.jobId}`,null,'GET'),f.env)).json();
 assert.equal(done.status,'done');assert.equal(done.progress.scoredCount,1200);assert.equal(storage.alarm,null);assert.equal(storage.map.size,0);
});
test('JobRunner never stores a personal key and hands over to the browser after eviction',async()=>{
 const f=setup(5);const job=await(await f.api(personalRequest('/api/recommend',personalBody),f.env)).json();const storage=new FakeStorage();
 const runner=new JobRunner({storage},f.env,{rankWithJev,rankWithCompatible,now:f.now});
 await runner.fetch(new Request('https://job-runner/start',{method:'POST',headers:{'X-Model-Api-Key':'personal-test-key-one'},body:JSON.stringify({jobId:job.jobId})}));
 assert.equal(JSON.stringify([...storage.map]).includes('personal-test-key-one'),false);
 const evicted=new JobRunner({storage},f.env,{rankWithJev,rankWithCompatible,now:f.now});await evicted.alarm();
 assert.equal(storage.alarm,null);assert.equal(f.db.db.prepare('SELECT status FROM api_jobs').get().status,'pending');assert.equal(f.calls,0);
});
test('a busy lease makes the runner wait instead of running the same step twice',async()=>{
 const f=setup(5);const job=await create(f);f.db.db.prepare("UPDATE api_jobs SET status='running',lease_token='browser',lease_until=? WHERE id=?").run(f.now()+60_000,job.jobId);
 const storage=new FakeStorage();await storage.put('jobId',job.jobId);const runner=new JobRunner({storage},f.env,{rankWithJev,rankWithCompatible,now:f.now});
 await runner.alarm();assert.equal(storage.alarm,f.now()+2000);assert.equal(f.calls,0);
});
