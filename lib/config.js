import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';import {homedir} from 'node:os';import {randomUUID} from 'node:crypto';
const base='/mnt/ai/models/LTX-2.5/';
const shared=base+'Lightricks/shared-components/BF16/';
export const defaults=()=>({enabled:true,solar:{enabled:false,sourcePath:'',modelPath:'',textEncoderPath:'',videoVaePath:'',audioVaePath:'',controlPath:'',fewstepPath:''},h3:{enabled:false,modelPath:'',textEncoderPath:'',videoVaePath:'',audioVaePath:'',steps:20},backend:'comfy',comfyPython:join(homedir(),'.dsh/dsh-video-tools/runtime/venv/bin/python'),comfySource:join(homedir(),'.dsh/dsh-video-tools/runtime/comfyui'),flashAttention:'off',deviceFallback:true,ffmpegExecutable:'/home/user/Desktop/AI/runtime/media/bin/ffmpeg',audio:true,shape:'landscape',version:1,sdExecutable:'',igpuExecutable:'',ffprobeExecutable:'',gpu:0,execution:'gpu',minFreeMiB:512,restorePrevious:true,timeoutMs:7200000,threads:8,width:512,height:512,frames:33,fps:24,models:{standard:{name:'LTX-2.5 Distilled',modelPath:base+'unsloth/distilled/ltx-2.5-22b-distilled-UD-Q4_K_XL.gguf',textEncoderPath:shared+'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors',videoVaePath:shared+'ltx-2.5-video-vae-conv-bf16.safetensors',audioVaePath:shared+'ltx-2.5-audio-vae-bf16.safetensors',steps:8,guidance:1},HQ:{name:'LTX-2.5 Dev · HQ',modelPath:base+'unsloth/ltx-2.5-22b-dev-UD-Q4_K_XL.gguf',textEncoderPath:shared+'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors',videoVaePath:shared+'ltx-2.5-video-vae-conv-bf16.safetensors',audioVaePath:shared+'ltx-2.5-audio-vae-bf16.safetensors',steps:40,guidance:3}}});
export function validate(v){
 if(!v||v.version!==1)throw Error('Invalid video settings version.');const value={...defaults(),...structuredClone(v)};
 if(typeof value.solar?.enabled!=='boolean')throw Error('Invalid SolarRenderer settings.');
 if(typeof value.h3?.enabled!=='boolean'||!Number.isInteger(value.h3.steps)||value.h3.steps<1||value.h3.steps>100)throw Error('Invalid MiniMax H3 settings.');
 if(!['comfy','sdcpp'].includes(value.backend))throw Error('Invalid video backend.');
 if(!['off','on','auto'].includes(value.flashAttention))throw Error('Invalid flash attention setting.');
 if(typeof value.deviceFallback!=='boolean'||typeof value.enabled!=='boolean'||typeof value.audio!=='boolean'||!['landscape','square'].includes(value.shape))throw Error('Invalid video controls.');
 const path=(v,k)=>{if(typeof v!=='string'||v&&(!isAbsolute(v)||/[\r\n\0]/.test(v)))throw Error(k+' must be an absolute host path.');};
 for(const key of ['sourcePath','modelPath','textEncoderPath','videoVaePath','audioVaePath','controlPath','fewstepPath'])path(value.solar[key],'Solar '+key);
 for(const key of ['modelPath','textEncoderPath','videoVaePath','audioVaePath'])path(value.h3[key],'H3 '+key);
 for(const key of ['sdExecutable','igpuExecutable','ffprobeExecutable','ffmpegExecutable','comfyPython','comfySource'])path(value[key],key);
 if(!['gpu','igpu','cpu'].includes(value.execution)||typeof value.restorePrevious!=='boolean')throw Error('Invalid execution settings.');
 for(const [key,min,max] of [['gpu',0,15],['minFreeMiB',512,200000],['timeoutMs',1000,14400000],['threads',1,256],['width',1,2147483616],['height',1,2147483616],['frames',9,2147483641],['fps',1,2147483647]])if(!Number.isInteger(value[key])||value[key]<min||value[key]>max)throw Error('Invalid '+key+'.');
 if(value.frames%8!==1)throw Error('Default frames must equal 8n+1.');
 if(!value.models||Object.keys(value.models).sort().join(',')!=='HQ,standard')throw Error('Connect exactly the default and HQ models.');
 for(const [key,p] of Object.entries(value.models)){
  if(!p||typeof p.name!=='string'||!p.name.trim())throw Error('Name each video model.');
  for(const field of ['modelPath','textEncoderPath','videoVaePath','audioVaePath'])path(p[field],field);
  if(!Number.isInteger(p.steps)||p.steps<1||p.steps>100||!Number.isFinite(p.guidance)||p.guidance<1||p.guidance>20)throw Error('Invalid model sampling settings.');
  if(key==='standard'&&(p.steps!==8||p.guidance!==1))throw Error('LTX distilled uses its fixed eight-step unguided schedule.');
 }
 if(value.models.standard.modelPath&&value.models.standard.modelPath===value.models.HQ.modelPath)throw Error('Default and HQ must be separate checkpoints.');
 return value;
}
export class Settings{
 constructor(root){this.root=root||join(process.env.DSH_HOME||join(homedir(),'.dsh'),'dsh-video-tools');this.value=defaults();this.queue=Promise.resolve();}
 async init(){await mkdir(this.root,{recursive:true,mode:0o700});try{this.value=validate(JSON.parse(await readFile(join(this.root,'settings.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
 async save(input){const value=validate(input);this.queue=this.queue.catch(()=>{}).then(async()=>{const temp=join(this.root,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,join(this.root,'settings.json'));this.value=value;});await this.queue;return value;}
}
