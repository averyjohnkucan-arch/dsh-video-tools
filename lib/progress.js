// Sampling occupies an estimated 85% of a job. Loading/decoding/restoration
// have unknown runtimes; never manufacture a countdown before sampling evidence.
export function setStage(job,stage,now=Date.now()){
 job.stage=stage;job.stageStarted=now;
 if(stage==='sampling'){job.samplingStarted=now;job.percent=5;}
 else if(stage==='decoding')job.percent=Math.max(job.percent||0,90);
 else if(stage==='encoding')job.percent=Math.max(job.percent||0,94);
 else if(stage==='finishing')job.percent=Math.max(job.percent||0,96);
 else if(stage==='restoring')job.percent=Math.max(job.percent||0,98);
 else if(stage==='complete')job.percent=100;
 else if(stage==='loading'){job.percent=null;delete job.samplingStarted;delete job.step;delete job.total;delete job.stepSeconds;}
}
export function updateProgress(job,chunk,now=Date.now()){
 job.progressBuffer=((job.progressBuffer||'')+String(chunk)).slice(-12000);
 const lines=job.progressBuffer.split(/[\r\n]/);job.progressBuffer=lines.pop();
 for(const raw of lines){const line=raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'');let event;
  try{event=JSON.parse(line);}catch{}
  if(event?.stage&&['loading','sampling','decoding','encoding'].includes(event.stage)){
   if(job.stage!==event.stage)setStage(job,event.stage,now);
   if(event.stage==='sampling'&&Number.isInteger(event.step)&&Number.isInteger(event.total)&&event.total>0&&event.step>0&&event.step<=event.total){
    job.step=event.step;job.total=event.total;job.percent=Math.max(job.percent||0,Math.floor(5+85*event.step/event.total));
    const elapsed=(now-job.samplingStarted)/1000;if(elapsed>0)job.stepSeconds=elapsed/event.step;
   }
  }else{
   const match=line.match(/(?:^|\s)(\d+)\s*\/\s*(\d+).*?(?:s\/it|it\/s)/);
   if(match){const step=Number(match[1]),total=Number(match[2]);if(total>0&&step>0&&step<=total){if(job.stage!=='sampling')setStage(job,'sampling',job.started||now);job.step=step;job.total=total;job.percent=Math.max(job.percent||0,Math.floor(5+85*step/total));const elapsed=(now-job.samplingStarted)/1000;if(elapsed>0)job.stepSeconds=elapsed/step;}}
  }
 }
}
export function progressSnapshot(job,now=Date.now()){
 if(!job)return null;
 const terminal=!['queued','running'].includes(job.status);
 let etaSeconds=null;
 if(!terminal&&job.stage==='sampling'&&job.stepSeconds>0){
  // Includes a heuristic tail for decoding/finishing; model restoration is variable.
  const predictedSampling=job.stepSeconds*job.total;
  const predictedEnd=job.samplingStarted/1000+predictedSampling*1.18;
  etaSeconds=Math.ceil(Math.max(0,predictedEnd-now/1000));if(etaSeconds===0)etaSeconds=null;
 }
 return {status:job.status,stage:job.stage||'queued',percent:job.status==='complete'?100:Number.isFinite(job.percent)?job.percent:null,etaSeconds,estimated:true};
}
