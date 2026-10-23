// Original summary of Lightricks' official text-to-video guidance, reviewed 2026-10-22.
export const guideSources = [
 'https://ltx.io/blog/ltx-2-5-prompt-guide',
 'https://docs.ltx.io/open-source-model/usage-guides/prompting-guide',
];
export const promptGuide = `LTX-2.5 prompt preparation (temporary guidance, not video content)
Write the scene prompt for video_tools(action="generate") now. Expand a brief idea with sensible creative choices while preserving the user's subjects, intent, constraints and tone. Honor an explicitly requested verbatim prompt. Put only the finished scene in the prompt argument; never copy these instructions, headings or source links.

Establish framing and visual style, then describe the surroundings, textures, palette and a consistent lighting setup. Identify subjects with stable, distinctive details. Describe visible emotion through posture, expression or gestures. Give actions active present-tense verbs and a clear chronological progression; appearance alone supplies little motion. Specify camera motion relative to the subject, its timing and the composition it reveals.

For a simple clip, prefer one continuous shot in a flowing paragraph, usually four to eight useful sentences. Adjust detail to framing and complexity. Fit the action to the requested duration, including intended pauses. Keep subjects and actions focused; avoid contradictory camera directions, implausibly chaotic physics, quality-keyword filler and another engine's tag syntax. Short, concrete scenes are easier to iterate.

When audio is enabled, describe appropriate ambience, sound effects, music and vocal delivery. Quote actual dialogue, identify its speaker and specify language/accent when relevant. Keep speech short enough for the clip. Respect silence or audio=false; do not invent dialogue that changes the user's idea.

Only use multiple shots when the requested scene benefits and duration permits: favor two to four. Name each cut or dissolve in prose, establish the new framing, retain recognizable subject details, and say whether sound continues or changes. Avoid unexplained changes of location or costume. For dialogue-heavy scenes, character cues can clarify timing. Exact on-screen text is unreliable; keep any requested text brief.

This tool generates text-to-video only; editing, dubbing and image conditioning are not enabled. No extra prompt-enhancer model is needed. Submit the finished prompt via generate, retaining explicit HQ consent and requested generation settings. This temporary guide is removed on submission.`;
const kind='dsh-video-tools/prompt-guide';
export function createPromptPreparation(ctx, enabled=()=>true){
 let states=new WeakMap();
 const key=exec=>exec?.agent?.session||exec?.agent;
 const prepared=exec=>!!(key(exec)&&states.get(key(exec))?.seen);
 function prepare(exec){const agent=key(exec);if(agent)states.set(agent,{seen:false});return {prepared:!!agent,next:'Compose the scene using the temporary LTX guide in your next model context, then call video_tools(action="generate", prompt="finished scene only").',sources:guideSources};}
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
