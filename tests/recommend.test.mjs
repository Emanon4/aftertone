import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankWithJev,readScore,selectTracks,JevScoringError} from '../lib/server/recommend.ts';
import {applyExplicitFilters} from '../lib/server/filters.ts';
const seed={id:'1',provider:'deezer',title:'Seed',artist:'Seed Artist',album:'Seed',image:'',url:'',duration:120};
const song=(id,extra={})=>({...seed,id:String(id),artist:'Artist '+id,title:'Song '+id,source:'关联艺术家',...extra});
const feedback={liked:[],disliked:[]};
const answer=(payload,score=2.3)=>({model:'test-model',usage:{input_tokens:100,output_tokens:20},answers:Object.fromEntries(Object.keys(payload.questions).map(k=>[k,{type:'score',score,confidence:.8}]))});
const mock=async(_url,opts)=>Response.json(answer(JSON.parse(opts.body)));

test('malformed model scores fail closed',()=>{
 for(const a of [undefined,{type:'score',score:4,confidence:.8},{type:'score',score:2,confidence:NaN},{type:'choice',score:2,confidence:.5}])assert.throws(()=>readScore(a));
});
test('legacy fetch injection remains compatible and all candidates are accounted for',async()=>{
 let calls=0;const result=await rankWithJev(seed,Array.from({length:35},(_,i)=>song(i+2)),'close','','test-only-key',feedback,async(url,opts)=>{
  calls++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');return mock(url,opts);
 });
 assert.equal(calls,1);assert.equal(result.actualScoredCount,35);assert.equal(result.tracks.length,14);
 assert.equal(new Set(result.tracks.map(x=>x.artist)).size,14);assert.equal(result.model,'test-model');
 assert.equal(result.usageComplete,true);assert.deepEqual(result.usage,{input_tokens:100,output_tokens:20});
});
test('5000 distinct candidates really receive 5000 questions in bounded batches',async()=>{
 let active=0,maximum=0;const asked=new Set();const events=[];
 const result=await rankWithJev(seed,Array.from({length:5000},(_,i)=>song(i+2)),'close','','test-only-key',feedback,{
  batchSize:100,concurrency:4,onProgress:e=>events.push(e),fetcher:async(url,opts)=>{
   const payload=JSON.parse(opts.body);assert.equal(payload.state.candidates,undefined);
   assert.ok(Object.keys(payload.questions).length<=100);
   for(const [key,q] of Object.entries(payload.questions)){
    assert.equal(asked.has(key),false);asked.add(key);
    assert.match(q.instructions.question,/Never infer melody/);
    assert.ok(q.instructions.candidate.id);assert.equal(q.instructions.candidates,undefined);
   }
   active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,1));active--;
   return mock(url,opts);
  },
 });
 assert.equal(maximum,4);assert.equal(asked.size,5000);assert.equal(result.requestCount,50);
 assert.equal(result.actualScoredCount,5000);assert.equal(result.completedBatches,50);
 assert.equal(result.failedRequestCount,0);assert.equal(result.batches.length,50);
 assert.equal(events.at(-1).phase,'complete');assert.equal(events.at(-1).actualScoredCount,5000);
 assert.ok(events.every((e,i)=>!i||e.actualScoredCount>=events[i-1].actualScoredCount));
});
test('explicit notes ask both dimensions for every song and respect question packing',async()=>{
 let questions=0;const result=await rankWithJev(seed,Array.from({length:101},(_,i)=>song(i+2)),'close','slow music','test-only-key',feedback,{
  batchSize:128,fetcher:async(url,opts)=>{const p=JSON.parse(opts.body);questions+=Object.keys(p.questions).length;assert.ok(Object.keys(p.questions).length<=128);return mock(url,opts);},
 });assert.equal(questions,202);assert.equal(result.batchSize,64);assert.equal(result.requestCount,2);assert.equal(result.actualScoredCount,101);
});
test('missing just one response rejects the entire recommendation, with diagnostic metrics',async()=>{
 await assert.rejects(rankWithJev(seed,[song(2),song(3)],'close','','test-only-key',feedback,async(_url,opts)=>{
  const p=JSON.parse(opts.body),data=answer(p);delete data.answers.fit_deezer_3;return Response.json(data);
 }),e=>e instanceof JevScoringError&&e.metrics.actualScoredCount===0&&e.metrics.failedRequestCount===1&&e.metrics.requestCount===1);
});
test('missing current-request score also fails closed',async()=>{
 await assert.rejects(rankWithJev(seed,[song(2)],'close','slow','test-only-key',feedback,async(_url,opts)=>{
  const data=answer(JSON.parse(opts.body));delete data.answers.request_deezer_2;return Response.json(data);
 }),JevScoringError);
});
test('a failed first wave does not schedule remaining paid batches or retry',async()=>{
 let calls=0;await assert.rejects(rankWithJev(seed,Array.from({length:5000},(_,i)=>song(i+2)),'close','','test-only-key',feedback,{
  concurrency:3,fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'2'}});},
 }),e=>e instanceof JevScoringError&&e.metrics.requestCount===3&&e.metrics.batches.every(b=>b.status===429&&b.retryAfter==='2'));
 assert.equal(calls,3);
});
test('caller abort cancels active requests and prevents any later batch',async()=>{
 const controller=new AbortController();let calls=0;
 const result=rankWithJev(seed,Array.from({length:5000},(_,i)=>song(i+2)),'close','','test-only-key',feedback,{
  signal:controller.signal,concurrency:2,fetcher:async(_url,opts)=>{calls++;return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true}));},
 });controller.abort();await assert.rejects(result,e=>e instanceof JevScoringError&&e.metrics.actualScoredCount===0);assert.equal(calls,2);
});
test('pre-aborted signal and duplicate IDs never start paid work',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({});};
 await assert.rejects(rankWithJev(seed,[song(2)],'close','','test-only-key',feedback,{signal:AbortSignal.abort(),fetcher}),JevScoringError);
 await assert.rejects(rankWithJev(seed,[song(2),song(2)],'close','','test-only-key',feedback,{fetcher}),/重复/);assert.equal(calls,0);
});
test('below-threshold scores still count as actually scored',async()=>{
 const result=await rankWithJev(seed,[song(2),song(3)],'close','','test-only-key',feedback,async(_url,opts)=>Response.json(answer(JSON.parse(opts.body),1)));
 assert.equal(result.actualScoredCount,2);assert.equal(result.qualifiedCount,0);assert.deepEqual(result.tracks,[]);
});
test('missing usage is identified as incomplete rather than claimed as measured zero usage',async()=>{
 const result=await rankWithJev(seed,[song(2)],'close','','test-only-key',feedback,async(_url,opts)=>{
  const data=answer(JSON.parse(opts.body));delete data.usage;return Response.json(data);
 });assert.equal(result.usageComplete,false);assert.equal(result.usageReportedBatches,0);
});
test('legacy eighth-argument options and observer errors do not disrupt scoring',async()=>{
 const result=await rankWithJev(seed,[song(2),song(3)],'close','','test-only-key',feedback,mock,{batchSize:1,concurrency:1,onProgress:()=>{throw Error('observer');}});
 assert.equal(result.requestCount,2);assert.equal(result.actualScoredCount,2);
});
test('invalid resource limits fail before network calls',async()=>{
 for(const opts of [{batchSize:0},{batchSize:129},{concurrency:9},{timeoutMs:0}])await assert.rejects(rankWithJev(seed,[song(2)],'close','','test-only-key',feedback,{...opts,fetcher:()=>{throw Error('must not fetch');}}),/must be an integer/);
});
test('exploration avoids same artist and repeated artists',()=>{
 const result=selectTracks([song(2,{artist:seed.artist,score:3}),song(3,{artist:'New',score:2.9}),song(4,{artist:'New',score:2.8}),song(5,{artist:'Another',score:2.5})],seed,'sideways');assert.deepEqual(result.map(x=>x.id),['3','5']);
});
test('explicit live and decade constraints exclude conflicts and unknown years',()=>{
 const songs=[song(2,{title:'Track (Live)',year:'1995'}),song(3,{year:'1996'}),song(4,{year:'2001'}),song(5)];assert.deepEqual(applyExplicitFilters(songs,'不要现场版，想听90年代的歌').map(x=>x.id),['3']);
});

test('a falsy rejection also stops all later paid batches',async()=>{
 let calls=0;await assert.rejects(rankWithJev(seed,Array.from({length:500},(_,i)=>song(i+2)),'close','','test-only-key',feedback,{
  batchSize:1,concurrency:2,fetcher:async()=>{calls++;throw undefined;},
 }),JevScoringError);assert.equal(calls,2);
});
