import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coverAt} from '../lib/music.ts';
test('coverAt resizes Deezer and iTunes artwork and leaves other URLs alone',()=>{
 assert.equal(coverAt('https://cdn-images.dzcdn.net/images/cover/6f4f35fdc77ef818f0e0e29211cac77f/500x500-000000-80-0-0.jpg',56),'https://cdn-images.dzcdn.net/images/cover/6f4f35fdc77ef818f0e0e29211cac77f/56x56-000000-80-0-0.jpg');
 assert.equal(coverAt('https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/600x600bb.jpg',120),'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/120x120bb.jpg');
 assert.equal(coverAt('https://example.com/500x500-a.jpg',56),'https://example.com/500x500-a.jpg');
});
