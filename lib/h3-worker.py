"""Prepared MiniMax H3 text-to-audio-video worker; hardware qualification pending.
Based on Comfy-Org's video_minimax_h3_t2v template (no optional Turbo LoRA).
Only launched on an explicit generate_video call after H3 is configured/enabled.
"""
import os, sys, json, logging, wave, subprocess
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
import comfy.sd, comfy.utils, comfy.sample, comfy.samplers, comfy.model_management
import nodes
from comfy_extras.nodes_minimax_h3 import MiniMaxH3ImageToVideo
from comfy_extras.nodes_audio import VAEDecodeAudio
logging.basicConfig(level=logging.INFO)
def stage(name, **values):
    print(json.dumps(dict(stage=name, **values)), flush=True)
def load_vae(path):
    weights, metadata = comfy.utils.load_torch_file(path, safe_load=True, return_metadata=True)
    return comfy.sd.VAE(sd=weights, metadata=metadata)
with torch.inference_mode():
    stage('loading')
    # Paths resolve exactly; no network calls or checkpoint substitutions.
    for field in ['modelPath', 'textEncoderPath', 'videoVaePath', 'audioVaePath']:
        if Path(p[field]).suffix != '.safetensors':
            raise ValueError('H3 currently requires Comfy-compatible Safetensors for ' + field)
    clip = comfy.sd.load_clip(ckpt_paths=[p['textEncoderPath']], embedding_directory=[], clip_type=comfy.sd.CLIPType.MINIMAX)
    vae = load_vae(p['videoVaePath'])
    positive, latent = MiniMaxH3ImageToVideo.execute(clip, vae, r['prompt'], r['generationWidth'], r['generationHeight'], r['frames'])
    del clip
    comfy.model_management.unload_all_models()
    model = comfy.sd.load_diffusion_model(p['modelPath'], model_options={})
    sigmas = comfy.samplers.calculate_sigmas(model.get_model_object('model_sampling'), 'simple', p['steps'])
    noise = comfy.sample.prepare_noise(latent['samples'], r['seed'])
    stage('sampling')
    def progress(step, x0, x, total):
        stage('sampling', step=step + 1, total=total)
    samples = comfy.sample.sample_custom(model, noise, 1.0, comfy.samplers.sampler_object('res_multistep'), sigmas, positive, positive, latent['samples'], callback=progress, seed=r['seed'])
    stage('decoding')
    decoded = {'samples': samples}
    images = nodes.VAEDecode().decode(vae, decoded)[0].cpu()
    audio_vae = load_vae(p['audioVaePath'])
    audio = VAEDecodeAudio.execute(audio_vae, decoded)[0]
    if not torch.isfinite(images).all() or not torch.isfinite(audio['waveform']).all():
        raise RuntimeError('Nonfinite H3 output')
    audio_path = Path(job['output']).parent / 'audio.wav'
    waveform = audio['waveform'][0].movedim(0, -1).cpu().clamp(-1, 1).numpy()
    with wave.open(str(audio_path), 'wb') as w:
        w.setnchannels(waveform.shape[-1]); w.setsampwidth(2); w.setframerate(audio['sample_rate'])
        w.writeframes((waveform * 32767).astype('<i2').tobytes())
    pixels = (images.clamp(0, 1).numpy() * 255).round().astype('uint8')
    stage('encoding')
    command = [cfg['ffmpegExecutable'], '-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{images.shape[2]}x{images.shape[1]}', '-r', '24', '-i', 'pipe:0', '-i', str(audio_path), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-y', job['output']]
    subprocess.run(command, input=pixels.tobytes(), check=True)
