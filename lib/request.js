export const PRESETS={'360p':[640,360],'480p':[854,480],'720p':[1280,720],'1080p':[1920,1080],'4K':[3840,2160]};
export function request(args,cfg){
 if(typeof args.prompt!=='string'||!args.prompt.trim()||args.prompt.length>16000)throw Error('Provide a video prompt of at most 16000 characters.');
 const tags=args.tags??[];if(!Array.isArray(tags)||tags.some(tag=>tag!=='HQ')||tags.length>1)throw Error('Only the explicit HQ tag is supported.');
 const quality=tags.includes('HQ')?'HQ':'standard',profile=cfg.models[quality];
 if(!profile?.modelPath)throw Error('Connect the '+quality+' model in Settings → Video Generation.');
 const preset=args.resolution??'custom';
 if(!Object.hasOwn(PRESETS,preset)&&preset!=='custom')throw Error('Unknown output resolution preset.');
 if(preset!=='custom'&&(args.width!==undefined||args.height!==undefined))throw Error('Use custom resolution with explicit dimensions.');
 const [landscapeWidth,landscapeHeight]=PRESETS[preset]??[args.width??cfg.width,args.height??cfg.height];
 for(const n of [landscapeWidth,landscapeHeight])if(!Number.isSafeInteger(n)||n<1||n>2147483616)throw Error('Dimensions must be positive runtime integers.');
 const shape=args.shape??cfg.shape??'landscape';if(!['landscape','square'].includes(shape))throw Error('Unknown output shape.');
 const width=shape==='square'?Math.min(landscapeWidth,landscapeHeight):landscapeWidth,height=shape==='square'?width:landscapeHeight;
 const fps=args.fps??cfg.fps,seed=args.seed??42,execution=args.execution??cfg.execution;
 if(!Number.isInteger(fps)||fps<1||fps>2147483647)throw Error('FPS must be a positive runtime integer.');
 if(args.duration!==undefined&&args.frames!==undefined)throw Error('Specify duration or frames, not both.');
 if(args.duration!==undefined&&(!Number.isFinite(args.duration)||args.duration<=0))throw Error('Duration must be positive.');
 const requestedFrames=args.duration===undefined?(args.frames??cfg.frames):args.duration*fps;
 if(!Number.isFinite(requestedFrames)||requestedFrames<1||requestedFrames>2147483641||args.frames!==undefined&&!Number.isInteger(args.frames))throw Error('Invalid frame count.');
 const frames=Math.max(9,8*Math.ceil((requestedFrames-1)/8)+1);
 if(!Number.isInteger(seed)||seed<0||seed>2147483647||!['gpu','igpu','cpu'].includes(execution))throw Error('Invalid seed or execution device.');
 const audio=args.audio??cfg.audio??true;if(typeof audio!=='boolean')throw Error('Audio must be enabled or disabled.');
 const negativePrompt=args.negative_prompt??'';if(typeof negativePrompt!=='string'||negativePrompt.length>16000)throw Error('Invalid negative prompt.');
 if(negativePrompt&&quality==='standard')throw Error('Negative prompt is inactive with the distilled CFG 1.0 schedule; use an empty negative prompt.');
 if(args.upscale||args.image)throw Error('Upscaling and image conditioning are not qualified by this plugin.');
 return {quality,profile:structuredClone(profile),prompt:args.prompt.trim(),negativePrompt,width,height,generationWidth:Math.ceil(landscapeWidth/32)*32,generationHeight:Math.ceil(landscapeHeight/32)*32,frames,requestedFrames,duration:frames/fps,rounded:frames!==requestedFrames,fps,seed,execution,audio,shape};
}
export function command(binary,r,cfg,output,device){
 const p=r.profile,args=['-M','vid_gen','--diffusion-model',p.modelPath,'--llm',p.textEncoderPath,'--vae',p.videoVaePath,'--audio-vae',p.audioVaePath,'--backend',`diffusion=${device},te=${device},vae=${device}`,'--flash-attn',cfg.flashAttention??'off','--params-backend','cpu','--mmap','--threads',String(cfg.threads),'-W',String(r.generationWidth),'-H',String(r.generationHeight),'--video-frames',String(r.frames),'--fps',String(r.fps),'--steps',String(p.steps),'--cfg-scale',String(p.guidance),'--sampling-method','euler','--seed',String(r.seed),'-p',r.prompt,'-o',output];
 if(r.negativePrompt)args.push('-n',r.negativePrompt);
 if(r.quality==='HQ')args.push('--scheduler','ltx2');
 if(r.quality==='standard')args.push('--sigmas','1,0.99375,0.9875,0.98125,0.975,0.909375,0.725,0.421875,0');
 if(r.execution==='gpu')args.push('--max-vram',`${device}=-0.5`);
 return {binary,args};
}
