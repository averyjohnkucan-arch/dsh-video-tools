"""SolarRenderer structure-to-silent-video worker.
Uses upstream SolarRenderer Comfy nodes and exact released prompt assembly.
Only launched on an explicit render_video_solar call after H3 is configured/enabled.
"""
import os, sys, json, logging, wave, subprocess, importlib.util
from pathlib import Path
job = json.loads(Path(sys.argv[1]).read_text())
cfg, r = job['config'], job['request']
p = r['profile']
os.environ['CUDA_VISIBLE_DEVICES'] = str(cfg['gpu'])
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
sys.path.insert(0, cfg['comfySource'])
sys.argv = ['dsh-h3-worker', '--use-pytorch-cross-attention', '--disable-cuda-graphs', '--lowvram', '--reserve-vram', '3']
import comfy.options
comfy.options.enable_args_parsing()
import torch
torch.set_num_threads(max(1, int(cfg.get('threads', 8))))
import comfy.sd, comfy.utils, comfy.sample, comfy.samplers, comfy.model_management
import nodes
from comfy_extras.nodes_minimax_h3 import MiniMaxH3ImageToVideo
from PIL import Image
import numpy as np

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result
solar = module('dsh_solar_nodes', Path(p['sourcePath']) / 'comfyui/nodes.py')
conditions = module('dsh_solar_conditions', Path(p['sourcePath']) / 'skills/solarrenderer-caption/conditions.py')
logging.basicConfig(level=logging.INFO)
def stage(name, **values):
    print(json.dumps(dict(stage=name, **values)), flush=True)
def load_vae(path):
    weights, metadata = comfy.utils.load_torch_file(path, safe_load=True, return_metadata=True)
    return comfy.sd.VAE(sd=weights, metadata=metadata)
with torch.inference_mode():
    stage('loading', workerPid=os.getpid())
    # Paths resolve exactly; no network calls or checkpoint substitutions.
    for field in ['modelPath', 'textEncoderPath', 'videoVaePath', 'audioVaePath']:
        if Path(p[field]).suffix != '.safetensors':
            raise ValueError('H3 currently requires Comfy-compatible Safetensors for ' + field)
    clip = comfy.sd.load_clip(ckpt_paths=[p['textEncoderPath']], embedding_directory=[], clip_type=comfy.sd.CLIPType.MINIMAX)
    vae = load_vae(p['videoVaePath'])
    stage('conditioning')
    args = [cfg['ffmpegExecutable'], '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', r['structurePath'], '-vf', f"fps=24,scale={r['width']}:{r['height']}:force_original_aspect_ratio=increase,crop={r['width']}:{r['height']}", '-frames:v', str(r['frames']), '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']
    raw = subprocess.run(args, stdout=subprocess.PIPE, check=True).stdout
    expected = r['frames'] * r['width'] * r['height'] * 3
    if len(raw) != expected:
        raise ValueError('Structure video is too short at 24 FPS; select fewer frames or provide a longer video')
    structure = torch.from_numpy(np.frombuffer(raw, dtype=np.uint8).copy().reshape(r['frames'], r['height'], r['width'], 3)).float() / 255.0
    first = None
    if r.get('firstFramePath'):
        first = torch.from_numpy(np.array(Image.open(r['firstFramePath']).convert('RGB'))).float().unsqueeze(0) / 255.0
    fields = r['solar']
    condition = conditions.custom_condition(fields['structure_description'], fields['excluded_appearance']) if fields['condition'] == 'custom' else fields['condition']
    prompt = conditions.assemble({'summary': fields['summary'], 'detailed_description': fields['detailed_description'], 'overall_soundscape': 'N/A', 'non_diegetic_music': 'N/A'}, 'full' if first is not None else 'structure', condition)
    Path(job['output']).with_name('scene-prompt.txt').write_text(prompt)
    positive, latent = solar.SolarRendererConditioning().encode(clip, vae, structure, prompt, r['width'], r['height'], r['frames'], first_frame=first)
    del clip
    comfy.model_management.unload_all_models()
    model = comfy.sd.load_diffusion_model(p['modelPath'], model_options={})
    for key in ['fewstepPath', 'controlPath']:
        exact = Path(p[key]).resolve(strict=True)
        import folder_paths
        folder_paths.folder_names_and_paths['loras'] = ([str(exact.parent)], {'.safetensors'})
        resolved = Path(folder_paths.get_full_path_or_raise('loras', exact.name)).resolve(strict=True)
        if resolved != exact:
            raise RuntimeError('Solar LoRA path did not resolve exactly')
        model = solar.SolarRendererLoraLoader().load(model, exact.name, 1.0)[0]
    model = solar.SolarRendererModel().patch(model, r['seed'])[0]
    sigmas = solar.SolarRendererSigmas().sigmas(4)[0]
    noise = comfy.sample.prepare_noise(latent['samples'], r['seed'])
    stage('sampling')
    def progress(step, x0, x, total):
        stage('sampling', step=step + 1, total=total)
    samples = comfy.sample.sample_custom(model, noise, 1.0, comfy.samplers.sampler_object('lcm'), sigmas, positive, positive, latent['samples'], callback=progress, seed=r['seed'])
    stage('decoding')
    decoded = {'samples': samples}
    images = nodes.VAEDecode().decode(vae, decoded)[0].cpu()
    if not torch.isfinite(images).all():
        raise RuntimeError('Nonfinite Solar output')
    # Renderer was trained with silence held through sampling; never claim native audio.
    audio_path = Path(job['output']).parent / 'audio.wav'
    with wave.open(str(audio_path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(32000)
        w.writeframes(bytes(round(r['frames'] / 24 * 32000) * 4))
    pixels = (images.clamp(0, 1).numpy() * 255).round().astype('uint8')
    stage('encoding')
    command = [cfg['ffmpegExecutable'], '-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{images.shape[2]}x{images.shape[1]}', '-r', '24', '-i', 'pipe:0', '-i', str(audio_path), '-c:v', 'libx264', '-crf', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-y', job['output']]
    subprocess.run(command, input=pixels.tobytes(), check=True)
