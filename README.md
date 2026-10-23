# Video Generation

Existing Cordis plugin for DSH 0.2.1-rc.2. Settings order 67 places Video Generation after Image Tools (66). The existing Tool Manager configuration groups `video_tools` immediately after `image_tools` under Media. The installed source lives under the home-folder Harness plugins directory and is linked into its web profile.

Use the normal plugin manager to enable/disable the entire plugin. The settings panel also has a persistent enable switch: saving disabled cancels owned jobs and unregisters generation tools; its settings route remains available to re-enable. Full Cordis disposal removes hooks, routes, services and tools.

## Installation

Install the plugin into an existing DSH web profile:

```sh
dsh plugin --profile web add https://github.com/averyjohnkucan-arch/dsh-video-tools/releases/download/v0.2.0/dsh-video-tools-0.2.0.tgz
```

Enable Model Scheduler and Video Generation in Plugins, then connect the model files and runtime paths in Settings → Video Generation. Runtime dependencies and model weights are separate from this package. The package does not automatically download models.

For source development, clone this repository inside your Harness `plugins/` directory and link it with `dsh plugin --profile web add /absolute/path/to/dsh-video-tools`. The shared scheduler must support originating-session tool handoff; `patches/model-scheduler-handoff.patch` supplies the small compatibility fix for older scheduler sources. It is already applied to the local installation used for qualification.

The CUDA worker expects a ComfyUI checkout with native LTX-2.5/Gemma4 support, a sibling `ComfyUI-GGUF` checkout, and a sibling `site/` directory containing the `gguf` Python package. Its Python environment needs ComfyUI requirements and a PyTorch build suitable for the device. Qualification used ComfyUI `8f04fd6ecf4a548937971e840af2a985529fab76`, ComfyUI-GGUF `6ea2651e7df66d7585f6ffee804b20e92fb38b8a`, gguf 0.19.0 and PyTorch 2.14.0+cu130. Connect the cloned source and Python executable in settings. Portable fallback additionally needs an LTX-2.5-capable sd-cli; media finishing requires FFmpeg/FFprobe.

In the conversation, pending calls use the native **Calling tools** row, with previews and details hidden until the tool completes. Completed results reveal a saved playable video and a download link; metadata remains behind the native disclosure row.

## Connections and controls

Default is LTX-2.5 Distilled with its fixed eight steps, CFG 1.0 and prescribed sigma schedule. Only `tags: ["HQ"]` selects the separate Dev checkpoint. The tool instructions require offering HQ and asking before using it for final deliverables unless already requested. This instruction is model policy, not an independent consent-verification system. Checkpoints are never substituted.

New settings prefill the five specified model paths under `/mnt/ai/models/LTX-2.5`. Existing settings and custom paths are preserved. Runtime executables, components, GPU index, timeout, fallback, sampling and output defaults remain configurable. Saved HQ sampling is retained (currently 40 steps, CFG 3, Euler, LTX2 scheduler); both exact profiles are tested with real inference; see the delivery qualification report for sizes and timings.

Text-to-video accepts prompt, HQ negative prompt, resolution, shape, width/height, frames or duration, integer FPS, seed and audio. Distilled rejects nonempty negative prompts because CFG 1.0 makes them inactive. Audio false removes the generated audio in finishing; it does not skip the runtime's audio generation cost.

Presets specify final landscape dimensions: 360p 640×360; 480p 854×480; 720p 1280×720; 1080p 1920×1080; 4K 3840×2160. Custom dimensions are supported. Generation rounds each landscape dimension up to a multiple of 32, then crops centrally. Square crops the corresponding landscape to its smaller dimension. No scaling is performed. Odd custom dimensions are covered by media fixture tests.

Duration/frame requests round upward to 8n+1 (minimum nine frames). Results report actual frames, FPS, playback duration (`frames / fps`), rounding, generation dimensions and final dimensions. Five seconds at 24 FPS yields 121 frames and 5.0417 seconds. Example settings are not hardware limits.

## Execution and status

Every execution device uses the shared `modelScheduler.runExclusive` service. Video leases use background priority to wait for active work without forcing indexing to yield. The scheduler restores the prior model when possible and reports restoration status. Dedicated GPU admission refuses unmanaged compute processes. Automatic calls prefer the configured main GPU, then connected Intel Vulkan, then CPU for recognized device/memory errors. Explicit `execution` requests do not fall back. Model, validation and cancellation errors never trigger device retries.

Status is available through `video_tools` and the settings job list. The total timeout includes queue time, generation and finishing. Cancellation and disable terminate owned process groups. Process high-water RSS and per-process dedicated GPU memory are sampled every 500 ms. Missing measurements are `null`; sampled peaks can miss brief spikes.

The default engine is an isolated worker using the plugin’s own ComfyUI source clone and city96 GGUF loader. It imports inference modules directly and never starts a ComfyUI server. The worker exits before the scheduler restores the main model. The portable C++ engine handles connected Intel/CPU fallback. Model weights remain at their existing paths.

The runtime first writes `dsh-videos/job-*/generated.mp4` (portable fallback writes WebM). FFmpeg crops and encodes H.264/yuv420p with AAC and faststart for browser MP4 playback, or removes audio when requested. Odd custom dimensions retain WebM so exact pixels are preserved. FFprobe verifies dimensions, decoded frame count, FPS, MP4/WebM format, requested audio presence and start/end timing within container/codec tolerance. Full decoding also rejects wholly clipped white/black video and fatal decoder failures. Completed `result.mp4` (or odd-size `result.webm`) is retained and saved through DSH's attachment service. `job.json` retains progress, failures, command, timing and available memory measurements. Failed attempts never return a successful attachment.

## Qualification

`npm test` covers contracts using synthetic media and the real Cordis and scheduler packages, including model selection, persistence, lifecycle, crop/audio processing, frame rounding, timeouts, scheduler waiting/restoration and attachment file blocks. These fixtures do not establish model inference success or browser playback.

The primary runtime uses ComfyUI native LTX-2.5 nodes and city96/ComfyUI-GGUF with exact supplied checkpoints and shared BF16 components. Source and dependencies live under `~/.dsh/dsh-video-tools/runtime`; image runtime files are not modified. The fallback stable-diffusion.cpp f0aac52 requires flash attention off for the supplied text encoder; the automatic attention path produced white frames in qualification.

Real inference has passed for Distilled and Dev on CUDA with the portable engine; Distilled has also passed CPU and Intel Vulkan. The primary worker has passed both Distilled (33.5s) and Dev/HQ (111.3s) at 360p, 33 frames, 24FPS, with audio. A real DSH chat also passed unload → generate → worker exit → main-model reload, followed by a successful assistant reply. Browser playback reached the end and its downloaded file matched the original SHA256. Larger sizes are requests, not memory guarantees. The 24GiB GPU failed a native 4K portable-engine attempt due to insufficient device memory. Image conditioning and spatial/temporal upscalers are not exposed.

The tool result includes a saved file attachment and an inline player with a Download video link. Playback uses owner authorization and byte ranges for seeking. The scheduler handoff waits for active jobs, unloads the prior managed model, runs the worker, confirms process exit, then restores the prior model. Cancelling or failing a render also runs that cleanup/restoration path.
