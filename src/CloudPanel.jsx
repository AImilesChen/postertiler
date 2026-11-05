import React,{useEffect,useRef,useState} from 'react';
import { Alert,B } from './ui';
import { DEFAULTS,geometry,sizeText } from './engine/geometry.ts';
import { cleanImage } from '../server/cloud/image.mjs';
const API='/api/cloud/test';
const messages={insufficient_credits:'You need an available test credit. Use the Stripe sandbox checkout above.',task_limit:'Finish or cancel your current task before starting another one. Please wait if you have made many attempts.',invalid_image:'This image could not be read. Re-save it as a standard JPG or PNG.',unsupported_png:'Use an 8-bit, non-interlaced PNG, or save the image as JPG.',unsupported_color:'This version accepts RGB or grayscale JPG. Convert CMYK images to RGB first.',animated_image:'Animated PNG is not supported. Save a still image first.',source_mismatch:'The upload was incomplete or changed. Choose the original file again.',image_too_large:'This image exceeds the cloud pixel limit. Use a smaller image.',file_too_large:'The file exceeds the cloud file-size limit.',invalid_settings:'Check the paper, margins, overlap and poster size.',processing_failed:'Processing failed. Your credit has been released. You can retry.',processing_timeout:'Processing timed out. Your credit has been released. You can retry.',upload_timeout:'The upload window expired. Your credit has been released. Start a new task.',credit_revoked:'A payment refund removed the reserved credit. No additional credit was used.',retry_unavailable:'Retry is not available. Check your available credits and the file expiry.',source_missing:'The source file is no longer available. No credit was used.',result_expired:'This result has expired. Keep a local copy of every downloaded PDF.'};
const message=code=>messages[code]||'The cloud service is temporarily unavailable. Refresh the task list before trying again.';
async function api(path,init={}) {const response=await fetch(API+path,{credentials:'same-origin',...init});let data;try{data=await response.json();}catch{throw new Error('cloud_unavailable');}if(!response.ok)throw new Error(data.error);return data;}
export default function CloudPanel() {
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[file,setFile]=useState(null),[consent,setConsent]=useState(false),[settings,setSettings]=useState({...DEFAULTS});
 const attempt=useRef(null),alive=useRef(true),controller=useRef(null),selection=useRef(0);
 const g=geometry(settings,400);
 const refresh=async()=>{const result=await api('/status');if(alive.current)setData(result);};
 useEffect(()=>{
   alive.current=true;
   try{const pending=sessionStorage.getItem('postertiler-cloud-settings');if(pending){setSettings({...DEFAULTS,...JSON.parse(pending)});sessionStorage.removeItem('postertiler-cloud-settings');}}catch{}
   const load=()=>refresh().catch(e=>{if(alive.current&&e.message!=='cloud_unavailable')setError(message(e.message));});
   load();const timer=setInterval(load,4000);window.addEventListener('billing-updated',load);
   return()=>{alive.current=false;clearInterval(timer);window.removeEventListener('billing-updated',load);controller.current?.abort();};
 },[]);
 function change(key,value){setSettings(s=>({...s,[key]:value}));attempt.current=null;setNotice('');}
 async function selectFile(value) {
   const id=++selection.current;setFile(null);attempt.current=null;setConsent(false);setError('');
   if(!value)return;setBusy(true);
   try{const type=value.type || (/\.png$/i.test(value.name)?'image/png':'image/jpeg'),limit=type==='image/png'?data.limits.pngBytes:data.limits.jpegBytes;
     if(value.size>limit)throw new Error('file_too_large');
     const image=cleanImage(new Uint8Array(await value.arrayBuffer()),type,false);
     if(alive.current&&id===selection.current){setFile(value);setSettings(s=>({...s,imageRatio:image.width/image.height}));}
   }catch(e){if(alive.current&&id===selection.current)setError(message(e.code||e.message));}
   finally{if(alive.current&&id===selection.current)setBusy(false);}
 }
 async function start() {
   if(!file||!consent||busy||g.error)return;setBusy(true);setError('');setNotice('Checking the file…');
   controller.current=new AbortController();const signal=controller.current.signal;
   try {
     const type=file.type || (/\.png$/i.test(file.name)?'image/png':'image/jpeg'),limit=type==='image/png'?data.limits.pngBytes:data.limits.jpegBytes;
     if(!['image/jpeg','image/png'].includes(type))throw new Error('invalid_image');if(file.size>limit)throw new Error('file_too_large');
     if(!attempt.current){const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());attempt.current={request_id:crypto.randomUUID(),source_hash:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),source_size:file.size,source_type:type,settings,upload_consent:true};}
     const created=await api('/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(attempt.current),signal});
     if(created.job.can_upload){setNotice('Uploading to private cloud storage…');await api(`/jobs/${created.job.id}/source`,{method:'PUT',headers:{'Content-Type':type},body:file,signal});}
     setNotice(created.job.status==='succeeded'?'Your existing result is ready. Downloading it again uses no credit.':'Task saved. You can leave this page and return to your account.');
     await refresh();window.dispatchEvent(new Event('cloud-updated'));
   }catch(e){if(alive.current){setError(e.name==='AbortError'?'Upload stopped in this browser. Check the task below; cancel it to release its credit, or select the same file and resume.':message(e.message));await refresh().catch(()=>{});}}
   finally{if(alive.current)setBusy(false);}
 }
 async function action(id,name){setBusy(true);setError('');try{await api(`/jobs/${id}/${name}`,{method:'POST'});await refresh();window.dispatchEvent(new Event('cloud-updated'));}catch(e){setError(message(e.message));}finally{if(alive.current)setBusy(false);}}
 if(!data?.enabled)return error?<Alert tone="error">{error}</Alert>:null;
 const numeric=(key,label,min,max)=><label>{label}<input type="number" min={min} max={max} step={key==='rows'||key==='columns'?1:'any'} value={settings[key]} onChange={e=>change(key,Number(e.target.value))}/></label>;
 return <section className="cloud-panel" id="cloud-processing" aria-label="Cloud PDF processing" data-clarity-mask="true">
   <span className="auth-label">CLOUD PROCESSING · SANDBOX</span><h2>A PDF made in the cloud</h2><p>Real server processing with test credits. No real money is charged. Free local exports remain available.</p>
   <dl className="cloud-balance"><div><dt>Available</dt><dd>{data.balance.available}</dd></div><div><dt>Reserved</dt><dd>{data.balance.reserved}</dd></div><div><dt>Used</dt><dd>{data.balance.used}</dd></div></dl>
   <p className="micro">One credit is reserved when you start. A successful PDF uses it once. Failure or cancellation releases it. Download the same result again at no extra cost.</p>
   <form onSubmit={e=>{e.preventDefault();start();}}>
     <label>Source image<input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={e=>selectFile(e.target.files?.[0]||null)}/></label>
     <p className="micro">JPG: up to 20 MiB and 100 MP. PNG: up to 8 MiB and 4 MP, 8-bit and non-interlaced. Maximum 400 poster sheets; RGB or grayscale JPG. WebP and professional PDF processing are not included in this release.</p>
     <div className="cloud-fields">
       <label>Paper<select value={settings.paper} onChange={e=>change('paper',e.target.value)}>{['A4','US Letter','A3'].map(p=><option key={p}>{p}</option>)}</select></label>
       <label>Orientation<select value={settings.orientation} onChange={e=>change('orientation',e.target.value)}>{['Portrait','Landscape','Automatic'].map(p=><option key={p}>{p}</option>)}</select></label>
       <label>Size mode<select value={settings.mode} onChange={e=>change('mode',e.target.value)}><option value="sheets">By sheet count</option><option value="exact">Exact size (mm)</option></select></label>
       <label>Image placement<select value={settings.placement} onChange={e=>change('placement',e.target.value)}><option value="fit">Fit</option><option value="fill">Fill</option></select></label>
       {settings.mode==='sheets'?<>{numeric('columns','Sheets across',1,400)}{numeric('rows','Sheets down',1,400)}</>:<>{numeric('width','Finished width (mm)',1,30000)}{numeric('height','Finished height (mm)',1,30000)}</>}
       {numeric('margin','Printer margin (mm)',0,200)}{numeric('overlap','Overlap (mm)',0,200)}
     </div>
     {(settings.separateMargins||settings.layoutMode==='framed')&&<p className="micro">Your editor’s separate margins or Framed Grid settings have been retained. Return to the editor to adjust those settings.</p>}
     <label className="cloud-check"><input type="checkbox" checked={settings.labels} onChange={e=>change('labels',e.target.checked)}/>Print sheet labels in a separate 5 mm guide band</label>
     <label className="cloud-check"><input type="checkbox" checked={settings.cutGuides} onChange={e=>change('cutGuides',e.target.checked)}/>Add cut guides</label>
     {g.error?<Alert tone="error">{g.error}</Alert>:<p><strong>{g.count} sheets · {sizeText(g,settings.unit)}</strong><br/><span className="micro">Print at Actual Size / 100%. Turn off Fit to page.</span></p>}
     <label className="cloud-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I agree to upload this image to Cloudflare for this task. Files are private; access ends 24 hours after task creation. Automatic deletion normally follows within 5 minutes, with retries during outages. Order and credit records are kept separately.</label>
     <p className="micro">Only upload files you have permission to use. A changed image or settings creates a new task. Save your PDF before it expires.</p>
     <div className="auth-actions"><B type="submit" disabled={busy||!file||!consent||!!g.error||(data.balance.available<1&&!data.jobs.some(j=>j.can_upload))}>{busy?'Working…':'Generate cloud PDF · 1 test credit'}</B>{busy&&controller.current&&<B type="button" secondary onClick={()=>controller.current?.abort()}>Stop upload</B>}</div>
   </form>
   <div aria-live="polite">{notice&&<Alert>{notice}</Alert>}{error&&<Alert tone="error">{error}</Alert>}</div>
   <div className="cloud-jobs"><h3>Your cloud tasks</h3><B secondary disabled={busy} onClick={()=>refresh().catch(e=>setError(message(e.message)))}>Refresh tasks</B>
     {!data.jobs.length&&<p>No cloud tasks yet.</p>}
     {data.jobs.map(job=><article key={job.id} className="cloud-job"><strong>{job.page_count} poster sheets</strong><span className="cloud-job-state">{job.status.replaceAll('_',' ')} · credit {job.credit_state}</span>
       {job.error&&<p role="status">{message(job.error)}</p>}
       {job.can_download&&<><p className="micro">Download before {new Date(job.expires_at).toLocaleString()}. Repeat downloads use no additional credit.</p><a className="button" href={`${API}/jobs/${job.id}/download`}>Download PDF</a><div className="download-links"><a href={`${API}/jobs/${job.id}/assembly`}>Assembly guide</a><a href={`${API}/jobs/${job.id}/calibration`}>Calibration page</a></div></>}
       {['awaiting_upload','queued','processing'].includes(job.status)&&<B secondary disabled={busy} onClick={()=>action(job.id,'cancel')}>Cancel task · release credit</B>}
       {job.can_retry&&<B secondary disabled={busy} onClick={()=>action(job.id,'retry')}>Retry · reserve 1 credit</B>}
     </article>)}
   </div>
 </section>;
}
