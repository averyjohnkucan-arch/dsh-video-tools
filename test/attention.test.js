import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validate} from '../lib/config.js';
import {request,command} from '../lib/request.js';
test('video runtime disables the attention path that produces blank frames with BF16 companions',()=>{
 const cfg=defaults();
 for(const tags of [[],['HQ']]){
  const cmd=command('/bin/sd',request({prompt:'a red ball',tags},cfg),cfg,'/out.webm','CUDA0');
  const at=cmd.args.indexOf('--flash-attn');assert.ok(at>=0);assert.equal(cmd.args[at+1],'off');
 }
});
test('advanced attention override is validated rather than silently accepted',()=>{
 const cfg=defaults();cfg.flashAttention='invalid';assert.throws(()=>validate(cfg),/attention/i);
});

test('Comfy backend has independent paths and rejects unknown engines',()=>{
 const cfg=defaults();assert.equal(cfg.backend,'comfy');assert.ok(cfg.comfySource.includes('dsh-video-tools/runtime/comfyui'));assert.ok(cfg.comfyPython.includes('dsh-video-tools/runtime/venv'));
 assert.throws(()=>validate({...cfg,backend:'unknown'}),/backend/);
});
