import {run} from './process.js';
export async function probe(binary,file,signal){
 const info=JSON.parse((await run(binary,['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],{signal})).stdout);
 const audio=info.streams?.find(s=>s.codec_type==='audio');
 if(audio){
  const {stdout}=await run(binary,['-v','error','-select_streams','a:0','-show_entries','packet=pts_time,duration_time','-of','csv=p=0',file],{signal});
  const packets=stdout.trim().split('\n').map(line=>line.split(',').slice(0,2).map(Number)).filter(row=>row.length===2&&row.every(Number.isFinite));
  if(!packets.length)throw Error('Unable to validate audio packet timing.');
  audio.validatedEnd=Math.max(...packets.map(([pts,length])=>pts+length));
 }
 return info;
}
const rate=s=>{const [n,d=1]=String(s).split('/').map(Number);return n/d;};
const duration=s=>{if(Number.isFinite(Number(s.duration)))return Number(s.duration);const tag=s.tags?.DURATION;if(!tag)return NaN;return tag.split(':').reduce((a,v)=>a*60+Number(v),0);};
export function validateMedia(info,r,{raw=false}={}){
 const video=info.streams?.find(s=>s.codec_type==='video'),audio=info.streams?.find(s=>s.codec_type==='audio');
 if(!video||video.width!==(raw?r.generationWidth:r.width)||video.height!==(raw?r.generationHeight:r.height)||Number(video.nb_read_frames)!==r.frames||!Number.isFinite(rate(video.avg_frame_rate||video.r_frame_rate))||Math.abs(rate(video.avg_frame_rate||video.r_frame_rate)-r.fps)>.001)throw Error('Video failed dimensions, frame count or frame-rate validation.');
 const mp4=String(info.format?.format_name).split(',').includes('mp4');
 if(!mp4&&!String(info.format?.format_name).split(',').includes('webm'))throw Error('Output is not an MP4 or WebM container.');
 if((raw||r.audio)&&!audio||!raw&&!r.audio&&audio)throw Error('Video failed requested audio validation.');
 if(audio){const audioEnd=audio.validatedEnd??duration(audio),expectedEnd=(Number(video.start_time)||0)+r.duration;
  if(!Number.isFinite(audioEnd)||Math.abs(audioEnd-expectedEnd)>Math.max(.12,2/r.fps)||Math.abs((Number(audio.start_time)||0)-(Number(video.start_time)||0))>.12)throw Error('Audio/video timing validation failed.');}
 if(!raw&&(mp4?(video.codec_name!=='h264'||video.pix_fmt!=='yuv420p'||audio&&audio.codec_name!=='aac'):(!['vp8','vp9','av1'].includes(video.codec_name)||audio&&!['opus','vorbis'].includes(audio.codec_name))))throw Error('Output codecs are not browser-compatible.');
 return info;
}
export async function finishMedia(cfg,r,raw,output,signal){
 const source=validateMedia(await probe(cfg.ffprobeExecutable,raw,signal),r,{raw:true});
 const crop=r.generationWidth!==r.width||r.generationHeight!==r.height,mp4=output.endsWith('.mp4');
 const args=['-hide_banner','-loglevel','error','-nostdin','-i',raw,'-map','0:v:0'];
 if(r.audio)args.push('-map','0:a:0','-c:a',mp4?'aac':['opus','vorbis'].includes(source.streams.find(s=>s.codec_type==='audio').codec_name)?'copy':'libopus');else args.push('-an');
 if(crop)args.push('-vf',`crop=${r.width}:${r.height}:${Math.floor((r.generationWidth-r.width)/2)}:${Math.floor((r.generationHeight-r.height)/2)}:exact=1`);
 if(mp4)args.push('-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-threads',String(cfg.threads));else if(crop)args.push('-c:v','libvpx-vp9','-lossless','1','-threads',String(cfg.threads));else args.push('-c:v','copy');
 args.push('-y',output);await run(cfg.ffmpegExecutable,args,{signal,timeoutMs:cfg.timeoutMs});
 const info=validateMedia(await probe(cfg.ffprobeExecutable,output,signal),r);await validateDecodedMedia(cfg,r,output,signal);return info;
}

// Successful muxing alone is insufficient: detect decoder errors and wholly clipped output.
export async function validateDecodedMedia(cfg,r,file,signal){
 let buffer='',frames=0,allWhite=true,allBlack=true,decodeError=false;
 const line=value=>{
  const match=value.match(/lavfi\.signalstats\.(YMIN|YMAX)=([0-9.]+)/);
  if(match){const n=Number(match[2]);if(match[1]==='YMIN'){allWhite&&=n>=234;}else{frames++;allBlack&&=n<=17;}}
  if(/Error while decoding|Invalid data found/i.test(value))decodeError=true;
 };
 await run(cfg.ffmpegExecutable,['-hide_banner','-v','error','-xerror','-i',file,'-vf','signalstats,metadata=print:file=-','-f','null','-'],{signal,timeoutMs:cfg.timeoutMs,onData:chunk=>{buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop();for(const value of lines)line(value);}});line(buffer);
 if(decodeError)throw Error('Generated media contains decoder errors; output is not qualified.');
 if(frames!==r.frames)throw Error('Decoded video frame count did not match the request.');
 if(allWhite||allBlack)throw Error('Generated video is entirely clipped white or black; runtime/model qualification failed.');
}
