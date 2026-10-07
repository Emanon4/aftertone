import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const bundle=await build({entryPoints:['web/lib/storage.ts'],absWorkingDir:root,bundle:true,platform:'node',format:'esm',write:false,alias:{'@':root}});
const {parseBackup,toBackup,toCsv,toText,readShare,mergeTracks,withoutPreview}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const t=(id,extra={})=>({id:String(id),provider:'deezer',title:`Song ${id}`,artist:`Artist ${id}`,album:'A',image:'https://cdn.example/a.jpg',url:`https://www.deezer.com/track/${id}`,duration:200,preview:'https://signed.example/p.mp3',...extra});

test('backups round-trip saved and dismissed songs without preview URLs',()=>{
 const backup=toBackup([t(1)],[{...t(2),dismissReason:'artist'}]);
 assert.equal(JSON.stringify(backup).includes('signed.example'),false);
 const parsed=parseBackup(JSON.stringify(backup));
 assert.equal(parsed.saved[0].id,'1');assert.equal(parsed.dismissed[0].dismissReason,'artist');
});
test('imports keep only well-formed tracks and safe URLs',()=>{
 const file=JSON.stringify({app:'aftertone',version:1,saved:[t(1,{image:'javascript:alert(1)',url:'data:text/html,x'}),{id:'x',provider:'deezer'},{id:'3',provider:'evil',title:'a',artist:'b'},null],dismissed:[{...t(4),dismissReason:'nonsense'}]});
 const parsed=parseBackup(file);
 assert.equal(parsed.saved.length,1);assert.equal(parsed.saved[0].image,'');assert.equal(parsed.saved[0].url,'');
 assert.equal(parsed.dismissed[0].dismissReason,undefined);
 assert.throws(()=>parseBackup('{"app":"other","saved":[]}'));assert.throws(()=>parseBackup('not json'));
});
test('CSV escapes quotes and commas; text export is numbered',()=>{
 const csv=toCsv([t(1,{title:'Hello, "World"'})]);
 assert.ok(csv.includes('"Hello, ""World"""'));assert.ok(csv.startsWith('﻿title,artist'));
 assert.equal(toText([t(1),t(2)]),'01. Artist 1 — Song 1\n02. Artist 2 — Song 2');
});
test('share hashes accept only provider IDs, at most seven',()=>{
 const share=readShare('#share=deezer:1,itunes:2,evil:3,deezer:abc,'+Array.from({length:10},(_,i)=>`deezer:${i+10}`).join(',')+'&from=deezer:9');
 assert.equal(share.tracks.length,7);assert.deepEqual(share.tracks[1],{provider:'itunes',id:'2'});assert.deepEqual(share.from,{provider:'deezer',id:'9'});
 assert.equal(readShare('#share=javascript:alert(1)'),null);assert.equal(readShare(''),null);
});
test('merge keeps existing order and skips duplicates',()=>{
 assert.deepEqual(mergeTracks([t(1),t(2)],[t(2),t(3),t(3)]).map(x=>x.id),['1','2','3']);
 assert.equal(withoutPreview(t(1)).preview,undefined);
});
