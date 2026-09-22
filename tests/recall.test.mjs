import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectCandidatePool} from '../lib/server/recall.ts';
const seed={id:'1',provider:'deezer',artist:'Seed',title:'Seed',album:'Album',image:'',url:'',duration:180,previewAvailable:true};
const song=(id,extra={})=>({...seed,id:String(id),artist:`Artist ${Math.floor(id/4)}`,title:`Song ${id}`,...extra});
test('index recall fills 200 candidates with a cap per artist, without requiring live recall',()=>{
 const library=Array.from({length:1000},(_,i)=>song(i+10));
 const tracks=selectCandidatePool(seed,library,[],[],'close',200,()=>0);
 assert.equal(tracks.length,200);const counts=new Map();
 for(const t of tracks)counts.set(t.artist,(counts.get(t.artist)||0)+1);
 assert.ok([...counts.values()].every(n=>n<=3));
 assert.ok(tracks.some(t=>Number(t.id)>200));
});
test('recall excludes seed, blocked recordings across providers, duplicate ISRCs and unavailable previews',()=>{
 const candidates=[seed,song(2,{artist:'Seed',title:'Seed'}),song(3,{artist:'Blocked',title:'Song'}),song(4,{provider:'itunes',artist:'Blocked',title:'Song'}),song(5,{isrc:'REC1'}),song(6,{isrc:'REC1'}),song(7,{previewAvailable:false}),song(8)];
 const tracks=selectCandidatePool(seed,candidates,[],['deezer:3'],'close',200,()=>.999);
 assert.deepEqual(tracks.map(t=>t.id),['5','8']);
});
test('exploration excludes the seed artist; artist genre evidence stays distinct from album genre',()=>{
 const library=[song(2,{artist:'Seed'}),song(3,{artistGenres:['Jazz']}),song(4,{artistGenres:['Jazz']})];
 const tracks=selectCandidatePool({...seed,genre:'Jazz'},library,[],[],'sideways',200,()=>.999);
 assert.deepEqual(tracks.map(t=>t.id),['3','4']);assert.equal(tracks[0].genre,undefined);
 assert.deepEqual(tracks[0].artistGenres,['Jazz']);assert.equal(tracks[0].source,'曲库关联探索');
});

test('large recall fills 5000 unique recordings with dynamic artist caps no higher than 20',()=>{
 const library=Array.from({length:20_000},(_,i)=>song(i+10,{artist:`Artist ${Math.floor(i/40)}`}));
 const tracks=selectCandidatePool(seed,library,[],[],'close',5000,()=>.4);
 assert.equal(tracks.length,5000);assert.equal(new Set(tracks.map(t=>t.id)).size,5000);
 const counts=new Map();for(const t of tracks)counts.set(t.artist,(counts.get(t.artist)||0)+1);
 assert.ok([...counts.values()].every(n=>n<=20));assert.ok(counts.size>=250);
});
test('large recall reports the actual available count instead of duplicating songs to fill 5000',()=>{
 const library=Array.from({length:100},(_,i)=>song(i+10,{artist:'Only one artist'}));
 assert.equal(selectCandidatePool(seed,library,[],[],'close',5000,()=>.5).length,20);
});
