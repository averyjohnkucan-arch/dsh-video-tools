import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
export async function terminate(child){
 if(child?.managed){child.managed.terminate();if(!await child.managed.waitForExit(AbortSignal.timeout(10000)))throw Error('Managed video worker did not terminate within 10 seconds.');return;}
 if(!child?.pid)return;
 if(process.platform==='win32'){if(child.exitCode===null&&!child.signalCode)await new Promise(resolve=>{const kill=spawn('taskkill',['/PID',String(child.pid),'/T','/F']);kill.once('close',resolve);kill.once('error',resolve);});return;}
 const signal=s=>{try{process.kill(-child.pid,s);}catch(e){if(e.code!=='ESRCH')throw e;}};
 const alive=()=>{try{process.kill(-child.pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
 if(!alive())return;signal('SIGTERM');const deadline=Date.now()+5000;while(alive()&&Date.now()<deadline)await delay(50);if(alive())signal('SIGKILL');
}
export async function run(binary,args,{signal,timeoutMs=30000,onData=()=>{},onSpawn=()=>{},onMemory=()=>{},gpu,onGpuMemory=()=>{},subprocess}={}){
 signal?.throwIfAborted();let child;
 if(subprocess){const managed=subprocess.spawn({argv:[binary,...args],cwd:process.cwd(),stdio:{stdin:'ignore',stdout:'pipe',stderr:'pipe'},graceMs:5000,signal,env:{HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});child=new EventEmitter();Object.assign(child,{managed,stdout:managed.stdout,stderr:managed.stderr,exitCode:null,signalCode:null});managed.done.then(value=>{child.exitCode=value.exitCode;child.signalCode=value.signal;child.emit('close',value.exitCode);},error=>child.emit('error',error));}
 else{const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^DSH_|TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY/i.test(key)));child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',env:{...env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});}onSpawn(child);
 let gpuPending=false;const gpuTimer=gpu===undefined?null:setInterval(()=>{if(gpuPending||!child.pid)return;gpuPending=true;execFile('nvidia-smi',[`--id=${gpu}`,'--query-compute-apps=pid,used_memory','--format=csv,noheader,nounits'],{timeout:2000},(error,stdout)=>{gpuPending=false;if(error)return;for(const line of stdout.trim().split('\n')){const [pid,mib]=line.split(',').map(Number);if(pid===child.pid&&Number.isFinite(mib))onGpuMemory(mib);}});},500);gpuTimer?.unref();
 let peakRSSKiB=0;const sample=async()=>{if(!child.pid)return;try{const status=await readFile(`/proc/${child.pid}/status`,'utf8');peakRSSKiB=Math.max(peakRSSKiB,Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1]||0));onMemory(peakRSSKiB);}catch{}};const memoryTimer=setInterval(sample,500);memoryTimer.unref();
 let stdout='',stderr='',timedOut=false;const stop=()=>void terminate(child).catch(()=>{}),abort=()=>stop();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)stop();
 const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
 child.stdout.on('data',b=>{stdout=(stdout+b).slice(-100000);onData(String(b));});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-100000);onData(String(b));});
 try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});signal?.throwIfAborted();if(timedOut)throw Error('Video generation timed out.');if(code!==0)throw Error(`Video engine exited ${code}: ${(stderr+"\n"+stdout).slice(-6000)}`);return {stdout,stderr};}
 finally{clearInterval(gpuTimer);clearInterval(memoryTimer);clearTimeout(timer);signal?.removeEventListener('abort',abort);await terminate(child);}
}
