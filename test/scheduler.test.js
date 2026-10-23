import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelScheduler} from '/home/user/dsh-model-scheduler/lib/scheduler.js';
test('shared scheduler completes active work before video and restores the previous driver',async()=>{
 const events=[],scheduler=new ModelScheduler({backgroundMs:0});
 const model={key:'chat',name:'chat',gpu:0,fingerprint:'chat',load:async()=>events.push('chat-load'),unload:async()=>events.push('chat-unload')};
 const lease=await scheduler.acquire(model);
 const video={key:'video',name:'video',gpu:0,fingerprint:'video',priority:'background',load:async()=>events.push('video-load'),unload:async()=>events.push('video-unload')};
 const pending=scheduler.runExclusive(video,async()=>{events.push('video-render');return 'done';});
 await new Promise(r=>setTimeout(r,30));assert.deepEqual(events,['chat-load']);assert.equal(lease.signal.aborted,false);lease.release();
 const result=await pending;assert.equal(result.restoration,'loaded');assert.deepEqual(events,['chat-load','chat-unload','video-load','video-render','video-unload','chat-load']);await scheduler.close();
});
test('cancelled queued video does not stop the current job',async()=>{
 const scheduler=new ModelScheduler(),controller=new AbortController();let stopped=false;
 const lease=await scheduler.acquire({key:'index',gpu:0,load:async()=>{},unload:async()=>stopped=true});
 const pending=scheduler.runExclusive({key:'video',gpu:0,priority:'background',load:async()=>assert.fail('must not load'),unload:async()=>{}},async()=>{}, {signal:controller.signal});controller.abort();await assert.rejects(pending);assert.equal(stopped,false);assert.equal(lease.signal.aborted,false);lease.release();await scheduler.close();
});

test('failed or cancelled renderer unloads before the main model reloads',async()=>{
 for(const cancel of [false,true]){
  const events=[],scheduler=new ModelScheduler({backgroundMs:0}),controller=new AbortController();
  const main={key:'main',gpu:0,fingerprint:'main',load:async()=>events.push('main-load'),unload:async()=>events.push('main-unload')};
  const lease=await scheduler.acquire(main);lease.release();
  await assert.rejects(scheduler.runExclusive({key:'video',gpu:0,priority:'background',fingerprint:'video',load:async()=>events.push('video-load'),unload:async()=>events.push('video-unload')},async(_state,signal)=>{if(cancel){controller.abort();signal.throwIfAborted();}throw Error('render failed');},{signal:controller.signal}));
  assert.deepEqual(events,['main-load','main-unload','video-load','video-unload','main-load']);await scheduler.close();
 }
});
