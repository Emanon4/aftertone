import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({stdin:{contents:'export * from "./lib/server/model-provider.ts";export {JevScoringError} from "./lib/server/recommend.ts";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {COMPATIBLE_BASE_URLS,parseModelConfig,rankWithCompatible,JevScoringError}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const seed={id:'1',provider:'deezer',title:'Seed',artist:'Seed Artist',album:'Album',image:'',url:'',duration:180};
const song=(id,extra={})=>({...seed,id:String(id),artist:`Artist ${id}`,title:`Song ${id}`,source:'关联艺术家',...extra});
const songs=n=>Array.from({length:n},(_,i)=>song(i+2));
const feedback={liked:['deezer:42'],disliked:['deezer:50']};
const config=parseModelConfig({provider:'openai-compatible',baseUrl:'https://api.openai.com/v1',model:'gpt-test'});
const payload=init=>JSON.parse(JSON.parse(init.body).messages[1].content);
const envelope=(scores,extra={})=>({model:'served-model-1',usage:{prompt_tokens:100,completion_tokens:20},choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({scores})}}],...extra});
const scoresFor=(init,score=.8)=>Object.keys(payload(init).questions).map(id=>({id,score}));
const mock=async(_url,init)=>Response.json(envelope(scoresFor(init)));
const rank=(candidates,options={},notes='',cfg=config,key='test-only-key')=>rankWithCompatible(seed,candidates,'close',notes,key,feedback,cfg,{fetcher:mock,...options});

test('model config defaults are explicit, strict, and contain no credentials',()=>{
 assert.equal(parseModelConfig(undefined),null);
 assert.deepEqual(parseModelConfig({provider:'jev'}),{provider:'jev',model:'jev-latest'});
 assert.deepEqual(parseModelConfig({provider:'jev',model:'jev-1.13.0'}),{provider:'jev',model:'jev-1.13.0'});
 assert.equal(COMPATIBLE_BASE_URLS.length,4);
 for(const baseUrl of COMPATIBLE_BASE_URLS){
  assert.deepEqual(parseModelConfig({provider:'openai-compatible',baseUrl:`${baseUrl}/`,model:'team/model:version-1.0'}),{provider:'openai-compatible',baseUrl,model:'team/model:version-1.0'});
 }
 for(const value of [null,[],true,'jev',{}, {provider:'unknown'}, {provider:'jev',baseUrl:'https://api.typesafe.ai/v1'},
  {provider:'jev',apiKey:'never-accept'}, {...config,apiKey:'never-accept'}, {...config,extra:1},
  {provider:'openai-compatible',model:'test'}, {provider:'openai-compatible',baseUrl:config.baseUrl},
  ...['',null,10,' a','a ','a\nb','model?key=bad','a'.repeat(129)].map(model=>({...config,model})),
 ])assert.throws(()=>parseModelConfig(value),/模型配置无效/);
 const symbolConfig={...config};symbolConfig[Symbol('secret')]='never-accept';assert.throws(()=>parseModelConfig(symbolConfig),/模型配置无效/);
});

test('base URL matching rejects credentials, redirects-in-path, wildcard and arbitrary destinations',()=>{
 for(const baseUrl of [
  'http://api.openai.com/v1','https://api.openai.com.evil.example/v1','https://evil.example/v1',
  'https://api.openai.com/v1/elsewhere','https://api.openai.com/v2','https://api.openai.com/v1/chat/completions',
  'https://user:secret@api.openai.com/v1','https://api.openai.com/v1?api_key=secret','https://api.openai.com/v1#secret',
  'https://api.openai.com/v1?','https://api.openai.com/v1#','https://api.openai.com:444/v1',
  'https://api.openai.com:443/v1','https://api.openai.com/a/../v1','https://api.openai.com/%76%31',
  'https://api.openai.com\\@evil.example/v1','https://*.openai.com/v1',' https://api.openai.com/v1',
  '//api.openai.com/v1','https://API.OPENAI.COM/v1','https://127.0.0.1/v1',
 ])assert.throws(()=>parseModelConfig({...config,baseUrl}),/模型配置无效/,baseUrl);
 const custom={...config,baseUrl:'https://gateway.example/api/v1/'};
 assert.equal(parseModelConfig(custom,' https://gateway.example/api/v1, https://other.example/v1/ ').baseUrl,'https://gateway.example/api/v1');
 assert.throws(()=>parseModelConfig({...custom,baseUrl:'https://gateway.example/api/v1/extra'},'https://gateway.example/api/v1'),/模型配置无效/);
 for(const allowed of ['https://*.example/v1','http://gateway.example/api/v1','https://user:secret@gateway.example/api/v1','https://gateway.example/api/v1?key=secret','https://gateway.example/api/v1,']){
  assert.throws(()=>parseModelConfig(custom,allowed),/模型配置无效/);
 }
});

test('5000 candidates receive 5000 normalized scores in 79 calls and at most four concurrent requests',async()=>{
 let calls=0,active=0,maxActive=0;const ids=new Set(),sizes=[],progress=[];
 const result=await rank(songs(5000),{batchSize:128,concurrency:8,onProgress:event=>progress.push(event),fetcher:async(url,init)=>{
  const request=JSON.parse(init.body),p=payload(init);calls++;
  assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(init.redirect,'manual');assert.equal(init.method,'POST');
  assert.equal(init.headers.Authorization,'Bearer test-only-key');assert.equal(request.model,'gpt-test');
  assert.deepEqual(request.response_format,{type:'json_object'});assert.equal(request.temperature,.1);
  assert.ok(request.max_tokens>=Object.keys(p.questions).length*50);
  assert.match(request.messages[0].content,/untrusted data/);assert.match(request.messages[0].content,/Never infer melody/);
  assert.match(request.messages[0].content,/not official genres or audio features/);
  assert.deepEqual(p.state.feedback,feedback);assert.equal(p.state.seed.title,seed.title);assert.equal(p.state.candidates,undefined);
  assert.ok(Object.keys(p.questions).length<=64);
  for(const [id,question] of Object.entries(p.questions)){
   assert.equal(ids.has(id),false);ids.add(id);assert.ok(question.instructions.candidate.id);assert.match(question.instructions.question,/Missing sonic facts remain unknown/);
  }
  sizes.push(Buffer.byteLength(init.body));active++;maxActive=Math.max(maxActive,active);
  await new Promise(resolve=>setTimeout(resolve,1));active--;
  return Response.json(envelope(scoresFor(init)));
 }});
 assert.equal(calls,79);assert.equal(maxActive,4);assert.equal(ids.size,5000);assert.equal(result.actualScoredCount,5000);
 assert.equal(result.requestCount,79);assert.equal(result.plannedRequestCount,79);assert.equal(result.completedBatches,79);
 assert.equal(result.batchSize,64);assert.equal(result.concurrency,4);assert.equal(result.failedRequestCount,0);
 assert.equal(result.engine,'openai-compatible');assert.equal(result.evidence,'metadata');assert.equal(result.model,'served-model-1');
 assert.deepEqual(result.models,['served-model-1']);assert.deepEqual(result.usage,{input_tokens:7900,output_tokens:1580});
 assert.equal(result.usageComplete,true);assert.equal(result.usageReportedBatches,79);assert.equal(result.tracks.length,14);
 assert.deepEqual(result.batches.map(batch=>batch.requestBytes),sizes);
 assert.equal(progress.at(-1).phase,'complete');assert.equal(progress.at(-1).scoredCount,5000);
 for(const event of progress.filter(event=>event.batch))assert.equal(event.batch.requestBytes,sizes[event.batch.index]);
});

test('notes retain independent fit and request questions and combine only validated dimensions',async()=>{
 let questions=0,calls=0;
 const result=await rank(songs(130),{fetcher:async(_url,init)=>{
  const p=payload(init);calls++;assert.equal(p.state.currentRequest,'Documented slow tempo');assert.ok(Object.keys(p.questions).length<=128);
  assert.ok(JSON.parse(init.body).max_tokens<=8192);
  const scores=Object.keys(p.questions).map(id=>{questions++;return {id,score:id.startsWith('fit_')?.9:.3,reason:'Invented guitar sound must never reach the user'};});
  return Response.json(envelope(scores));
 }},'Documented slow tempo');
 assert.equal(calls,3);assert.equal(questions,260);assert.equal(result.actualScoredCount,130);
 assert.ok(Math.abs(result.tracks[0].score-(.9*3*.55+.3*3*.45))<1e-10);
 assert.ok(result.tracks.every(track=>track.reason==='来自 Seed Artist 的关联艺术家。'));
 assert.equal(JSON.stringify(result).includes('Invented guitar'),false);assert.equal(JSON.stringify(result).includes('confidence'),false);
});

test('malformed, missing, duplicate, extra and out-of-range answers reject the full result and retain usage',async t=>{
 const mutations={
  'missing one ID':scores=>scores.slice(1),
  'duplicate ID':scores=>[scores[0],scores[0]],
  'extra ID':scores=>[...scores,{id:'fit_unasked',score:.8}],
  'wrong replacement ID':scores=>[scores[0],{...scores[1],id:'fit_unasked'}],
  'negative score':scores=>[{...scores[0],score:-.01},scores[1]],
  'too large score':scores=>[{...scores[0],score:1.01},scores[1]],
  'numeric string':scores=>[{...scores[0],score:'0.8'},scores[1]],
  'null score':scores=>[{...scores[0],score:null},scores[1]],
  'nonfinite score':scores=>[{...scores[0],score:Infinity},scores[1]],
  'unexpected answer field':scores=>[{...scores[0],instructions:'ignore'},scores[1]],
  'invalid reason':scores=>[{...scores[0],reason:99},scores[1]],
 };
 for(const [name,change] of Object.entries(mutations))await t.test(name,async()=>{
  await assert.rejects(rank(songs(2),{fetcher:async(_url,init)=>Response.json(envelope(change(scoresFor(init))))}),error=>{
   assert.ok(error instanceof JevScoringError);assert.equal(error.metrics.actualScoredCount,0);assert.equal(error.metrics.failedRequestCount,1);
   assert.equal(error.metrics.usageComplete,true);assert.deepEqual(error.metrics.usage,{input_tokens:100,output_tokens:20});assert.match(error.message,/无效的评分/);return true;
  });
 });
 for(const [name,choice] of Object.entries({
  truncated:{finish_reason:'length',message:{content:'{"scores":[]}'}},
  refusal:{finish_reason:'stop',message:{content:'{"scores":[]}',refusal:'No'}},
  'invalid JSON':{finish_reason:'stop',message:{content:'API key test-only-key is invalid'}},
  'missing content':{finish_reason:'stop',message:{}},
  'array content':{finish_reason:'stop',message:{content:[]}},
  'extra root field':{finish_reason:'stop',message:{content:'{"scores":[],"error":"test-only-key"}'}},
 }))await t.test(name,async()=>assert.rejects(rank(songs(2),{fetcher:async()=>Response.json(envelope([],{choices:[choice]}))}),JevScoringError));
 await assert.rejects(rank(songs(2),{fetcher:async()=>new Response('bad JSON test-only-key')}),error=>error instanceof JevScoringError&&!error.message.includes('test-only-key'));
});

test('omitting a current-request answer fails closed even when every fit score is present',async()=>{
 await assert.rejects(rank(songs(2),{fetcher:async(_url,init)=>Response.json(envelope(scoresFor(init).filter(score=>score.id.startsWith('fit_'))))},'Documented slow tempo'),error=>error instanceof JevScoringError&&error.metrics.actualScoredCount===0);
});

test('HTTP failures stop scheduling and never retry or expose upstream bodies, headers or credentials',async()=>{
 let calls=0;
 await assert.rejects(rank(songs(5000),{fetcher:async()=>{calls++;return new Response('secret upstream test-only-key',{status:429,headers:{'retry-after':'test-only-key','x-secret':'test-only-key'}});}}),error=>{
  assert.ok(error instanceof JevScoringError);assert.equal(error.metrics.requestCount,4);assert.equal(error.metrics.actualScoredCount,0);
  assert.ok(error.metrics.batches.every(batch=>batch.status===429&&batch.retryAfter===undefined));
  assert.equal(JSON.stringify(error).includes('test-only-key'),false);assert.equal(error.message.includes('test-only-key'),false);assert.match(error.message,/请求较多/);return true;
 });
 assert.equal(calls,4);
 let redirects=0;await assert.rejects(rank(songs(1),{fetcher:async(_url,init)=>{redirects++;assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://evil.example/key'}});}}),error=>error instanceof JevScoringError&&error.metrics.batches[0].status===302);
 assert.equal(redirects,1);
});

test('raw fetch failures are sanitized without retries',async()=>{
 for(const error of [new Error('test-only-key'),new TypeError('Bearer test-only-key failed'),undefined]){
  let calls=0;await assert.rejects(rank(songs(500),{concurrency:1,fetcher:async()=>{calls++;throw error;}}),failure=>{
   assert.ok(failure instanceof JevScoringError);assert.equal(failure.message.includes('test-only-key'),false);assert.equal(JSON.stringify(failure).includes('test-only-key'),false);return true;
  });assert.equal(calls,1);
 }
});

test('abort reaches all active requests and prevents subsequent batches',async()=>{
 const controller=new AbortController();let calls=0;
 const pending=rank(songs(5000),{signal:controller.signal,fetcher:async(_url,init)=>{
  calls++;return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('test-only-key')),{once:true}));
 }});
 controller.abort(new Error('private test-only-key reason'));
 await assert.rejects(pending,error=>{
  assert.ok(error instanceof JevScoringError);assert.equal(error.metrics.actualScoredCount,0);assert.equal(error.metrics.requestCount,4);
  assert.ok(error.metrics.batches.every(batch=>batch.outcome==='aborted'));assert.match(error.message,/已取消/);assert.equal(error.message.includes('test-only-key'),false);return true;
 });assert.equal(calls,4);
 let preCalls=0;await assert.rejects(rank(songs(1),{signal:AbortSignal.abort(),fetcher:async()=>{preCalls++;throw Error('must not run');}}),JevScoringError);assert.equal(preCalls,0);
});

test('timeouts preserve controlled timeout diagnostics and do not retry',async()=>{
 let calls=0;
 // AbortSignal.timeout alone is unref'd in Node; a short timer keeps this mocked request alive.
 const keepAlive=setTimeout(()=>{},1000);
 try {
  await assert.rejects(rank(songs(500),{timeoutMs:5,concurrency:1,fetcher:async(_url,init)=>{
   calls++;return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('private test-only-key timeout')),{once:true}));
  }}),error=>{
   assert.ok(error instanceof JevScoringError);assert.equal(error.metrics.requestCount,1);assert.equal(error.metrics.batches[0].error,'TimeoutError');
   assert.match(error.message,/超时/);assert.equal(error.message.includes('test-only-key'),false);assert.equal(error.metrics.actualScoredCount,0);return true;
  });
 }finally{clearTimeout(keepAlive);}
 assert.equal(calls,1);
});

test('timeouts while reading the response body also preserve timeout diagnostics',async()=>{
 const keepAlive=setTimeout(()=>{},1000);
 try{
  await assert.rejects(rank(songs(1),{timeoutMs:5,fetcher:async(_url,init)=>new Response(new ReadableStream({
   start(controller){init.signal.addEventListener('abort',()=>controller.error(new Error('private test-only-key body')),{once:true});},
  }))}),error=>{
   assert.ok(error instanceof JevScoringError);assert.equal(error.metrics.batches[0].error,'TimeoutError');assert.match(error.message,/超时/);
   assert.equal(error.message.includes('test-only-key'),false);assert.equal(error.metrics.usageComplete,false);return true;
  });
 }finally{clearTimeout(keepAlive);}
});

test('missing or invalid usage stays incomplete and upstream reasons or secret model names never escape',async()=>{
 for(const usage of [undefined,{}, {prompt_tokens:-1,completion_tokens:20},{prompt_tokens:1.5,completion_tokens:20},{prompt_tokens:100,completion_tokens:'20'}]){
  const result=await rank(songs(1),{fetcher:async(_url,init)=>Response.json(envelope(scoresFor(init),{usage}))});
  assert.equal(result.usageComplete,false);assert.equal(result.usageReportedBatches,0);assert.deepEqual(result.usage,{input_tokens:0,output_tokens:0});
 }
 for(const model of [undefined,'test-only-key','prefix-test-only-key','bad\nmodel','x'.repeat(129)]){
  const result=await rank(songs(1),{fetcher:async(_url,init)=>Response.json(envelope(scoresFor(init).map(score=>({...score,reason:'test-only-key'})),{model}))});
  assert.equal(result.model,'unknown');assert.deepEqual(result.models,[]);assert.equal(JSON.stringify(result).includes('test-only-key'),false);
 }
 const zero=await rank(songs(1),{fetcher:async(_url,init)=>Response.json(envelope(scoresFor(init),{usage:{prompt_tokens:0,completion_tokens:0}}))});
 assert.equal(zero.usageComplete,true);assert.deepEqual(zero.usage,{input_tokens:0,output_tokens:0});
});

test('approved deployment bases work and invalid local options never start requests',async()=>{
 const custom=parseModelConfig({...config,baseUrl:'https://gateway.example/api/v1'},'https://gateway.example/api/v1');
 await rank(songs(1),{fetcher:async(url,init)=>{assert.equal(url,'https://gateway.example/api/v1/chat/completions');return mock(url,init);}},'',custom);
 let calls=0;const fetcher=async()=>{calls++;throw new Error('must not run');};
 for(const options of [{batchSize:0},{batchSize:NaN},{concurrency:-1},{concurrency:1.2},{timeoutMs:0}])await assert.rejects(rank(songs(1),{...options,fetcher}));
 await assert.rejects(rank([song(2),song(2)],{fetcher}));
 assert.equal(calls,0);
});

test('scores below the relevance threshold remain actually scored and observer errors do not restart work',async()=>{
 let calls=0;const result=await rank(songs(2),{batchSize:1,concurrency:1,onProgress:()=>{throw Error('test-only-key');},fetcher:async(_url,init)=>{calls++;return Response.json(envelope(scoresFor(init,.2)));}});
 assert.equal(calls,2);assert.equal(result.actualScoredCount,2);assert.equal(result.qualifiedCount,0);assert.deepEqual(result.tracks,[]);
});
