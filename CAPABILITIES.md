# Video tool capabilities and controls

The plugin registers three independent tools through DSH's registry. Tool Manager can discover/select them without a dedicated integration or a second video menu tool. The owner enables the plugin in Plugins and configures runtime/model defaults in Settings → Video Generation. Model Scheduler owns GPU handoff; DSH's subprocess service owns video worker ranges when available. The standalone runner uses owned process groups.

## Choosing a tool

| Tool | Intended task | Inputs | Output |
|---|---|---|---|
| `generate_video_clip` | Short, simple, mostly static marketing/product/portrait/stock-style clips; speed matters | Text prompt and generation settings | Browser-playable video, optional jointly generated audio |
| `generate_video` | MiniMax H3 full-motion short video, interactions, multiple subjects, synchronized audio | Text; optional first/last-frame images OR image/video/audio reference collections | MP4/H.264 video and optional AAC audio |
| `render_video_solar` | SolarRenderer frame-by-frame structure-guided styling | Structure video, optional matching first frame, English scene description | Silent MP4/H.264 video |

LTX's skin tones and fine detail are strengths to aim for, not guarantees. Fast action/temporal consistency are weaker areas. H3 is the richer-motion choice, but no model guarantees perfect physics, identity continuity or exact dialogue. Solar's four steps do not imply real-time generation on all hardware.

## MiniMax H3 public options

Precedence: explicit per-call expert setting → explicit named sampling profile → saved default. A profile only changes its documented sampling budget, not the checkpoint. Selecting a profile in Settings also updates its saved steps.

| Argument / setting | Accepted values / meaning |
|---|---|
| `action` | `menu`, `prepare`, `generate`, `status`, `cancel` |
| `prompt` | Finished scene or structured H3 prompt, at most 16,000 characters |
| `soundscape`, `music` | Separate optional audio descriptions for plain scene prompts; each at most 4,000 characters. Do not combine with a fully structured prompt |
| `verbatim` | Explicit exact-prompt request only; skips formatting and cannot be combined with separate soundscape/music fields |
| `quality` | `fast` = 12 steps; `balanced` = 20; `more_steps` = 30. Additional steps are slower, not a guarantee of better output |
| `steps` | Expert override, integer 4–60 |
| `sampler` | `res_multistep` (default), `euler` |
| `scheduler` | `simple` (default), `normal` |
| `shift_video`, `shift_audio` | Expert flow shifts, 0.01–100; defaults 12 and 3 |
| `duration` / `frames` | Choose one. Requested duration 4–15 seconds or frame count 96–362; rounds upward to 17n+5 at fixed 24 FPS. Actual duration is returned; a 4-second request yields 107 frames (~4.46 seconds) |
| `resolution` | `480p` = 864×480; `768p` = 1344×768; `custom` uses dimensions. Native inference, no upscaling |
| `shape` | `landscape`, `portrait`, `square`. Presets swap dimensions for portrait; square uses the smaller side. For exact custom dimensions omit shape |
| `width`, `height` | Multiples of 32, 256–1344, total area no more than 1344×768 |
| First/last frame | Each accepts a workspace-relative `first_frame_path` / `last_frame_path` OR corresponding complete `_attachment_id` from this chat |
| `reference_images` | Up to 9 `{path}` or `{attachment_id}` entries, in order |
| `reference_videos` | Up to 3 entries, each 2–15 seconds, combined duration ≤15 seconds (small container/frame-grid timing tolerance). Optional `include_audio:true` retains a paired reference soundtrack |
| `reference_audios` | Up to 3 entries, each 2–15 seconds, combined duration ≤15 seconds. Requires an audio stream |
| Combined references | At most 12 source files; reference collections cannot be mixed with first/last-frame inputs |
| `ref_image_size` | `match` sizes reference images to output area; `max` allows higher reference-image fidelity at greater time/memory cost |
| `audio` | Keep/discard native generated audio. False removes the final audio track; it does not skip joint generation cost |
| `crf` | Final H.264 compression, integer 0–40, default 18. Intermediate H.264 is lossless to avoid imposing an earlier lossy compression limit |
| `memory_mode` | `lowvram` (default) or expert `normalvram`; fit and performance depend on hardware |
| `seed` | Integer 0–2147483647; bit-for-bit reproducibility is not promised across runtime/hardware changes |
| `job_id` | Job identifier for cancellation/status workflows |

Reference labels: images `<Picture 1>` onward; videos `<Video 1>` onward; `<Audio n>` counts included video soundtracks in video order before standalone audio clips. FL2VA first/last alignment instructions are assembled using actual effective duration. A `prepare` call supplies temporary prompting guidance; only scene content is submitted.

### Owner settings

Independent FL2VA and Ref2VA checkpoints; encoder and video/audio VAE paths; default quality, steps, sampler, schedule, shifts, width/height/duration, compression, reference sizing and memory mode. Common settings cover Python/backend paths, FFmpeg/FFprobe, GPU index, thread count, admission memory floor, job timeout and restoration. Saved defaults are validated and preserved on migration. H3 and Solar never silently substitute LTX or fall back to CPU.

### Fixed or unavailable features

- CFG-distilled H3 guidance is fixed at 1; negative prompts and arbitrary guidance overrides are not supported.
- Frame rate is fixed at 24 FPS for this H3 adapter.
- Local browser deliverables use MP4/H.264/AAC, avoiding an unsupported HEVC playback assumption.
- Hosted Context-IR and 2K regeneration are not implemented. No external generation API is silently called.
- The adapter does not claim a general dubbing/editor API, unrestricted long-form generation, or separate H3 HQ model weights.
- Passing schema validation does not establish memory fit or output quality for every combination. Consult QUALIFICATION.md for measured cases.

## LTX and Solar limits

LTX Distilled keeps its required eight-step/CFG-1 schedule. Only explicit `tags:["HQ"]` selects the distinct Dev checkpoint; final-deliverable wording does not authorize an automatic upgrade. Requested dimensions/frames and final cropping/rounding are returned. Large presets are requests, not hardware guarantees. Its temporary guide favors one continuous, mostly static shot.

Solar uses the configured Ref2VA checkpoint and both released non-causal LoRAs, upstream prompt assembly, four sampling steps and silent audio latents. It requires a structure video; unrelated still images alone are not a motion guide. Frames must be 17n+5 from 22 through 158 at 24 FPS. It accepts an optional first frame, trained structure category or custom structure description, summary, 350–500 word description, canvas and seed. Streaming, web capture and generated soundtrack are not exposed.

## Lifecycle, privacy and progress

Call-specific progress never returns prompts or paths. Percentage is an approximate whole-job value derived from real stage/step events. ETA uses observed sampling speed and, when available, successful prior stage timings for matching output/sampling settings. Cold caches and reference content can still change runtime. Queue wait and unseen workloads may remain indeterminate. Completion is withheld until finishing, restoration and durable file saving settle.

Chat Stop, explicit cancellation and plugin disable propagate cancellation to the owned worker range. Handoff requests are interactive and immediate for the owning chat, without the ordinary model idle-switch delay. The runtime will not terminate unmanaged external GPU jobs. Prompt guidance is session-scoped and removed on submission/cancel/disable; it is not saved as scene content.
