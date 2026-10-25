# Hardware qualification — 0.5.0

Tested 2026-10-24 on Linux after a fresh reboot. This is a measured support boundary, not a promise that every exposed combination fits every GPU.

## Environment

- NVIDIA RTX PRO 5000 Blackwell Laptop, 24,463 MiB VRAM; driver 615.71.09.
- 122 GiB system RAM with swap available. Large encoders/offloaded weights use substantial host memory; SSD activity and cache warmth affect timings.
- PyTorch 2.14.0, isolated Python runtime; eight CPU threads for worker tensor operations.
- ComfyUI `8f04fd6ecf4a548937971e840af2a985529fab76`; ComfyUI-GGUF `6ea2651e7df66d7585f6ffee804b20e92fb38b8a`.
- SolarRenderer `41e136e64b30d4aa0095070ce055ff00ae90fe3b`; H3 source/reference docs `d21241f0a4b3acbb34c97dae47fa417b7065e438`.
- Local INT8 H3 FL2VA/Ref2VA + Qwen3-VL encoder, FP16 video VAE and FP32 audio VAE. LTX Distilled and Dev UD-Q4_K_XL GGUF checkpoints. Downloaded H3/Solar weights verified against pinned sizes/SHA-256.

## Actual render matrix

Every completed render passed the plugin's FFprobe/decoded-media checks: requested effective dimensions and frame rate, decoded frame count, finite/nonblank frames, valid browser-compatible container/codecs, expected audio presence and duration alignment. Timings include worker startup, conditioning, sampling, decoding, final encoding and attachment save in the isolated qualification harness; these cases had no chat model to restore. Peak GPU figures are sampled process memory, not a sum of all graphics allocations.

| Case | Effective output | Wall time | Peak GPU | Result |
|---|---|---:|---:|---|
| ltx-standard | 640×360, 33 frames | 69.2 s | 21866 MiB | audio; passed |
| ltx-hq | 360×360, 33 frames | 132.2 s | 21866 MiB | silent; passed |
| h3-fast | 256×256, 107 frames | 92.7 s | 20760 MiB | audio; passed |
| h3-balanced | 256×256, 107 frames | 85.2 s | 20760 MiB | audio; passed |
| h3-more-steps | 256×256, 107 frames | 125.6 s | 20760 MiB | audio; passed |
| h3-first | 256×256, 107 frames | 94.5 s | 20748 MiB | audio; passed |
| h3-last | 256×256, 107 frames | 104.1 s | 20748 MiB | audio; passed |
| h3-both | 256×256, 107 frames | 111.0 s | 20794 MiB | silent; passed |
| h3-image-ref | 256×256, 107 frames | 99.9 s | 20744 MiB | audio; passed |
| h3-video-ref | 256×256, 107 frames | 124.8 s | 21108 MiB | audio; passed |
| h3-audio-ref | 256×256, 107 frames | 98.2 s | 20682 MiB | audio; passed |
| h3-mixed-ref | 256×256, 107 frames | 131.8 s | 21138 MiB | audio; passed |
| h3-480p | 864×480, 107 frames | 219.3 s | 20296 MiB | audio; passed |
| h3-expert | 256×256, 107 frames | 90.6 s | 20766 MiB | silent; passed |
| solar-first | 448×256, 158 frames | 290.0 s | 22678 MiB | silent; passed |
| solar-no-first | 448×256, 39 frames | 174.5 s | 21276 MiB | silent; passed |
| h3-expert-reference | 256×448, 107 frames | 48.0 s | 21244 MiB | silent; passed |
| h3-max-duration | 256×256, 362 frames | 103.9 s | 20834 MiB | silent; passed |
| h3-768p | 1344×768, 107 frames | 397.2 s | 19804 MiB | audio; passed |

The 256×256 H3 cases use 107 frames (~4.46 seconds), unless stated otherwise. Fast/balanced/more_steps use 12/20/30 steps. First/last/both exercise FL2VA endpoints. Reference tests exercise the independent Ref2VA checkpoint with image, video plus its soundtrack, standalone WAV and mixed references. The expert case exercises Euler/normal, custom flow shifts and compression. Expert reference exercises portrait orientation, max reference sizing, normalvram and CRF 0. Maximum duration requests 15 seconds and returns 362 frames (~15.08 seconds). 480p/768p are native inference sizes, not upscales. Solar first-frame runs the upstream semantic-highway example for 158 frames (~6.58 seconds); the no-first-frame case uses 39 frames.

## Quality and tuning

Representative contact sheets were inspected across each clip. LTX produced a stable red-cup/steam stock-style scene. H3 480p produced clear red/blue robots passing a yellow cube; 30 steps did not show an obvious advantage over 20 on the small test. Solar retained the highway motion and neon styling of its supplied structure/first frame. These are sample observations, not broad quality benchmarks or a guarantee of physics/identity consistency.

The practical defaults remain LTX Distilled for simple clips; H3 480p, 20 steps, res_multistep/simple, shifts 12/3 and lowvram for more involved video. Named budgets change steps only. Cold loading and different cache conditions can outweigh sampling-budget differences, so the short runs do not establish a speed ranking between budgets. Eight worker CPU threads avoid oversubscription. Intermediate H.264 is lossless; the requested CRF is applied only in final delivery. H3 audio=false discards audio after joint generation and does not save the joint model cost.

## Integration verification

- 45 automated tests passed, covering request bounds, configuration migration, per-call progress/ETA, media serving/ranges, lifecycle, temporary prompt guidance and cancellation contracts.
- Actual DSH Tool Manager discovery/select/disable lifecycle passed for all three separately registered tools. Literal tool declarations preserve package ownership discovery without changes to Tool Manager.
- Actual DSH local subprocess provider launch/cancel smoke passed, including owned process-range teardown.

The native audio-analysis backend examined the full 4.48-second H3 480p soundtrack. It detected no speech and described metallic clicks. Its speculative source/frequency claims were not used as measurements. FFmpeg measured a -1.39 dBFS peak, -44.79 dBFS overall RMS, and no NaN/Inf samples. This validates an audio deliverable, not a general dialogue/lip-sync quality benchmark.

Live DSH chat verification used the user's Qwen 27B/NInfer profile and the real tool registry, subprocess provider, scheduler and attachment store:

- LTX preparation → generation completed once with the exact 640×360 / 33-frame / 24-FPS / audio-on request. The finished prompt was an expanded scene paragraph, with no guide content.
- The GPU trace showed Qwen exit, the isolated video worker run, that worker exit, and Qwen restart with no concurrent model processes. Job time was 103.9 seconds including 32.1 seconds restoring Qwen; the complete cold chat turn took 3 minutes 58 seconds.
- UI showed indeterminate loading, then 47% with ETA <1 minute, then 98% during restoration. It withheld completion until restoration and durable attachment save settled.
- The completed player is pinned below the assistant reply even with process/tool history collapsed. Refresh preserved it. Native browser playback reached the end (1.375 seconds, 640×360, readyState 4, no media error).
- Downloading through the actual chat link returned the exact saved bytes: SHA-256 `764c2ad8096b62380f662e09cabe4d0c5ba25c9291f52a1efdd099e4ce4499cd`.
- Real chat testing caught and fixed the Turn-tail slot currency mismatch: the owner supplies a TurnLocation object; the public location index takes its numeric turn. The regression fixture now uses the actual owner shape.
- Tool Manager's independent 0.4.2 fix keeps exact callable-name searches from being redirected to unrelated skills; its 53 tests passed. Ordinary capability searches still use its mixed tool/skill selector. Selector quality depends on the selected language model.

- H3 accepted the uploaded first-frame image from this conversation, including the model's full bare hash without its sha256 prefix. Normalization is scoped to a matching chat attachment; unknown IDs return valid chat IDs instead of encouraging filesystem inspection.
- Live browser Stop at 22% sampling terminated the H3 worker within the next 0.73-second GPU observation. The job finished as cancelled, produced no result.mp4 and published no attachment/player. Qwen then restored. DSH waits for cleanup/restoration before settling the stopped turn, so the turn can take another ~30 seconds to settle after the video process exits.
- A subsequent H3 first-frame run completed at 256×256 / 107 frames / 12 steps / normalvram / audio on. It took 92.5 seconds including 31.1 seconds restoring Qwen; the complete chat turn took 1 minute 56 seconds. Peak process GPU memory was 21,204 MiB and host RSS about 56.6 GiB. This qualifies normal memory policy for these tested small-canvas/reference cases, not every large combination.
- The H3 card remained outside collapsed tool history. Browser playback reached the end (4.48-second container duration, no media error). Download SHA-256 matched the saved output: `c1bdb6db35abcae2f4e72a1b0f77aff2862b6bfe0742e34c91df49980dc3573c`.
- Video admission after the actual native call took 1.96 seconds for LTX and 1.42–2.14 seconds for H3, including the managed chat-model unload. The ordinary 30-second switch delay did not apply. Language-model prompt processing before it submits a tool call is separate from this admission time.

The release therefore has 19 completed isolated GPU render cases, two completed live-chat renders, one live sampling cancellation, real browser playback/download checks, 45 video-plugin tests and 53 tests for the separate Tool Manager fix. Unsupported hosted features and untested combinations remain bounded as documented below.

## Explicit limits

No hosted Context-IR/2K regeneration, streaming Solar inference, arbitrary H3 FPS/CFG/negative prompts, LTX image conditioning or upscaling is claimed. H3 can accept multiple-reference inputs within documented count/duration limits, but not every maximum-count and maximum-resolution combination was exhaustively rendered. No Windows qualification or universal 4K/CPU/iGPU performance claim is made by this release. The GPU worker does not terminate external unmanaged applications.
