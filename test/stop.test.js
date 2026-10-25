import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile,chmod} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {VideoRuntime} from '../lib/runtime.js';import {ModelScheduler} from './scheduler-provider.js';
for(const schedulerKind of ['shared scheduler','independent lease signal'])test(`chat Stop kills running video and never publishes an output (${schedulerKind})`,async t=>{
 const root=await mkdtemp(join(tmpdir(),'video-chat-stop-'));t.after(()=>rm(root,{recursive:true,force:true}));const binary=join(root,'worker');
 await writeFile(binary,`#!${process.execPath}\nif(process.argv.includes('--list-devices'))console.log('CPU\\tFixture CPU');else setInterval(()=>{},1000);\n`);await chmod(binary,0o700);
 const runtime=new VideoRuntime({attachments:{saveFileStream:()=>assert.fail('cancelled output must not publish')}},join(root,'settings'));await runtime.init();t.after(()=>runtime.dispose());
 const cfg=runtime.settings.value;Object.assign(cfg,{backend:'sdcpp',sdExecutable:binary,ffmpegExecutable:process.execPath,ffprobeExecutable:process.execPath,execution:'cpu',timeoutMs:3000,deviceFallback:false});for(const p of Object.values(cfg.models))for(const k of ['modelPath','textEncoderPath','videoVaePath','audioVaePath'])p[k]=binary;
 let restored=false,pid;
 if(schedulerKind==='shared scheduler'){
  const scheduler=new ModelScheduler({switchMs:0});runtime.scheduler=scheduler;t.after(()=>scheduler.close());let loads=0;
  const lease=await scheduler.acquire({key:'chat',gpu:'cpu',fingerprint:'chat',load:async()=>{if(loads++){assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});restored=true;}},unload:async()=>{}});lease.release();
 }else runtime.scheduler={async runExclusive(_driver,op){return {result:await op({},new AbortController().signal),restoration:'loaded'};}};
 const stop=new AbortController(),pending=runtime.render({prompt:'scene'},{agent:{session:{id:'chat-stop',header:{cwd:root}}},workspace:root,signal:stop.signal});const rejected=assert.rejects(pending,/Stop clicked/);
 for(let i=0;i<100&&!([...runtime.jobs.values()][0]?.child);i++)await new Promise(r=>setTimeout(r,10));pid=[...runtime.jobs.values()][0]?.child?.pid;assert.ok(pid,'worker started');
 const started=Date.now();stop.abort(new Error('Stop clicked'));await rejected;assert.ok(Date.now()-started<2000);assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});assert.equal([...runtime.jobs.values()][0].status,'cancelled');if(schedulerKind==='shared scheduler')assert.equal(restored,true);
});
