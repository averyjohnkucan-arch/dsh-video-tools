import {executable} from './executables.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaults} from '../lib/config.js';
import {request,PRESETS} from '../lib/request.js';
import {finishMedia,validateMedia,probe,validateDecodedMedia} from '../lib/media.js';
import {run} from '../lib/process.js';
const cfg=defaults();cfg.ffmpegExecutable=executable('ffmpeg');cfg.ffprobeExecutable=executable('ffprobe');
test('every preset, custom padding and square crop retain native generation dimensions',()=>{
 for(const [resolution,[w,h]] of Object.entries(PRESETS))for(const shape of ['landscape','square']){
  const r=request({prompt:'scene',resolution,shape},cfg);
  assert.equal(r.width,shape==='square'?h:w);assert.equal(r.height,h);
  assert.equal(r.generationWidth,Math.ceil(w/32)*32);assert.equal(r.generationHeight,Math.ceil(h/32)*32);
 }
 const r=request({prompt:'scene',width:853,height:479},cfg);assert.equal(r.generationWidth,864);assert.equal(r.generationHeight,480);
 assert.throws(()=>request({prompt:'scene',resolution:'720p',width:512},cfg),/custom/);
 assert.throws(()=>request({prompt:'scene',resolution:'bad'},cfg));
});
test('duration and frame requests report upward 8n+1 rounding and reject ambiguous inputs',()=>{
 const r=request({prompt:'scene',duration:5,fps:24},cfg);assert.equal(r.frames,121);assert.equal(r.duration,121/24);assert.equal(r.rounded,true);
 assert.equal(request({prompt:'scene',frames:242},cfg).frames,249);
 assert.equal(request({prompt:'scene',frames:121},cfg).rounded,false);
 assert.throws(()=>request({prompt:'scene',duration:5,frames:121},cfg));
 assert.throws(()=>request({prompt:'scene',negative_prompt:'blur'},cfg),/inactive/);
 assert.equal(request({prompt:'scene',tags:['HQ'],negative_prompt:'blur'},cfg).negativePrompt,'blur');
 assert.throws(()=>request({prompt:'scene',upscale:true},cfg),/not qualified/);
});
test('real media processing crops 480p, square and odd sizes and preserves synchronized audio or removes it',async t=>{
 const root=await mkdtemp(join(tmpdir(),'video-crop-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const shape of ['landscape','square','odd'])for(const audio of [true,false]){
  const r=request({prompt:'scene',...(shape==='odd'?{width:853,height:479,shape:'landscape'}:{resolution:'480p',shape}),frames:9,audio},cfg),raw=join(root,`raw-${shape}-${audio}.webm`),out=join(root,`out-${shape}-${audio}.webm`);
  await run(cfg.ffmpegExecutable,['-v','error','-f','lavfi','-i','testsrc2=s=864x480:r=24','-f','lavfi','-i','sine=frequency=440:sample_rate=24000','-frames:v','9','-t','0.375','-c:v','libvpx-vp9','-threads','1','-c:a','libopus',raw]);
  const info=await finishMedia(cfg,r,raw,out);assert.equal(info.streams.filter(s=>s.codec_type==='audio').length,Number(audio));
  assert.throws(()=>validateMedia(info,{...r,fps:30}),/frame-rate/);
  if(audio){const broken=structuredClone(info);broken.streams.find(s=>s.codec_type==='audio').validatedEnd=5;assert.throws(()=>validateMedia(broken,r),/timing/);}
 }
});
test('timeouts terminate owned processes and provide a useful error',async()=>{
 let pid;await assert.rejects(run(process.execPath,['-e','setInterval(()=>{},100)'],{timeoutMs:100,onSpawn:c=>pid=c.pid}),/timed out/);
 assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});

test('entirely white inference output cannot be reported as a successful generation',async t=>{
 const root=await mkdtemp(join(tmpdir(),'video-white-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=join(root,'white.webm');
 await run(cfg.ffmpegExecutable,['-v','error','-f','lavfi','-i','color=white:s=256x256:r=24','-frames:v','9','-c:v','libvpx-vp9','-threads','1',file]);
 await assert.rejects(validateDecodedMedia(cfg,{frames:9},file),/entirely clipped/);
});

test('square crop keeps the center pixels and excludes both landscape side bands',async t=>{
 const root=await mkdtemp(join(tmpdir(),'video-center-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const raw=join(root,'bands.webm'),out=join(root,'square.webm');
 await run(cfg.ffmpegExecutable,['-v','error','-f','lavfi','-i','color=blue:s=864x480:r=24,drawbox=x=0:y=0:w=192:h=480:color=red:t=fill,drawbox=x=672:y=0:w=192:h=480:color=green:t=fill','-f','lavfi','-i','sine=frequency=440:sample_rate=24000','-frames:v','9','-t','0.375','-c:v','libvpx-vp9','-lossless','1','-threads','1','-c:a','libopus',raw]);
 const r=request({prompt:'scene',resolution:'480p',shape:'square',frames:9,audio:false},cfg);await finishMedia(cfg,r,raw,out);
 const {stdout}=await run(cfg.ffmpegExecutable,['-v','error','-i',out,'-vf','signalstats,metadata=print:file=-','-an','-f','null','-']);
 const minima=[...stdout.matchAll(/lavfi.signalstats.UMIN=([0-9.]+)/g)].map(m=>Number(m[1]));
 assert.equal(minima.length,9);assert.ok(minima.every(n=>n>230),'the entire retained square must remain blue, with no red or green edge band');
});

test('browser delivery produces H.264/AAC MP4 with exact size and audio',async t=>{
 const root=await mkdtemp(join(tmpdir(),'video-mp4-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const raw=join(root,'raw.webm'),out=join(root,'result.mp4');
 await run(cfg.ffmpegExecutable,['-v','error','-f','lavfi','-i','testsrc2=s=256x256:r=24','-f','lavfi','-i','sine=frequency=440:sample_rate=24000','-frames:v','9','-t','0.375','-c:v','libvpx-vp9','-threads','1','-c:a','libopus',raw]);
 const r=request({prompt:'scene',width:256,height:256,frames:9,audio:true},cfg);
 const info=await finishMedia(cfg,r,raw,out);
 assert.equal(info.streams.find(s=>s.codec_type==='video').codec_name,'h264');
 assert.equal(info.streams.find(s=>s.codec_type==='audio').codec_name,'aac');
 assert.ok(info.format.format_name.includes('mp4'));
});
