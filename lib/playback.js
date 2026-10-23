import {stat} from 'node:fs/promises';import {createReadStream} from 'node:fs';
// The caller must authorize the owner before serving any attachment bytes.
export async function serveVideo(attachments,req,res){
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const params=new URL(req.url,'http://localhost').searchParams,id=params.get('id'),name=params.get('name');
  if(!/^sha256:[a-f0-9]{64}$/.test(id||'')||!/^generated-video\.(mp4|webm)$/.test(name||'')){res.writeHead(400);res.end();return;}
  const path=attachments.fileHostPath({attachmentId:id,name}),info=await stat(path);let start=0,end=info.size-1;
  res.setHeader('Content-Type',name.endsWith('.mp4')?'video/mp4':'video/webm');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Disposition',`${params.get('download')==='1'?'attachment':'inline'}; filename="${name}"`);
  if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(match&&(match[1]||match[2])){if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}else start=Math.max(0,info.size-Number(match[2]));}else start=NaN;
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
   res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
  }
  res.setHeader('Content-Length',end-start+1);if(req.method==='HEAD'){res.end();return;}
  const stream=createReadStream(path,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);
 }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500);res.end();}
}
