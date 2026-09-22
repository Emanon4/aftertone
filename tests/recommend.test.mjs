import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankWithJev,readScore,selectTracks} from '../lib/server/recommend.ts';
import {applyExplicitFilters} from '../lib/server/filters.ts';
const seed={id:'1',provider:'deezer',title:'Seed',artist:'Seed Artist',album:'Seed',image:'',url:'',duration:120};
const song=(id,extra={})=>({...seed,id:String(id),artist:'Artist '+id,title:'Song '+id,source:'关联艺术家',...extra});
test('malformed model scores fail closed',()=>{for(const a of [undefined,{type:'score',score:4,confidence:.8},{type:'score',score:2,confidence:NaN},{type:'choice',score:2,confidence:.5}])assert.throws(()=>readScore(a));});
test('every candidate is scored with bounded batch count and distinct artists',async()=>{let calls=0;const candidates=Array.from({length:35},(_,i)=>song(i+2));const mock=async(url,opts)=>{calls++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');const payload=JSON.parse(opts.body);assert.ok(payload.state.candidates.length<=16);return Response.json({model:'test',answers:Object.fromEntries(Object.keys(payload.questions).map(k=>[k,{type:'score',score:2.3,confidence:.8}]))});};const result=await rankWithJev(seed,candidates,'close','', 'test-only-key',{liked:[],disliked:[]},mock);assert.equal(calls,3);assert.equal(result.candidateCount,35);assert.equal(result.tracks.length,14);assert.equal(new Set(result.tracks.map(x=>x.artist)).size,14);});
test('one upstream failure rejects the entire recommendation',async()=>{let calls=0;await assert.rejects(rankWithJev(seed,Array.from({length:20},(_,i)=>song(i+2)),'close','','test-only-key',{liked:[],disliked:[]},async(url,opts)=>{calls++;if(calls===2)return new Response('',{status:429});const payload=JSON.parse(opts.body);return Response.json({answers:Object.fromEntries(Object.keys(payload.questions).map(k=>[k,{type:'score',score:2,confidence:.5}]))});}));assert.equal(calls,2);});
test('exploration avoids same artist and repeated artists',()=>{const result=selectTracks([song(2,{artist:seed.artist,score:3}),song(3,{artist:'New',score:2.9}),song(4,{artist:'New',score:2.8}),song(5,{artist:'Another',score:2.5})],seed,'sideways');assert.deepEqual(result.map(x=>x.id),['3','5']);});
test('explicit live and decade constraints exclude conflicts and unknown years',()=>{const songs=[song(2,{title:'Track (Live)',year:'1995'}),song(3,{year:'1996'}),song(4,{year:'2001'}),song(5)];assert.deepEqual(applyExplicitFilters(songs,'不要现场版，想听90年代的歌').map(x=>x.id),['3']);});

test('200 candidates use 13 batches with at most 3 requests in flight',async()=>{
 let active=0,maximum=0,calls=0;const result=await rankWithJev(seed,Array.from({length:200},(_,i)=>song(i+2)),'close','','test-only-key',{liked:[],disliked:[]},async(url,opts)=>{
  calls++;active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,3));active--;
  const payload=JSON.parse(opts.body);return Response.json({answers:Object.fromEntries(Object.keys(payload.questions).map(k=>[k,{type:'score',score:2,confidence:.5}]))});
 });assert.equal(maximum,3);assert.equal(calls,13);assert.equal(result.candidateCount,200);
});
test('a failed first wave does not schedule remaining paid batches',async()=>{
 let calls=0;await assert.rejects(rankWithJev(seed,Array.from({length:200},(_,i)=>song(i+2)),'close','','test-only-key',{liked:[],disliked:[]},async()=>{calls++;return new Response('',{status:429});}));assert.equal(calls,3);
});
