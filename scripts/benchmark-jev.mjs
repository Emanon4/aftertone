// Run mock by default. A paid benchmark requires --real and an existing local key.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rankWithJev,readScore,JEV_DEFAULTS,JevScoringError} from '../lib/server/recommend.ts';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const real=args.includes('--real');
const count=Number(arg('--count','5000'));
const batchSize=Number(arg('--batch-size',String(JEV_DEFAULTS.batchSize)));
const concurrency=Number(arg('--concurrency',String(JEV_DEFAULTS.concurrency)));
if(!Number.isInteger(count)||count<1)throw new Error('--count must be a positive integer');
const mode=real?'live':'mock';
const label=`benchmark-${count}${real?'':'-mock'}`;
const outputFile=resolve(project,'output',`${label}.json`);
const scoresFile=resolve(project,'output',`${label}-scores.json`);
const sha=value=>createHash('sha256').update(value).digest('hex');
const identity=t=>`${t.provider}_${t.id}`;
const catalogPath=resolve(project,arg('--catalog','public/catalog'));
let manifestPath=extname(catalogPath)==='.json'?catalogPath:resolve(catalogPath,'manifest.json');
let sourceBytes;
try{sourceBytes=await readFile(manifestPath);}catch(error){
 if(error.code!=='ENOENT'||extname(catalogPath)==='.json')throw error;
 manifestPath=resolve(catalogPath,'library.json');sourceBytes=await readFile(manifestPath);
}
const catalogDocument=JSON.parse(sourceBytes);
const sourceFiles=[{path:relative(project,manifestPath),sha256:sha(sourceBytes)}];
let library;
if(Array.isArray(catalogDocument)){library=catalogDocument;}else{
 if(catalogDocument.version!==2||!Array.isArray(catalogDocument.shards))throw new Error('Expected a v2 catalog manifest or a legacy Track[] JSON file');
 library=[];
 for(const shard of catalogDocument.shards){
  if(!/^part-\d{3,6}\.json$/.test(shard.file))throw new Error('Invalid shard filename');
  const filename=resolve(dirname(manifestPath),shard.file),bytes=await readFile(filename),tracks=JSON.parse(bytes);
  if(!Array.isArray(tracks)||tracks.length!==shard.count)throw new Error(`Invalid shard count: ${shard.file}`);
  sourceFiles.push({path:relative(project,filename),sha256:sha(bytes)});library.push(...tracks);
 }
 if(library.length!==catalogDocument.tracks)throw new Error('Catalog track count does not match manifest');
}
const seed=library.find(t=>t.artist==='Radiohead'&&t.title==='No Surprises')||library.find(t=>t.artist==='Radiohead');
if(!seed)throw new Error('Radiohead seed is missing from the real catalog');
const unique=new Map();
const songs=new Set();
for(const track of library){
 const id=identity(track),titleArtist=`${track.artist.normalize('NFKC').trim().toLowerCase()}|${track.title.normalize('NFKC').trim().toLowerCase()}`;
 if(id===identity(seed)||unique.has(id)||songs.has(titleArtist))continue;
 unique.set(id,track);songs.add(titleArtist);
}
const candidates=[...unique.values()].sort((a,b)=>sha(identity(a)).localeCompare(sha(identity(b)))).slice(0,count).map(t=>({...t,source:'曲库开放探索'}));
if(candidates.length!==count)throw new Error(`Only ${candidates.length} distinct candidates available; ${count} required`);
const key=real?(await readFile(process.env.TYPESAFE_KEY_FILE||resolve(homedir(),'.config/typesafe/api-key.txt'),'utf8')).trim():'mock-key';
if(!key)throw new Error('Local API key file is empty');
const redact=text=>real?String(text).split(key).join('[REDACTED]'):String(text);
const audit=new Map(),requestedIds=new Set(),duplicateRequested=[],duplicateAnswered=[],http=[];
let active=0,maxActive=0;
const fetcher=async(url,options)=>{
 const payload=JSON.parse(options.body),questionIds=Object.keys(payload.questions);
 const candidateIds=questionIds.filter(id=>id.startsWith('fit_')).map(id=>id.slice(4));
 for(const id of candidateIds){if(requestedIds.has(id))duplicateRequested.push(id);requestedIds.add(id);}
 const started=performance.now();active++;maxActive=Math.max(maxActive,active);
 try{
  let response;
  if(real){response=await fetch(url,options);}else{
   await new Promise(r=>setTimeout(r,1));
   response=Response.json({model:'mock-not-real',usage:{input_tokens:questionIds.length*300,output_tokens:questionIds.length*20},answers:Object.fromEntries(questionIds.map(id=>[id,{type:'score',score:2,confidence:.8}]))});
  }
  const body=await response.text();let data;try{data=JSON.parse(body);}catch{}
  const record={status:response.status,wallMs:Math.round(performance.now()-started),candidateCount:candidateIds.length,questionCount:questionIds.length,requestBytes:Buffer.byteLength(options.body)};
  if(!response.ok)record.error=redact(body).slice(0,1600);
  const retryAfter=response.headers.get('retry-after');if(retryAfter)record.retryAfter=retryAfter;
  http.push(record);
  if(response.ok&&data?.answers){
   for(const id of candidateIds){
    try{
     const fit=data.answers[`fit_${id}`];readScore(fit);
     const request=data.answers[`request_${id}`];if(questionIds.includes(`request_${id}`))readScore(request);
     if(audit.has(id))duplicateAnswered.push(id);
     audit.set(id,{id,score:fit.score,confidence:fit.confidence,...(request?{requestScore:request.score}:{}),model:data.model});
    }catch{/* Invalid or missing responses are counted by the scorer and audit below. */}
   }
  }
  return new Response(body,{status:response.status,headers:response.headers});
 }finally{active--;}
};
const startedAt=new Date().toISOString();
console.log(JSON.stringify({mode,startedAt,requestedCandidates:count,batchSize,concurrency,seed:{id:identity(seed),title:seed.title,artist:seed.artist}}));
const controller=new AbortController();
const cancel=()=>controller.abort(new Error('Benchmark interrupted'));
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
let result,failure;
try{
 result=await rankWithJev(seed,candidates,'sideways','',key,{liked:[],disliked:[]},{
  batchSize,concurrency,fetcher,signal:controller.signal,
  onProgress:p=>{if(p.phase!=='scoring'||p.completedBatches===0||p.completedBatches%5===0)console.log(JSON.stringify({phase:p.phase,scoredCount:p.scoredCount,totalCount:p.totalCount,completedBatches:p.completedBatches,totalBatches:p.totalBatches,elapsedMs:p.elapsedMs,activeRequests:p.activeRequests}));},
 });
}catch(error){failure=error;}
process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
const metrics=result|| (failure instanceof JevScoringError?failure.metrics:null);
const candidateIds=candidates.map(identity),missing=candidateIds.filter(id=>!audit.has(id));
const complete=Boolean(!failure&&metrics?.actualScoredCount===count&&requestedIds.size===count&&audit.size===count&&!missing.length&&!duplicateRequested.length&&!duplicateAnswered.length);
const times=(metrics?.batches||[]).map(b=>b.wallMs).sort((a,b)=>a-b);
const percentile=p=>times.length?times[Math.max(0,Math.ceil(times.length*p)-1)]:null;
const scores=[...audit.values()].sort((a,b)=>a.id.localeCompare(b.id));
const scoresText=JSON.stringify(scores,null,2)+'\n';
const report={
 schemaVersion:1,mode,startedAt,finishedAt:new Date().toISOString(),status:complete?'complete':'failed',
 evidence:'metadata-only; no audio input; no extrapolation; one fit question per candidate',
 source:{path:relative(project,manifestPath),sha256:sha(sourceBytes),files:sourceFiles,libraryCount:library.length,uniqueAvailableExcludingSeed:unique.size,candidateSelection:'Stable SHA-256 ordering; exclude seed and duplicate provider/id or normalized artist/title',candidateIdsSha256:sha(JSON.stringify(candidateIds))},
 seed:{id:identity(seed),title:seed.title,artist:seed.artist,album:seed.album,genre:seed.genre||null,collectionGroups:seed.collectionGroups||[]},
 parameters:{count,batchSize,concurrency,direction:'sideways',notes:'',modelRequested:'jev-latest',automaticRetries:0},
 limitsVerified:{checkedAt:startedAt,sources:['https://docs.typesafe.ai/models','https://docs.typesafe.ai/api','https://docs.typesafe.ai/primitives/advanced'],totalContextTokens:64000,statePlusLongestQuestionTokens:32000,advertisedTokensPerSecond:250000,advertisedRequestsPerMinute:1200,fixedQuestionLimit:null,fixedConcurrencyLimit:null,note:'Official rate limits are dynamic; application batch/concurrency bounds are not provider guarantees. Structured per-question candidate data is officially supported.'},
 ...(metrics?{wallMs:metrics.wallMs,requestCount:metrics.requestCount,plannedRequestCount:metrics.plannedRequestCount,actualScoredCount:metrics.actualScoredCount,completedBatches:metrics.completedBatches,failedRequestCount:metrics.failedRequestCount,usage:metrics.usage,usageComplete:metrics.usageComplete,models:metrics.models,batches:metrics.batches}:{}),
 latencyMs:{mean:times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):null,p50:percentile(.5),p95:percentile(.95),min:times[0]??null,max:times.at(-1)??null},
 observedMaxConcurrency:maxActive,
 scoreAudit:{requestedIdentityCount:requestedIds.size,validatedResponseCount:audit.size,missingIds:missing,duplicateRequestedIds:duplicateRequested,duplicateAnsweredIds:duplicateAnswered,scoresPath:`output/${label}-scores.json`,scoresSha256:sha(scoresText),complete},
 metadataCoverage:{albumGenre:candidates.filter(t=>t.genre).length,artistDirectoryGenres:candidates.filter(t=>t.artistGenres?.length).length,editorialCollectionGroups:candidates.filter(t=>t.collectionGroups?.length).length,year:candidates.filter(t=>t.year).length,bpm:candidates.filter(t=>t.bpm).length,distinctArtists:new Set(candidates.map(t=>t.artist)).size},
 recommendation:result?{qualifiedCount:result.qualifiedCount,returnedCount:result.tracks.length,tracks:result.tracks.map(({id,provider,title,artist,score})=>({id,provider,title,artist,score}))}:null,
 error:failure?redact(failure instanceof Error?failure.message:'Benchmark failed'):null,http,
 limitations:['One run is not a latency distribution across days.','Measures complete API scoring of catalog text, not auditory recommendation quality.','No monetary cost estimate.','Unknown or sparse metadata remains unknown; no genre, emotion or audio feature is fabricated.'],
};
await mkdir(dirname(outputFile),{recursive:true});
await writeFile(scoresFile,redact(scoresText));
await writeFile(outputFile,redact(JSON.stringify(report,null,2)+'\n'));
if(!complete)await writeFile(resolve(project,'output',`${label}-failed-${Date.now()}.json`),redact(JSON.stringify(report,null,2)+'\n'));
console.log(JSON.stringify({report:outputFile,status:report.status,wallMs:report.wallMs,requestCount:report.requestCount,actualScoredCount:report.actualScoredCount,latencyMs:report.latencyMs,usage:report.usage,models:report.models,error:report.error}));
if(!complete)process.exitCode=1;
