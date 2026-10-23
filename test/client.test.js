import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
async function renderer(){let plugin,view,tail;const DisclosureRow=()=>{},IconSparkleRegular=()=>{};const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:'fragment'};vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load({factory}){plugin=factory(id=>id==='react'?React:{DisclosureRow,IconSparkleRegular});}}},URLSearchParams});plugin.apply({slots:{inject(name,fn){fn();},register(meta,component){if(meta.key==='video_tools')view=component;if(meta.id==='dsh-video-tools.outputs')tail=component;}},effect(){},locale:{}});return {view,tail,DisclosureRow};}
const find=(tree,type)=>!tree||typeof tree!=='object'?[]:[...(tree.type===type?[tree]:[]),...(tree.children||[]).flat(Infinity).flatMap(c=>find(c,type))];
const file={type:'file',attachment:{attachmentId:'sha256:'+ 'a'.repeat(64),name:'generated-video.mp4'}};
test('pending video calls use a native collapsed row with no operation details or preview',async()=>{
 const {view,DisclosureRow}=await renderer();for(const phase of ['preparing','start']){const tree=view({phase,block:{content:[file],argsRaw:'SECRET PROMPT'},useDisclosure:()=>({expanded:true,toggle(){}})});const row=find(tree,DisclosureRow)[0];assert.ok(row,'native DisclosureRow');assert.equal(row.props.title,'Calling tools');assert.equal(row.props.expandable,false);assert.equal(row.props.open,false);assert.equal(find(tree,'video').length,0);assert.equal(find(tree,'pre').length,0);assert.doesNotMatch(JSON.stringify(tree),/Generating video|Video Generation|SECRET PROMPT/);}
});
test('completed video calls reveal a playable download and details only when expanded',async()=>{
 const {view,DisclosureRow}=await renderer();for(const expanded of [false,true]){const tree=view({phase:'result',block:{content:[{type:'text',text:'completed metadata'},file]},useDisclosure:()=>({expanded,toggle(){}})});assert.equal(find(tree,DisclosureRow)[0].props.title,'Tool call');assert.equal(find(tree,'video').length,1);assert.match(find(tree,'a')[0].props.href,/download=1/);assert.equal(find(tree,'pre').length,Number(expanded));}
});
test('video player and download appear at the turn bottom independently of tool disclosure',async()=>{
 const {tail}=await renderer(),root={kind:'tool-result',name:'video_tools',content:[file]};
 const snapshot={locations:{getTurn:turn=>turn===3?['a','duplicate','running','error']:[]},nodes:{get:key=>({kind:'tool-call',data:{root:key==='error'?{...root,isError:true}:key==='running'?{...root,kind:'tool-call'}:root}})}};
 const tree=tail({turn:3,useVideoChat:fn=>fn(snapshot)});assert.equal(tree.props['data-generated-videos'],true);assert.equal(find(tree,'video').length,1);assert.equal(find(tree,'video')[0].props.controls,true);assert.match(find(tree,'a')[0].props.href,/download=1/);
 assert.equal(tail({turn:4,useVideoChat:fn=>fn(snapshot)}),null);
});
