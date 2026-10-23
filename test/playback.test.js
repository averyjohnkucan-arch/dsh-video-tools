import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {serveVideo} from '../lib/playback.js';
test('saved video supports browser seeking, downloads and rejects invalid references',async t=>{
 const root=await mkdtemp(join(tmpdir(),'video-http-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=join(root,'clip.mp4');await writeFile(file,'0123456789');
 const server=createServer((req,res)=>serveVideo({fileHostPath:()=>file},req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}/?id=sha256:${'a'.repeat(64)}&name=generated-video.mp4`;
 const part=await fetch(url,{headers:{Range:'bytes=2-5'}});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),'bytes 2-5/10');assert.equal(await part.text(),'2345');assert.equal(part.headers.get('content-type'),'video/mp4');
 const end=await fetch(url,{headers:{Range:'bytes=-3'}});assert.equal(await end.text(),'789');
 assert.equal((await fetch(url,{headers:{Range:'bytes=22-'}})).status,416);
 assert.match((await fetch(url+'&download=1')).headers.get('content-disposition'),/^attachment/);
 assert.equal((await fetch(url.replace('generated-video.mp4','..%2Fsecret'))).status,400);
});
