import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
async function renderer(overrides={}){let plugin,view,tail,cursor=0;const states=[],effects=[],views=new Map();const DisclosureRow=()=>{},IconSparkleRegular=()=>{};const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:'fragment',useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v];},useEffect(fn){effects.push(fn);}};vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{AbortController,setTimeout,clearTimeout,...overrides,window:{__DSH_VIDEO_TOOLS__:{path:'/plugins/dsh-video-tools/action',token:'fixture'},__ModuleLoader__:{load({factory}){plugin=factory(id=>id==='react'?React:{DisclosureRow,IconSparkleRegular});}}},URLSearchParams});plugin.apply({slots:{inject(name,fn){fn();},register(meta,component){if(meta.key){views.set(meta.key,component);if(meta.key==='generate_video_clip')view=component;}if(meta.id==='dsh-video-tools.outputs')tail=component;}},effect(){},locale:{}});return {view:props=>{cursor=0;return view(props);},tail,DisclosureRow,effects,views};}
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

// No worker or GPU is used: exercise the mounted tool view with synthetic API events.
test('native row updates the right-hand percentage and ETA for the exact call, and aborts polling',async()=>{
 const pending=[],requests=[];let value={status:'running',stage:'sampling',percent:15,etaSeconds:125},cleared;
 const f=await renderer({fetch:async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({result:value})};},setTimeout:fn=>{pending.push(fn);return 23;},clearTimeout:id=>cleared=id});
 const props={phase:'start',callId:'clip-call',block:{argsRaw:'PRIVATE PROMPT'},useDisclosure:()=>({expanded:false,toggle(){}})};
 f.view(props);const cleanup=f.effects[0]();await new Promise(r=>setImmediate(r));
 let tree=f.view(props);assert.equal(find(tree,'progress')[0].props.value,15);assert.equal(find(tree,'progress')[0].props.max,100);let row=find(tree,f.DisclosureRow)[0];assert.equal(row.props.title,'Calling tools');assert.equal(row.props.collapsedContent.children[0],'~15% · Processing · ETA ~3 min');assert.equal(row.props.collapsedContent.props.style.marginLeft,'auto');assert.equal(row.props.collapsedContent.props.style.font,'inherit');assert.doesNotMatch(JSON.stringify(row),/PRIVATE PROMPT/);
 assert.equal(JSON.parse(requests[0].options.body).payload.callId,'clip-call');
 value={...value,percent:26,etaSeconds:55};await pending.shift()();assert.equal(find(f.view(props),'progress')[0].props.value,26);row=find(f.view(props),f.DisclosureRow)[0];assert.equal(row.props.collapsedContent.children[0],'~26% · Processing · ETA <1 min');
 value={status:'running',stage:'restoring',percent:98,etaSeconds:null};await pending.shift()();assert.match(find(f.view(props),f.DisclosureRow)[0].props.collapsedContent.children[0],/Restoring model.*ETA estimating/);
 cleanup();assert.equal(cleared,23);assert.equal(requests[0].options.signal.aborted,true);
 assert.deepEqual([...f.views.keys()],['generate_video_clip','generate_video','render_video_solar','video_tools']);
});
