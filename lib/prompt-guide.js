// Original summary of Lightricks' official text-to-video guidance, reviewed 2026-10-22.
export const guideSources = [
 'https://ltx.io/blog/ltx-2-5-prompt-guide',
 'https://docs.ltx.io/open-source-model/usage-guides/prompting-guide',
];
// Product suitability guidance, distinct from the upstream prompting summary.
export const clipGuidance = 'Use this pipeline for short, simple, mostly static video clips: marketing clips, product shots, portraits, stock video and stock-photo-style clips with subtle movement. Favor it when turnaround speed matters more than complex motion. Its visual strengths are sharp skin tones, natural-looking skin texture and crisp details, but these are strengths to aim for, not guarantees. Fast movement, motion consistency and complex choreography are weaker areas. Plan one continuous shot with a locked camera or a very slow camera move, one subject or a simple composition, stable lighting and gentle motion. Do not plan multi-shot scenes, cuts, rapid camera moves, fast action or tightly synchronized interactions. If the request depends on those, explain the limitation and offer a simpler single-shot version; do not silently rewrite the request or promise reliable motion consistency. HQ is slower and does not remove these motion limitations.';
export const promptGuide = `LTX-2.5 prompt preparation (temporary guidance, not video content)
Write the scene prompt for generate_video_clip(action="generate") now. Expand a brief idea with sensible creative choices while preserving the user's subjects, intent, constraints and tone. Honor an explicitly requested verbatim prompt. Put only the finished scene in the prompt argument; never copy these instructions, headings or source links.

${clipGuidance}

Establish framing and visual style, then describe the surroundings, textures, palette and a consistent lighting setup. Identify subjects with stable, distinctive details. Describe visible emotion through posture, expression or gestures. Use active present-tense verbs for subtle movement such as breathing, a slight smile, leaves drifting or a gentle product rotation. Prefer a locked camera; if needed, describe only a very slow push-in or drift. Avoid adding movement merely to make a static composition more elaborate.

Write one continuous, mostly static shot in a flowing paragraph, usually four to eight useful sentences. Adjust detail to framing and complexity. Fit the action to the requested duration, including intended pauses. Keep subjects and actions focused; avoid contradictory camera directions, implausibly chaotic physics, quality-keyword filler and another engine's tag syntax. Short, concrete scenes are easier to iterate.

When audio is enabled, describe appropriate ambience, sound effects, music and vocal delivery. Quote actual dialogue, identify its speaker and specify language/accent when relevant. Keep speech short enough for the clip. Respect silence or audio=false; do not invent dialogue that changes the user's idea.

Keep the same scene, subject identity, framing and lighting throughout the clip. Do not introduce cuts, dissolves, shot lists, location changes or costume changes. For a portrait, prioritize natural skin tones, stable facial features and crisp texture with only small expressions or breathing. For a product or stock clip, prioritize a clean composition, controlled light and restrained motion. Exact on-screen text is unreliable; leave marketing typography and logos for later editing rather than promising precise generated lettering.

This tool generates text-to-video only; editing, dubbing and image conditioning are not enabled. No extra prompt-enhancer model is needed. Submit the finished prompt via generate, retaining explicit HQ consent and requested generation settings. This temporary guide is removed on submission.`;
const kind='dsh-video-tools/prompt-guide';
export function createPromptPreparation(ctx, enabled=()=>true){
 let states=new WeakMap();
 const key=exec=>exec?.agent?.session||exec?.agent;
 const prepared=exec=>!!(key(exec)&&states.get(key(exec))?.seen);
 function prepare(exec){const agent=key(exec);if(agent)states.set(agent,{seen:false});return {prepared:!!agent,next:'Compose a simple, mostly static single-shot clip using the temporary LTX guide in your next model context, then call generate_video_clip(action="generate", prompt="finished scene only").',sources:guideSources};}
 function consume(exec){const agent=key(exec);if(agent)states.delete(agent);}
 const off=ctx.on('agent/pre-step',async({agent},next)=>{
  const decision=await next();if(decision.kind==='reject'||!decision.messages)return decision;
  const messages=decision.messages.filter(message=>message.source?.kind!==kind);
  const state=key({agent})&&states.get(key({agent}));
  if(enabled()&&state){state.seen=true;messages.push({role:'user',id:kind,source:{kind,form:'notice',summary:'Temporary LTX prompt guidance'},content:[{type:'text',text:promptGuide}]});}
  return {...decision,messages};
 },{prepend:true});
 ctx.effect(()=>()=>{off();states=new WeakMap();});
 return {prepare,prepared,consume,clear(){states=new WeakMap();}};
}
