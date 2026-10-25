import test from 'node:test';import assert from 'node:assert/strict';
import {setStage,updateProgress,progressSnapshot} from '../lib/progress.js';
import {VideoRuntime} from '../lib/runtime.js';
import {h3Request,h3Description} from '../lib/h3.js';import {defaults,validate} from '../lib/config.js';
import {clipGuidance,promptGuide} from '../lib/prompt-guide.js';
test('partial worker output supplies steps, approximate percent and a finite ETA',()=>{
 const job={status:'running'};setStage(job,'loading',0);assert.equal(progressSnapshot(job,100).percent,null);assert.equal(progressSnapshot(job,100).etaSeconds,null);
 updateProgress(job,'{"stage":"sampling"}\n',1000);
 updateProgress(job,'{"stage":"sampling","ste',6000);assert.equal(job.step,undefined);
 updateProgress(job,'p":1,"total":8}\n',11000);
 assert.equal(job.percent,15);assert.equal(progressSnapshot(job,11000).etaSeconds,85);
 updateProgress(job,'{"stage":"sampling","step":2,"total":8}\n',21000);assert.equal(job.percent,26);assert.equal(progressSnapshot(job,21000).etaSeconds,75);
 updateProgress(job,'{"stage":"sampling","step":8,"total":8}\n{"stage":"decoding"}\n',81000);
 assert.equal(progressSnapshot(job,82000).percent,90);assert.equal(progressSnapshot(job,82000).etaSeconds,null);
 setStage(job,'restoring');assert.equal(job.percent,98);job.status='complete';setStage(job,'complete');assert.equal(progressSnapshot(job).percent,100);
});
test('progress does not mix concurrent calls or disclose logs, paths or prompts',()=>{
 const runtime=new VideoRuntime({},'/tmp/unused');runtime.jobs.set('a',{callId:'a',status:'running',stage:'sampling',percent:15,log:'secret',directory:'private'});runtime.jobs.set('b',{callId:'b',status:'running',percent:75});
 assert.equal(runtime.progress('a').percent,15);assert.equal(runtime.progress('b').percent,75);assert.equal(runtime.progress('missing'),null);assert.equal(runtime.progress(),null);assert.doesNotMatch(JSON.stringify(runtime.progress('a')),/secret|private/);
 runtime.jobs.set('duplicate',{callId:'a',status:'running'});assert.equal(runtime.progress('a'),null);
});
test('portable tqdm evidence works; retries reset stale progress; terminal calls have no ETA',()=>{
 const job={status:'running',started:1000};updateProgress(job,'\r 25%|xx| 2/8 [00:20<01:00, 10.0s/it]\r',21000);assert.equal(job.percent,26);assert.equal(progressSnapshot(job,21000).etaSeconds,75);
 setStage(job,'loading',22000);assert.equal(job.percent,null);assert.equal(progressSnapshot(job,22000).etaSeconds,null);
 job.status='cancelled';assert.equal(progressSnapshot(job).etaSeconds,null);
});
test('H3 has independent settings, request geometry and no automatic enablement or LTX substitution',()=>{
 const cfg=defaults();assert.equal(cfg.h3.enabled,false);assert.throws(()=>h3Request({prompt:'scene'},cfg),/disabled/);
 cfg.h3.enabled=true;assert.equal(validate(cfg).h3.steps,20);
 const r=h3Request({prompt:'People dance together with music.',duration:5},cfg);assert.equal(r.pipeline,'h3');assert.equal(r.fps,24);assert.equal(r.frames%17,5);assert.equal(r.profile.modelPath,'');assert.equal(r.profile.name,'MiniMax H3 · FL2VA');
 for(const a of [{duration:30},{width:1920,height:1080},{seed:-1},{audio:'yes'}])assert.throws(()=>h3Request({prompt:'scene',...a},cfg));
 assert.match(h3Description,/complex movement/);assert.match(h3Description,/substantially slower/);assert.match(clipGuidance,/mostly static/);assert.match(promptGuide,/Do not introduce cuts/);assert.doesNotMatch(promptGuide,/favor two to four|Only use multiple shots/);
});
