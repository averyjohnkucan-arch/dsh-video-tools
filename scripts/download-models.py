import json,urllib.request,pathlib,subprocess,hashlib,concurrent.futures,time
import argparse
parser=argparse.ArgumentParser(description='Download and verify Comfy H3 + SolarRenderer weights without loading models.')
parser.add_argument('--directory',type=pathlib.Path,default=pathlib.Path.home()/'Models')
root=parser.parse_args().directory.resolve();root.mkdir(parents=True,exist_ok=True)
def api(url):
 for attempt in range(6):
  try:
   with urllib.request.urlopen(url,timeout=60) as r:return json.load(r)
  except Exception:
   if attempt==5:raise
   time.sleep(2+attempt)
jobs=[]
choices={'Comfy-Org/MiniMax-H3':['diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors','diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors','text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors','vae/minimax_h3_video_vae_fp16.safetensors','vae/minimax_h3_audio_vae_fp32.safetensors'], 'Enderfga/SolarRenderer':['solarrenderer_control_lora.safetensors','solarrenderer_4step_lora.safetensors']}
for repo,paths in choices.items():
 meta=api('https://huggingface.co/api/models/'+repo+'?blobs=true');revision=meta['sha'];siblings={x['rfilename']:x for x in meta['siblings']}
 directory=root/('MiniMax-H3' if repo.startswith('Comfy-Org') else 'SolarRenderer')
 for name in paths+['LICENSE','README.md']:
  if name not in siblings:continue
  entry=siblings[name];out=directory/name;out.parent.mkdir(parents=True,exist_ok=True)
  lfs=entry.get('lfs') or {};jobs.append(dict(repo=repo,revision=revision,path=name,output=str(out),bytes=entry.get('size'),sha256=lfs.get('sha256')))
manifest=root/'video-model-downloads.json';manifest.write_text(json.dumps(jobs,indent=2))
print('Downloading',sum(x['bytes'] or 0 for x in jobs)/1e9,'GB in',len(jobs),'files',flush=True)
def download(j):
 out=pathlib.Path(j['output']);part=out.with_suffix(out.suffix+'.part');url='https://huggingface.co/'+j['repo']+'/resolve/'+j['revision']+'/'+j['path']
 if not out.exists():
  subprocess.run(['curl','--fail','--location','--silent','--show-error','--connect-timeout','30','--speed-time','120','--speed-limit','1024','--retry','12','--retry-delay','5','--retry-all-errors','--continue-at','-','--output',str(part),url],check=True)
  part.rename(out)
 if j['bytes'] is not None and out.stat().st_size!=j['bytes']:raise RuntimeError('Size mismatch: '+str(out))
 if j['sha256']:
  h=hashlib.sha256()
  with out.open('rb') as f:
   for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
  if h.hexdigest()!=j['sha256']:raise RuntimeError('SHA256 mismatch: '+str(out))
 print('VERIFIED',j['path'],out.stat().st_size,flush=True);return j['path']
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(download,jobs))
print('ALL DOWNLOADS VERIFIED',flush=True)
