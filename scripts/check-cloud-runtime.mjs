// Real local workerd/D1/R2/Queues integration; uses an isolated fixture account.
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { DEFAULTS,pt } from '../src/engine/geometry.ts';
import { sha256 } from '../server/cloud/contract.mjs';
import { cleanImage } from '../server/cloud/image.mjs';
const {origin,token}=JSON.parse(await readFile('verification/cloud/local-session.json','utf8'));
const cookie='postertiler-dev-session='+token,checks=[];
async function call(path,{method='GET',body,headers={}}={}) {return fetch(origin+'/api/cloud/test'+path,{method,headers:{Cookie:cookie,Origin:origin,...headers},body});}
for(const [name,path,settings] of [
 ['PNG four-sheet delivery','public/assets/images/alpine-lake.png',{...DEFAULTS}],
 ['JPG 400-sheet delivery',process.env.CLOUD_JPEG_FIXTURE||'../benchmarks/fixtures/50MP.jpg',{...DEFAULTS,columns:20,rows:20}],
]) {
 const bytes=new Uint8Array(await readFile(path)),mime=path.endsWith('.png')?'image/png':'image/jpeg';
 const response=await call('/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:crypto.randomUUID(),source_hash:await sha256(bytes),source_size:bytes.length,source_type:mime,settings,upload_consent:true})});
 const data=await response.json();assert.equal(response.status,201,JSON.stringify(data));const id=data.job.id;
 if(data.job.can_upload){const upload=await call('/jobs/'+id+'/source',{method:'PUT',headers:{'Content-Type':mime},body:bytes});assert.equal(upload.status,202,await upload.text());}
 let job;for(let i=0;i<80;i++){job=(await (await call('/jobs/'+id)).json()).job;if(!['queued','processing'].includes(job.status))break;await new Promise(r=>setTimeout(r,500));}
 assert.equal(job.status,'succeeded',JSON.stringify(job));
 const download=await call('/jobs/'+id+'/download');assert.equal(download.status,200);const pdfBytes=new Uint8Array(await download.arrayBuffer());const pdf=await PDFDocument.load(pdfBytes);assert.equal(pdf.getPageCount(),settings.columns*settings.rows);assert.ok(Math.abs(pdf.getPage(0).getWidth()-pt(210))<1e-6);
 for(const auxiliary of ['assembly','calibration']){const r=await call(`/jobs/${id}/${auxiliary}`);assert.equal(r.status,200);assert.ok((await PDFDocument.load(await r.arrayBuffer())).getPageCount()>0);}
 const before=(await (await call('/status')).json()).balance;
 assert.equal((await call('/jobs/'+id+'/download')).status,200);
 const after=(await (await call('/status')).json()).balance;assert.deepEqual(after,before);
 const info=cleanImage(bytes,mime,false);
 checks.push({name,result:'passed',pages:pdf.getPageCount(),source_pixels:info.width*info.height,source_bytes:bytes.length,result_bytes:pdfBytes.length,balance:after});
 await writeFile(`verification/cloud/${name.startsWith('PNG')?'png':`jpeg-${info.width*info.height/1e6}mp-400pages`}.pdf`,pdfBytes);
}
await writeFile('verification/cloud/runtime-results.json',JSON.stringify({environment:'local workerd with actual D1/R2/Queue bindings; fixture identity and credits',checks},null,2));console.log(JSON.stringify(checks,null,2));
