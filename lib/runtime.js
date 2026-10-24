import {solarRequest,resolveVideoInput} from './solar.js';
import {h3Request} from './h3.js';
import {setStage,updateProgress,progressSnapshot} from './progress.js';
import {finishMedia} from './media.js';
import {access,mkdtemp,mkdir,writeFile,lstat,realpath} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {join,relative} from 'node:path';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {Settings} from './config.js';import {request,command} from './request.js';import {run,terminate} from './process.js';
export class VideoRuntime{
 constructor(ctx,root){this.ctx=ctx;this.settings=new Settings(root);this.jobs=new Map();this.closed=false;}
 async init(){await this.settings.init();}
 list(){return {settings:this.settings.value,scheduler:typeof this.scheduler?.runExclusive==='function',jobs:[...this.jobs.values()].map(({controller,promise,child,...job})=>job)};}
 progress(callId){if(typeof callId!=='string'||!callId)return null;const matches=[...this.jobs.values()].filter(j=>j.callId===callId);return matches.length===1?progressSnapshot(matches[0]):null;}
 async device(binary,mode,signal){
  const {stdout}=await run(binary,['--list-devices'],{signal});const rows=stdout.split('\n').map(line=>line.split('\t')).filter(r=>r.length>1);
  if(mode==='cpu'){if(!rows.some(([name])=>name==='CPU'))throw Error('CPU backend unavailable.');return 'CPU';}
  if(mode==='igpu'){const intel=rows.find(([name,description])=>/^Vulkan\d+$/.test(name)&&/intel/i.test(description));if(!intel)throw Error('This video runtime does not expose the Intel iGPU.');return intel[0];}
  const nvidia=rows.find(([name,description])=>name===`CUDA${this.settings.value.gpu}`)||rows.find(([name,description])=>/^Vulkan\d+$/.test(name)&&/nvidia/i.test(description));if(!nvidia)throw Error('This video runtime does not expose the dedicated GPU.');return nvidia[0];
 }
 async configure(value){const wasEnabled=this.settings.value.enabled;const result=await this.settings.save(value);if(wasEnabled!==result.enabled)this.onEnabledChange?.();if(!result.enabled){for(const job of this.jobs.values())job.controller.abort();await Promise.allSettled([...this.jobs.values()].map(j=>j.promise).filter(Boolean));}return result;}
 async render(args,exec){
  if(this.closed||!this.settings.value.enabled)throw Error('Video Generation is disabled.');if(!exec.agent)throw Error('Generate video from an active conversation.');
  const cfg=structuredClone(this.settings.value),r=args.pipeline==='solar'?solarRequest(args,cfg):args.pipeline==='h3'?h3Request(args,cfg):request(args,cfg),p=r.profile;
  if(['h3','solar'].includes(r.pipeline)&&cfg.backend!=='comfy')throw Error('MiniMax H3 requires the isolated Comfy worker backend.');
  for(const file of [...(cfg.backend==='comfy'?[cfg.comfyPython,cfg.comfySource]:[cfg.sdExecutable]),cfg.ffmpegExecutable,cfg.ffprobeExecutable,p.modelPath,p.textEncoderPath,p.videoVaePath,p.audioVaePath,...(r.pipeline==='solar'?[p.sourcePath,p.controlPath,p.fewstepPath]:[])]){if(!file)throw Error('Connect the video runtime, models and shared encoders/decoders in Settings → Video Generation.');await access(file);}
  if(!this.scheduler?.runExclusive)throw Error('Enable Model Scheduler for managed generation on every device.');
  const workspace=await realpath(exec.workspace||exec.agent.session.header?.cwd||this.settings.root),parent=join(workspace,'dsh-videos');await mkdir(parent,{recursive:true,mode:0o700});if((await lstat(parent)).isSymbolicLink())throw Error('Video output directory cannot be a symlink.');
  const directory=await mkdtemp(join(parent,'job-')),extension=r.width%2||r.height%2?'webm':'mp4',output=join(directory,'result.'+extension),id=randomUUID(),controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(exec.signal?[exec.signal]:[]),AbortSignal.timeout(cfg.timeoutMs)]);
  if(r.pipeline==='h3'){for(const prefix of ['first_frame','last_frame'])r[prefix==='first_frame'?'firstFramePath':'lastFramePath']=await resolveVideoInput(args,prefix,exec,this.ctx.attachments,workspace,directory,signal);}
  if(r.pipeline==='solar'){
   r.structurePath=await resolveVideoInput(args,'structure',exec,this.ctx.attachments,workspace,directory,signal);
   r.firstFramePath=await resolveVideoInput(args,'first_frame',exec,this.ctx.attachments,workspace,directory,signal);
  }
  if(this.closed||!this.settings.value.enabled)throw Error('Video Generation is disabled.');signal.throwIfAborted();
  const job={id,callId:exec.callId,stage:'queued',percent:null,quality:r.quality,name:p.name,status:'queued',execution:r.execution,progress:'Waiting for video device',log:'',created:Date.now(),directory,controller};this.jobs.set(id,job);
  let raw;
  const work=async (leaseSignal,mode)=>{
   raw=join(directory,cfg.backend==='comfy'&&mode==='gpu'?'generated.mp4':'generated.webm');
   job.status='running';job.started=Date.now();setStage(job,'loading');const render=async mode=>{
    if(cfg.backend==='comfy'&&mode==='gpu'){
     const input=join(directory,'worker-request.json');await writeFile(input,JSON.stringify({config:cfg,request:r,output:raw}),{mode:0o600});
     job.execution=mode;job.device='CUDA'+cfg.gpu;job.progress='Loading video worker';
     await run(cfg.comfyPython,[fileURLToPath(new URL(r.pipeline==='solar'?'./solar-worker.py':r.pipeline==='h3'?'./h3-worker.py':'./comfy-worker.py',import.meta.url)),input],{signal:leaseSignal,timeoutMs:cfg.timeoutMs,onSpawn:child=>job.child=child,gpu:cfg.gpu,onGpuMemory:peak=>job.peakGpuMiB=Math.max(job.peakGpuMiB||0,peak),onMemory:peak=>job.peakRSSMiB=Math.max(job.peakRSSMiB||0,peak/1024),onData:chunk=>{job.log=(job.log+chunk).slice(-50000);updateProgress(job,chunk);job.progress=chunk.trim().split('\n').at(-1)?.slice(0,300)||job.progress;}});delete job.child;return;
    }
    const binary=mode==='igpu'?cfg.igpuExecutable:mode==='cpu'&&cfg.igpuExecutable?cfg.igpuExecutable:cfg.sdExecutable;if(!binary)throw Error('Connect an Intel/Vulkan video runtime in Video Generation settings.');
    const device=await this.device(binary,mode,leaseSignal);job.execution=mode;job.device=device;job.progress='Generating '+r.quality+' video on '+device;
    const cmd=command(binary,{...r,execution:mode},cfg,raw,device);job.command=cmd;
    await run(cmd.binary,cmd.args,{signal:leaseSignal,timeoutMs:cfg.timeoutMs,onSpawn:child=>job.child=child,gpu:mode==='gpu'?cfg.gpu:undefined,onGpuMemory:peak=>job.peakGpuMiB=Math.max(job.peakGpuMiB||0,peak),onMemory:peak=>job.peakRSSMiB=Math.max(job.peakRSSMiB||0,peak/1024),onData:chunk=>{job.log=(job.log+chunk).slice(-50000);updateProgress(job,chunk);job.progress=chunk.trim().split('\n').at(-1)?.slice(0,300)||job.progress;}});delete job.child;
   };
   await render(mode);
   setStage(job,'finishing');job.progress='Validating and finishing video';
   job.media=await finishMedia(cfg,r,raw,output,leaseSignal);setStage(job,'restoring');return output;
  };
  const driverFor=mode=>({key:'video-tools:'+id,name:'Video Generation · '+p.name,gpu:mode==='gpu'?cfg.gpu:mode,priority:'interactive',handoffSessionId:exec.agent.session?.id,fingerprint:id,load:async()=>{
   if(mode!=='gpu')return job;
   const result=await run('nvidia-smi',[`--id=${cfg.gpu}`,'--query-compute-apps=pid','--format=csv,noheader,nounits'],{signal});if(result.stdout.trim())throw Error('An unmanaged GPU job is still active. Video Generation does not stop external applications.');
   const memory=await run('nvidia-smi',[`--id=${cfg.gpu}`,'--query-gpu=memory.free','--format=csv,noheader,nounits'],{signal});if(!Number.isFinite(Number(memory.stdout.trim()))||Number(memory.stdout.trim())<cfg.minFreeMiB)throw Error('Insufficient free dedicated GPU memory after managed unloading.');return job;
  },unload:async()=>{if(job.child)await terminate(job.child);}});
  job.promise=(async()=>{try{
   let handoff;
   const modes=['h3','solar'].includes(r.pipeline)?['gpu']:cfg.deviceFallback&&args.execution===undefined?(r.execution==='gpu'?['gpu',...(cfg.igpuExecutable?['igpu']:[]),'cpu']:r.execution==='igpu'?['igpu','cpu']:['cpu']):[r.execution];
   for(const mode of modes){
    signal.throwIfAborted();
    try{handoff=await this.scheduler.runExclusive(driverFor(mode),(_state,leaseSignal)=>work(AbortSignal.any([signal,leaseSignal]),mode),{signal,restorePrevious:cfg.restorePrevious});break;}
    catch(error){
     (job.attempts??=[]).push({device:mode,error:error.message});
     if(signal.aborted||mode===modes.at(-1)||!/out of memory|failed to allocate|not enough memory|alloc_buffer|does not expose|backend unavailable|Insufficient free|unmanaged GPU job/i.test(error.message))throw error;
     job.progress='Device unavailable; trying the next configured device with the same checkpoint';job.log+='\n'+mode+': '+error.message+'\n';
    }
   }
   signal.throwIfAborted();const attachment=await this.ctx.attachments.saveFileStream({data:createReadStream(output),signal,name:'generated-video.'+extension});
   job.status='complete';setStage(job,'complete');job.progress='Video ready';return {attachment,path:relative(workspace,output).split('\\').join('/'),quality:r.quality,profile:p.name,device:job.device,width:r.width,height:r.height,generationWidth:r.generationWidth,generationHeight:r.generationHeight,upscaled:false,audio:r.audio,frames:r.frames,fps:r.fps,duration:r.duration,rounded:r.rounded,requestedFrames:r.requestedFrames,peakRSSMiB:job.peakRSSMiB??null,peakGpuMiB:job.peakGpuMiB??null,seconds:(Date.now()-job.started)/1000,attempts:job.attempts??[],restoration:handoff.restoration};
  }catch(error){job.status=signal.reason?.name==='TimeoutError'||/timed out/i.test(error.message)?'timed-out':signal.aborted?'cancelled':'failed';job.progress=error.message;throw error;}finally{job.finished=Date.now();const {controller:_,promise:__,child:___,...record}=job;await writeFile(join(directory,'job.json'),JSON.stringify(record,null,2),{mode:0o600}).catch(error=>{job.metadataError=error.message;});delete job.child;delete job.promise;}})();return job.promise;
 }
 async dispose(){this.closed=true;for(const job of this.jobs.values())job.controller.abort();await Promise.allSettled([...this.jobs.values()].map(j=>j.promise).filter(Boolean));}
}
