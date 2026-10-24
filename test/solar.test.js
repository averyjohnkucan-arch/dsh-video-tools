import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {Context} from '@deepseek-ai/cordis';
import {solarRequest,resolveVideoInput,solarGuide} from '../lib/solar.js';import {defaults,validate} from '../lib/config.js';import * as plugin from '../index.js';
const description=Array(400).fill('visible').join(' ');
test('Solar requires a real motion guide and valid four-step silent single-clip request',()=>{
 const cfg=defaults(),args={summary:'A person crosses the scene.',detailed_description:description,structure_path:'input.mp4'};
 assert.throws(()=>solarRequest(args,cfg),/disabled/);cfg.solar.enabled=true;assert.equal(validate(cfg).solar.enabled,true);
 const r=solarRequest(args,cfg);assert.equal(r.profile.steps,4);assert.equal(r.audio,false);assert.equal(r.pipeline,'solar');assert.equal(r.frames,158);
 for(const overrides of [{structure_path:''},{frames:159},{frames:175},{detailed_description:'too short'},{condition:'custom'},{summary:'<Video 1>'}])assert.throws(()=>solarRequest({...args,...overrides},cfg));
 assert.match(solarGuide,/350–500/);assert.match(solarGuide,/Output is silent/);
});
test('input resolution confines paths and attachments to the active workspace and conversation',async t=>{
 const root=await mkdtemp(join(tmpdir(),'solar-inputs-'));t.after(()=>rm(root,{recursive:true,force:true}));const workspace=join(root,'workspace');await mkdir(workspace);await writeFile(join(workspace,'guide.mp4'),'fixture');await writeFile(join(root,'outside.mp4'),'private');await symlink(join(root,'outside.mp4'),join(workspace,'escape.mp4'));
 const exec={agent:{session:{snapshotEvents:()=>[{type:'user/message',data:{content:[{type:'file',attachment:{attachmentId:'uploaded-video',name:'guide.mp4'}},{type:'image',attachment:{attachmentId:'first-image'}}]}}]}}};
 const attachments={fileHostPath:ref=>{assert.equal(ref.attachmentId,'uploaded-video');return '/fixture/store/guide.mp4';},readImage:async()=>({data:Buffer.from('fixture image')})};
 assert.equal(await resolveVideoInput({structure_path:'guide.mp4'},'structure',exec,attachments,workspace,workspace),join(workspace,'guide.mp4'));
 for(const path of ['../outside.mp4','escape.mp4','/etc/passwd'])await assert.rejects(()=>resolveVideoInput({structure_path:path},'structure',exec,attachments,workspace,workspace));
 assert.equal(await resolveVideoInput({structure_attachment_id:'uploaded-video'},'structure',exec,attachments,workspace,workspace),'/fixture/store/guide.mp4');
 await assert.rejects(()=>resolveVideoInput({structure_attachment_id:'not-in-chat'},'structure',exec,attachments,workspace,workspace));
 assert.equal(await resolveVideoInput({first_frame_attachment_id:'first-image'},'first_frame',exec,attachments,workspace,workspace),join(workspace,'first_frame.png'));
});
test('Solar registration, ephemeral guide, outputs and disable hooks work without a renderer',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'solar-plugin-'));t.after(()=>rm(dir,{recursive:true,force:true}));const ctx=new Context(),tools=[];
 ctx.provide('tools',{register:value=>{tools.push(value);return()=>tools.splice(tools.indexOf(value),1);}});ctx.provide('attachments',{});ctx.provide('sandboxPolicy',{});ctx.provide('webServer',{register:()=>()=>{},getOrigin:()=> 'http://127.0.0.1:3080'});
 const fiber=await ctx.plugin(plugin,{dataDir:dir});t.after(async()=>{await fiber.dispose();await ctx.fiber.dispose();});
 const solar=tools.find(v=>v.name==='render_video_solar');assert.ok(solar);assert.equal(JSON.parse((await solar.execute({action:'menu'},{})).data).enabled,false);
 const agent={session:{}},exec={agent,callId:'solar-call'},step=()=>ctx.waterfall('agent/pre-step',{agent},async()=>({kind:'enter',messages:[]}));
 await solar.execute({action:'prepare'},exec);assert.match(JSON.stringify((await step()).messages),/SolarRenderer temporary prompt guidance/);
 ctx.videoGeneration.render=async(args,context)=>{assert.equal(args.pipeline,'solar');assert.equal(context.callId,'solar-call');assert.equal((await step()).messages.length,0);return {attachment:{attachmentId:'fixture',name:'generated-video.mp4',bytes:10}};};
 const result=await solar.execute({action:'generate',structure_path:'guide.mp4',summary:'A scene',detailed_description:description},exec);assert.equal(solar.output.render({},result).at(-1).type,'file');
});
