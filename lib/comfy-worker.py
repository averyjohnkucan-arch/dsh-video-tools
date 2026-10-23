import os,sys,json,importlib.util,logging,time,wave,subprocess
from pathlib import Path
job=json.loads(Path(sys.argv[1]).read_text());cfg=job['config'];r=job['request'];p=r['profile'];root=Path(cfg['comfySource']).parent
os.environ['CUDA_VISIBLE_DEVICES']=str(cfg['gpu'])
sys.path[:0]=[str(root/'site'),cfg['comfySource']]
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
quality=r['quality']
sys.argv=['dsh-video-worker','--use-pytorch-cross-attention','--disable-dynamic-vram','--disable-cuda-graphs','--bf16-text-enc','--bf16-unet','--bf16-vae','--reserve-vram','3']
import comfy.options
comfy.options.enable_args_parsing()
import torch
logging.basicConfig(level=logging.INFO)
import comfy.sd,comfy.utils,comfy.sample,comfy.samplers,comfy.model_management,folder_paths
from comfy_extras.nodes_lt import EmptyLTXVLatentVideo,LTXVConditioning,LTXVConcatAVLatent,LTXVSeparateAVLatent,LTXVScheduler,ModelSamplingLTXV
from comfy_extras.nodes_lt_audio import LTXVEmptyLatentAudio,LTXVAudioVAEDecode
spec=importlib.util.spec_from_file_location('dsh_gguf',root/'ComfyUI-GGUF/__init__.py',submodule_search_locations=[str(root/'ComfyUI-GGUF')]);gguf=importlib.util.module_from_spec(spec);sys.modules['dsh_gguf']=gguf;spec.loader.exec_module(gguf)

from comfy_paths import bind_checkpoint
checkpoint_name=bind_checkpoint(folder_paths,p['modelPath'])
start=time.monotonic();print('Loading exact components',flush=True)
with torch.inference_mode():
 clip=comfy.sd.load_clip(ckpt_paths=[p['textEncoderPath']],embedding_directory=[],clip_type=comfy.sd.CLIPType.LTXV)
 positive=clip.encode_from_tokens_scheduled(clip.tokenize(r['prompt']))
 assert all(torch.isfinite(c[0]).all() for c in positive), 'Nonfinite text conditioning'
 negative=positive if quality=='standard' else clip.encode_from_tokens_scheduled(clip.tokenize(r.get('negativePrompt') or ''))
 positive,negative=LTXVConditioning.execute(positive,negative,r['fps'])
 del clip
 comfy.model_management.unload_all_models()
 print('Loading video/audio decoders',flush=True)
 def load_vae(path):
  weights,metadata=comfy.utils.load_torch_file(path,safe_load=True,return_metadata=True)
  return comfy.sd.VAE(sd=weights,metadata=metadata)
 vae=load_vae(p['videoVaePath'])
 audio_vae=load_vae(p['audioVaePath'])
 video_latent=EmptyLTXVLatentVideo.execute(r['generationWidth'],r['generationHeight'],r['frames'],1)[0]
 audio_latent=LTXVEmptyLatentAudio.execute(r['frames'],r['fps'],1,audio_vae)[0]
 latent=LTXVConcatAVLatent.execute(video_latent,audio_latent)[0]
 print('Loading exact GGUF',flush=True)
 model=gguf.NODE_CLASS_MAPPINGS['UnetLoaderGGUF']().load_unet(checkpoint_name,dequant_dtype='bfloat16')[0]
 if quality=='standard':sigmas=torch.tensor([1,.99375,.9875,.98125,.975,.909375,.725,.421875,0])
 else:
  model=ModelSamplingLTXV.execute(model,2.05,.95,video_latent)[0]
  sigmas=LTXVScheduler.execute(p['steps'],2.05,.95,True,.1,video_latent)[0]
 noise=comfy.sample.prepare_noise(latent['samples'],r['seed'])
 def progress(step,x0,x,total):print(json.dumps({'stage':'sampling','step':step+1,'total':total}),flush=True)
 samples=comfy.sample.sample_custom(model,noise,p['guidance'],comfy.samplers.sampler_object('euler'),sigmas,positive,negative,latent['samples'],callback=progress,seed=r['seed'])
 video,audio=LTXVSeparateAVLatent.execute({'samples':samples})
 print('Decoding',flush=True)
 images=vae.decode(video['samples']).cpu()
 images=images.reshape(-1,*images.shape[-3:])
 decoded_audio=LTXVAudioVAEDecode.execute(audio,audio_vae)[0]
 if not torch.isfinite(images).all():raise RuntimeError('Nonfinite video')
 if not torch.isfinite(decoded_audio['waveform']).all():raise RuntimeError('Nonfinite audio')
 output=Path(job['output']).parent
 waveform=decoded_audio['waveform'][0].movedim(0,-1).cpu().clamp(-1,1).numpy()
 with wave.open(str(output/'audio.wav'),'wb') as w:w.setnchannels(waveform.shape[-1]);w.setsampwidth(2);w.setframerate(decoded_audio['sample_rate']);w.writeframes((waveform*32767).astype('<i2').tobytes())
 pixels=(images.clamp(0,1).numpy()*255).round().astype('uint8')
 print('Encoding',images.shape,flush=True)
 command=[cfg['ffmpegExecutable'],'-hide_banner','-loglevel','error','-nostdin','-f','rawvideo','-pix_fmt','rgb24','-s',f'{images.shape[2]}x{images.shape[1]}','-r',str(r['fps']),'-i','pipe:0','-i',str(output/'audio.wav'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-y',job['output']]
 subprocess.run(command,input=pixels.tobytes(),check=True)
 print(json.dumps({'seconds':time.monotonic()-start,'frames':len(images),'output':job['output'],'peakCudaMiB':torch.cuda.max_memory_allocated()/1048576}),flush=True)
