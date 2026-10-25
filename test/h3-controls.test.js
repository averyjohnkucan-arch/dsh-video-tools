import test from 'node:test';import assert from 'node:assert/strict';import {h3Request,h3Parameters} from '../lib/h3.js';import {defaults,validate} from '../lib/config.js';import {setStage,progressSnapshot,meanStages} from '../lib/progress.js';
const config=()=>{const c=defaults();c.h3.enabled=true;c.h3.modelPath='/models/fl2va';c.h3.referenceModelPath='/models/ref2va';return c;};
test('H3 presets and expert overrides reach the effective request without changing checkpoint',()=>{
 const cfg=config();for(const [quality,steps] of [['fast',12],['balanced',20],['more_steps',30]]){const r=h3Request({prompt:'scene',quality},cfg);assert.equal(r.profile.steps,steps);assert.equal(r.profile.modelPath,'/models/fl2va');}
 cfg.h3.steps=24;assert.equal(h3Request({prompt:'scene'},cfg).profile.steps,24);
 const r=h3Request({prompt:'scene',quality:'fast',steps:18,sampler:'euler',scheduler:'normal',shift_video:10,shift_audio:2,crf:22},cfg);assert.deepEqual(r.effectiveSettings,{quality:'fast',steps:18,sampler:'euler',scheduler:'normal',guidance:1,shiftVideo:10,shiftAudio:2,referenceImageSize:'match',crf:22,memoryMode:'lowvram',mode:'t2va'});
 for(const option of [{steps:0},{steps:61},{sampler:'invented'},{scheduler:'invented'},{crf:41},{shift_audio:0},{guidance:2},{negative_prompt:'bad'}])assert.throws(()=>h3Request({prompt:'scene',...option},cfg));
});
test('H3 explicit reference mode routes to Ref2VA, preserves order and enforces combinations/counts',()=>{
 const cfg=config();const r=h3Request({prompt:'<Picture 1> meets <Video 1>.',reference_images:[{path:'a.png'}],reference_videos:[{attachment_id:'video',include_audio:true}],reference_audios:[{path:'sound.wav'}],ref_image_size:'max'},cfg);
 assert.equal(r.profile.modelPath,'/models/ref2va');assert.equal(r.referenceMode,true);assert.equal(r.referenceImageSize,'max');assert.equal(r.references.videos[0].include_audio,true);
 for(const args of [{reference_images:[{}]},{reference_images:[{path:'a',attachment_id:'b'}]},{reference_images:[{path:'a'}],first_frame_path:'b.png'},{reference_images:Array(10).fill({path:'a'})},{reference_images:Array(9).fill({path:'a'}),reference_audios:Array(3).fill({path:'a'}),reference_videos:[{path:'b'}]}])assert.throws(()=>h3Request({prompt:'scene',...args},cfg));
 assert.ok(h3Parameters.reference_videos.items.properties.include_audio);
});
test('H3 shapes and frame semantics return exact effective dimensions and rounded timeline',()=>{
 const cfg=config();const p=h3Request({prompt:'scene',resolution:'480p',shape:'portrait',frames:124},cfg);assert.equal(p.width,480);assert.equal(p.height,864);assert.equal(p.frames,124);assert.equal(p.fps,24);
 assert.throws(()=>h3Request({prompt:'scene',duration:5,frames:124},cfg));assert.throws(()=>h3Request({prompt:'scene',resolution:'768p',width:256},cfg));
 assert.equal(h3Request({prompt:'scene',duration:15},cfg).frames,362);
 const old=defaults();delete old.h3.quality;assert.equal(validate(old).h3.quality,'balanced');
});
test('observed stage timing supplies calibrated ETA and never reaches completion during saving',()=>{
 const job={status:'running',estimatedStages:meanStages([{loading:10000,sampling:20000,saving:2000}])};setStage(job,'loading',1000);assert.equal(progressSnapshot(job,6000).etaSeconds,27);
 setStage(job,'sampling',11000);job.stepSeconds=2;job.step=5;job.total=10;job.stepAt=21000;assert.equal(progressSnapshot(job,22000).etaSeconds,11);
 setStage(job,'saving',31000);assert.equal(job.percent,99);assert.equal(progressSnapshot(job,32000).etaSeconds,1);setStage(job,'complete',33000);job.status='complete';assert.equal(progressSnapshot(job).percent,100);assert.equal(job.stageTimings.loading,10000);
});
test('H3 prompt assembly honors explicit verbatim requests and aligns keyframes to actual duration',()=>{
 const cfg=config();const r=h3Request({prompt:'A robot waves.',first_frame_path:'first.png',last_frame_path:'last.png',duration:4,soundscape:'A quiet room.',music:'N/A'},cfg);
 assert.match(r.prompt,/Picture 2 \(from Shot 1\).*4\.46-second/);assert.match(r.prompt,/integrated_multimodal_description: \[Shot 1\] A robot waves/);assert.match(r.prompt,/overall_soundscape: A quiet room/);
 assert.equal(h3Request({prompt:'exact input',verbatim:true},cfg).prompt,'exact input');
 assert.throws(()=>h3Request({prompt:'exact input',verbatim:true,music:'score'},cfg));
});
