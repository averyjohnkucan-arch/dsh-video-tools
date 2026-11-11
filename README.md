# DSH Video Tools

A Cordis plugin for DeepSeek Harness with three local video tools, native playback/download cards, cancellation, managed model handoff and live progress.

| Tool | Use it for |
|---|---|
| `generate_video_clip` | LTX: short, simple, mostly static marketing, product, portrait and stock-style clips when speed matters |
| `generate_video` | MiniMax H3: fuller motion, physical interactions, multiple subjects and native synchronized audio, with optional keyframes or multimodal references |
| `render_video_solar` | SolarRenderer: style a structure video frame by frame using H3 Ref2VA and two released adapters; optional first frame; silent output |

Read [all capabilities and settings](CAPABILITIES.md) and the [hardware qualification report](QUALIFICATION.md). Supported schema values are not a guarantee that every combination fits a particular GPU.

## Installation and configuration

Requires DSH 0.2.1-rc.2 and Node.js ≥22.19, the Model Scheduler plugin for GPU handoff, a compatible local Comfy runtime/PyTorch environment, FFmpeg/FFprobe and separately obtained model weights. Tool Manager is optional: without it enabled tools register directly; with it they are discoverable through the normal search/select flow. Historical `video_tools` results still display.

Install the package through DSH's plugin manager or link its checkout as a profile package and include its `cordis.patch.yml` bundle. Enable **Video Generation** in Plugins, then open **Settings → Video Generation**. Configure:

1. Python executable and Comfy source checkout, FFmpeg and FFprobe.
2. LTX Distilled and separate Dev/HQ checkpoints with their shared text encoder/video VAE/audio VAE. The CUDA LTX worker additionally uses ComfyUI-GGUF and its `gguf` Python dependency beside the runtime source.
3. H3 FL2VA and Ref2VA checkpoints, shared MiniMax Qwen3-VL encoder and video/audio VAEs. Configure default dimensions, sampling budget, sampler/schedule, shifts, compression and memory policy. H3 starts disabled on a new installation.
4. Optional SolarRenderer source checkout and both non-causal LoRAs, reusing H3 Ref2VA/encoder/VAEs. Solar starts disabled on a new installation.

Settings save atomically and retain existing model bindings. Missing components produce named readiness errors; no checkpoint or backend is silently substituted. Enable each configured backend when ready. Merely enabling it does not start inference. Common settings cover GPU index, timeout, thread count, memory admission, restoration and output defaults.

The runtime source and model paths belong to the owner. Keep existing installations pinned while qualifying an update; an arbitrary backend upgrade is not assumed compatible. Package code does not modify image generation runtimes. Platform/hardware evidence is in the qualification report; no Windows qualification is claimed.

### Download H3 and Solar weights without loading them

```bash
python3 scripts/download-models.py --directory /absolute/model/storage
```

The selected set totals approximately 83 GB: INT8 pruned FL2VA and Ref2VA, shared INT8 encoder, FP16 video VAE, audio VAE and two Solar LoRAs. The downloader pins repository revisions, resumes partial transfers and verifies weight sizes and SHA-256, writing `video-model-downloads.json` beside the folders. It never launches inference or restarts DSH. Models/checkouts are not included in the package or Git repository.

Obtain the Solar source from [Enderfga/SolarRenderer](https://github.com/Enderfga/SolarRenderer). Its upstream code is Apache-2.0; model weights and adapters have their own [MiniMax H3 Community License](https://huggingface.co/Enderfga/SolarRenderer/blob/main/LICENSE). Retain applicable upstream notices and review the weight terms. The plugin itself is MIT-licensed.

## Model-facing workflow

Discover the relevant tool if Tool Manager hides schemas. Then inspect `action="menu"` for enabled/configured state and defaults.

Before composing a clip, call `action="prepare"` on the chosen tool. DSH's `agent/pre-step` hook supplies session-scoped prompting guidance for that pipeline; submit `action="generate"` with finished scene fields only. Guidance is removed from subsequent model context on submission, cancel, disable or disposal and is never sent as scene content. DSH may retain the notice in its durable audit history; the hook filters it out of later model requests. Another clip prepares again. No extra prompt-enhancer model is loaded.

- **LTX:** expand a brief idea into one continuous, mostly static shot, stable lighting and gentle movement. Aim for natural skin tones and crisp detail. Fast action and motion consistency are weaker areas; do not plan multi-shot scenes. Preserve explicitly requested exact prompts. Default uses Distilled's fixed eight steps/CFG 1.0. Only explicit `tags:["HQ"]` selects the distinct, slower Dev checkpoint; a final deliverable does not automatically authorize HQ.
- **H3:** describe subject identities, ordered actions, interactions, camera and timed audio. Use text alone, first/last-frame anchors through FL2VA, or reference collections through Ref2VA. The adapter can assemble official prompt sections from plain scene/audio fields and align keyframes to actual duration; `verbatim:true` preserves an explicitly requested exact prompt. See the capability table for reference ordering, limits and expert controls.
- **Solar:** inspect a real structure video and optional matching first frame. Supply a summary and 350–500 English words covering the desired appearance while preserving layout, facing, poses, motion and camera. The worker uses the upstream exact prompt assembler and four-step LoRA schedule. Still keyframes alone are not a motion guide. Output is silent. This adapter exposes one clip up to 158 frames (~6.6 seconds); causal streaming and web capture are not exposed.

Official prompting sources: [LTX-2.5 guide](https://ltx.io/blog/ltx-2-5-prompt-guide), [LTX open-source prompting](https://docs.ltx.io/open-source-model/usage-guides/prompting-guide), [MiniMax H3 base/reference guides](https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills/h3-prompt-writing/references), and [SolarRenderer caption guide](https://github.com/Enderfga/SolarRenderer/tree/main/skills/solarrenderer-caption).

## Quality and output

LTX Dev/HQ is a separate checkpoint. H3 `fast`/`balanced`/`more_steps` are sampling budgets on the selected H3 checkpoint, not different models; more steps can cost more without visibly improving a particular scene. Solar uses its dedicated four-step adapters. Sampling quality, native dimensions and final H.264 compression are separate controls.

H3 is fixed at 24 FPS and guidance 1 for these CFG-distilled weights. Duration rounds to the model's valid frame grid; the result reports actual dimensions, frame count, duration and effective settings. `audio:false` removes the final audio track, not the joint generation cost. Hosted Context-IR/2K regeneration, a general dubbing/editor API and unsupported image/video workflows are never silently invoked.

Completed video is saved under the active workspace's `dsh-videos/job-…` and as a durable DSH file attachment. The chat displays a native video card and Download video link outside collapsed tool details, including reopened conversations. In DSH replies, use a brief confirmation or ordinary file link: Markdown image syntax for MP4/WebM can produce “Image preview unavailable.”

The media pipeline checks container, codecs, dimensions, decoded frame count, FPS, requested audio and audio/video timing. It rejects decoder errors and entirely clipped black/white output. These checks do not certify aesthetic quality or perfect physics; qualification also inspects actual samples.

## Progress, cancellation and scheduling

The native call row stays compact, with a small progress bar, approximate percentage, stage and ETA. Progress is matched by exact call ID; prompts, paths and logs do not cross the progress endpoint. Unmeasured loading/queue stages may remain indeterminate. ETA extrapolates observed sampling and learns successful stage timings for matching output/sampling settings; cold caches, reference content and model restoration can still vary. It is an estimate, not a fixed completion promise. Jobs reach 100% only after finishing, model restoration and durable file saving settle.

User Stop, explicit cancel, plugin disable and disposal propagate cancellation to owned work. DSH's documented subprocess service manages worker ranges when available; standalone use owns a process group. Workers exit and release model allocations after a job. Model Scheduler receives interactive, immediate handoff for the owning chat so ordinary idle-switch delay does not apply. Unmanaged external GPU applications are not terminated. Failed or cancelled calls preserve a diagnostic job record and do not count as successful timing samples.

The owner-authorized settings/progress bridge uses DSH's web-server/connection lifecycle, same-origin checks and a connection capability. Native client slots render settings, tool status and persistent turn-tail players. Cordis effects unregister routes/tools/hooks and await worker teardown. The plugin uses public service/hooks rather than modifying DSH core or depending on Tool Manager internals.

## Development and verification

```bash
npm test
npm run check
npm pack --dry-run
```

The local integration suite includes real Cordis registry/disposal, owner routes, separate tool discovery, settings migration, prompt lifetime, request bounds, process cancellation, media validation, playback/range requests, progress and effective H3 controls. Scheduler integration tests require its checkout at ~/dsh-model-scheduler, or DSH_MODEL_SCHEDULER_ROOT pointing to another checkout. The path-binding test requires Python 3. Media tests find FFmpeg/FFprobe on PATH; FFMPEG_EXECUTABLE and FFPROBE_EXECUTABLE can select explicit test binaries. Real GPU tests and browser checks are recorded separately in QUALIFICATION.md; unit success alone never establishes model generation support.

## Recommended models and verified downloads

Open **Recommended models · exact revisions and hashes** in this plugin's settings card. The catalog records the checkpoints/components from the owner's configured setup with immutable repository revisions and SHA-256 (or Git blob hashes for small snapshot assets). Expand **Files, sizes and exact identities** before selecting a set.

**Download / verify recommended** saves a complete pinned set in this plugin's private `recommended-models` directory. Downloads resume from partial files, validate content before publishing final files, preserve existing models, and expose progress, cancellation and explicit failures. Repeating the action verifies/reuses existing files. Downloads do not start inference. **Add downloaded files** fills the existing model import/edit workflow for review and saving. Runtime installation remains separate.

Some configured artifacts are locally converted or assembled from multiple sources. Their exact local hashes are listed, but downloading the original publisher checkpoint cannot recreate those bytes. Use **Add existing model** and the normal importer for those entries. No incomplete component set is presented as a working download. Recommendations describe the saved setup; they do not establish memory fit or model quality on another computer.

See [COMPATIBILITY.md](COMPATIBILITY.md) for supported DSH versions and upgrade checks.
