import {getSessionUser} from '../auth.mjs';
import {boundedBytes} from '../ai/provider.mjs';
import {sightengine,moderationReady} from '../ai/moderation.mjs';
import {cleanImage} from '../cloud/image.mjs';
import {geometry} from '../../src/engine/geometry.ts';
import {posterPdf} from '../../src/engine/pdf.ts';
import {GalleryStore} from './store.mjs';
import {GalleryError,GALLERY_LIMITS,GALLERY_VERSION,CATEGORIES,galleryReady,galleryAdmin,validateSubmission,publicEntry,privateEntry,ownerKey,sha256,uuid,objectKey} from './contract.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function bodyJson(request,max=4096){try{return JSON.parse(new TextDecoder().decode(await boundedBytes(new Response(request.body),max)));}catch{throw new GalleryError('invalid_request');}}
function mediaResponse(object,mime,name,attachment=false){return new Response(object.body,{headers:{...headers,'Content-Type':mime,'Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`${attachment?'attachment':'inline'}; filename="${name}"`}});}
export function createGalleryHandler({authenticate=getSessionUser,now=()=>Date.now(),makeModerator=sightengine,render=posterPdf}={}){
 return async(request,env)=>{
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/gallery/'))return null;
  try{
   const origin=new URL(env.AUTH_ORIGIN||'https://postertiler.com').origin;if(url.origin!==origin)throw new GalleryError('invalid_origin',403);
   if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==origin)throw new GalleryError('invalid_origin',403);
   const user=await authenticate(request,env),admin=galleryAdmin(env,user),ready=galleryReady(env);
   if(url.pathname==='/api/gallery/capabilities'&&request.method==='GET')return json({enabled:ready,can_submit:ready&&moderationReady(env),admin,consent:GALLERY_VERSION});
   if(!ready)throw new GalleryError('gallery_unavailable',503);
   const store=new GalleryStore(env.GALLERY_DB,now),path=url.pathname.slice('/api/gallery'.length);
   const page=Number(url.searchParams.get('page')||0);if(!Number.isInteger(page)||page<0||page>1000)throw new GalleryError('invalid_page');
   if(path==='/items'&&request.method==='GET'){
    const category=url.searchParams.get('category'),kind=url.searchParams.get('kind');if(category&&!CATEGORIES.includes(category)||kind&&!['artwork','printed'].includes(kind))throw new GalleryError('invalid_filter');
    const result=await store.list({status:'approved',page,category,kind});return json({items:result.rows.map(publicEntry),more:result.more});
   }
   const publicMatch=path.match(/^\/items\/([0-9a-f-]{36})(?:\/(media\/(preview|source|photo)|pdf|report))?$/i);
   if(publicMatch&&uuid(publicMatch[1])){
    const row=await store.find(publicMatch[1]);if(!row||row.status!=='approved')throw new GalleryError('not_found',404);
    if(!publicMatch[2]&&request.method==='GET')return json({item:publicEntry(row)});
    if(publicMatch[2]==='report'&&request.method==='POST'){
     if(!user)throw new GalleryError('sign_in_required',401);const b=await bodyJson(request);if(!['copyright','privacy','unsafe','other'].includes(b.reason)||typeof b.detail!=='string'||b.detail.length>1000)throw new GalleryError('invalid_report');
     await store.report(row,await ownerKey(user),b.reason,b.detail.trim());return json({received:true});
    }
    if(request.method!=='GET')throw new GalleryError('method_not_allowed',405);
    const asset=publicMatch[2]==='pdf'?'pdf':publicMatch[3]==='photo'||publicMatch[3]==='preview'&&row.kind==='printed'?'photo':'source';
    if(asset==='pdf'&&(!row.allow_pdf||!row.pdf_ready)||asset==='photo'&&!row.photo_ready||publicMatch[3]==='source'&&!row.allow_remix)throw new GalleryError('not_found',404);
    const object=await env.GALLERY_FILES.get(objectKey(row.id,asset));if(!object)throw new GalleryError('not_found',404);
    return mediaResponse(object,asset==='pdf'?'application/pdf':'image/jpeg',`postertiler-${row.id}.${asset==='pdf'?'pdf':'jpg'}`,asset==='pdf'||publicMatch[3]==='source');
   }
   if(!user)throw new GalleryError('sign_in_required',401);const owner=await ownerKey(user);
   if(path==='/submissions'&&request.method==='GET'){const result=await store.list({owner,page});return json({items:result.rows.map(privateEntry),more:result.more});}
   if(path==='/submissions'&&request.method==='POST'){
    if(!moderationReady(env))throw new GalleryError('moderation_unavailable',503);
    if(!request.headers.get('Content-Type')?.startsWith('multipart/form-data'))throw new GalleryError('invalid_content_type',415);
    const n=Number(request.headers.get('Content-Length'));if(n>GALLERY_LIMITS.bodyBytes)throw new GalleryError('file_too_large',413);
    let form;try{const bytes=await boundedBytes(new Response(request.body),GALLERY_LIMITS.bodyBytes);form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type')}}).formData();}catch{throw new GalleryError('invalid_upload',413);}
    if([...form.keys()].some(k=>!['submission','source','photo'].includes(k))||form.getAll('submission').length!==1||form.getAll('source').length!==1||form.getAll('photo').length>1)throw new GalleryError('invalid_upload');
    let input;try{input=JSON.parse(form.get('submission'));}catch{throw new GalleryError('invalid_submission');}const body=validateSubmission(input);
    const image=async(key,hash)=>{const file=form.get(key);if(!(file instanceof Blob)||file.type!=='image/jpeg'||file.size>GALLERY_LIMITS.imageBytes||!file.size)throw new GalleryError('invalid_image');const bytes=new Uint8Array(await file.arrayBuffer());if(await sha256(bytes)!==hash)throw new GalleryError('source_mismatch');try{const image=cleanImage(bytes,'image/jpeg',true,{jpegPixels:GALLERY_LIMITS.pixels,dimension:GALLERY_LIMITS.dimension});if(image.orientation!==1)throw new Error();return image;}catch{throw new GalleryError('invalid_image');}};
    const source=await image('source',body.source_hash),photo=body.kind==='printed'?await image('photo',body.photo_hash):null;if(!photo&&form.has('photo'))throw new GalleryError('invalid_upload');
    body.settings.imageRatio=source.width/source.height;if(geometry(body.settings).error)throw new GalleryError('invalid_settings');
    const fingerprint=await sha256(new TextEncoder().encode(JSON.stringify(body)));let row=await store.request(owner,body.request_id);
    if(row){if(row.fingerprint!==fingerprint)throw new GalleryError('request_conflict',409);return json({item:privateEntry(row)},200);}
    row=await store.create(owner,body,fingerprint);if(!row)throw new GalleryError('submission_limit',429);if(!row._created){if(row.fingerprint!==fingerprint)throw new GalleryError('request_conflict',409);return json({item:privateEntry(row)});}
    try{
     await env.GALLERY_FILES.put(objectKey(row.id,'source'),source.bytes,{httpMetadata:{contentType:'image/jpeg'}});
     if(photo)await env.GALLERY_FILES.put(objectKey(row.id,'photo'),photo.bytes,{httpMetadata:{contentType:'image/jpeg'}});
     const moderator=makeModerator(env);await moderator.prompt([body.title,body.author,body.description].join('\n'));await moderator.image(source.bytes,'image/jpeg','source');if(photo)await moderator.image(photo.bytes,'image/jpeg','source');
     const saved=await store.change(row.id,'checking','pending',{safety_passed:1,source_ready:1,photo_ready:Number(!!photo),width:source.width,height:source.height});if(!saved)await env.GALLERY_FILES.delete([objectKey(row.id,'source'),objectKey(row.id,'photo')]);
    }catch(e){const blocked=['moderation_prompt_blocked','moderation_source_blocked','moderation_output_blocked'].includes(e.code);await store.change(row.id,'checking',blocked?'rejected':'review_error',{error_code:blocked?'content_blocked':'checks_unavailable'});await env.GALLERY_FILES.delete([objectKey(row.id,'source'),objectKey(row.id,'photo')]).catch(()=>{});}
    return json({item:privateEntry(await store.find(row.id))},201);
   }
   const ownMatch=path.match(/^\/submissions\/([0-9a-f-]{36})(?:\/(withdraw|media\/(source|photo)))?$/i);
   if(ownMatch&&uuid(ownMatch[1])){
    const row=await store.find(ownMatch[1]);if(!row||row.owner!==owner)throw new GalleryError('not_found',404);
    if(ownMatch[2]==='withdraw'&&request.method==='POST'){
     if(row.status!=='withdrawn')await env.GALLERY_DB.prepare("UPDATE gallery_entries SET status='withdrawn',pdf_ready=0,updated_at=? WHERE id=? AND owner=?").bind(now(),row.id,owner).run();await store.audit(row.id,owner,'withdraw');return json({item:privateEntry(await store.find(row.id))});
    }
    if(ownMatch[3]&&request.method==='GET'&&['pending','approving','approved'].includes(row.status)){const object=await env.GALLERY_FILES.get(objectKey(row.id,ownMatch[3]));if(!object)throw new GalleryError('not_found',404);return mediaResponse(object,'image/jpeg','submission.jpg');}
   }
   if(!path.startsWith('/admin'))throw new GalleryError('not_found',404);if(!admin)throw new GalleryError('forbidden',403);
   if(path==='/admin/submissions'&&request.method==='GET'){const status=url.searchParams.get('status')||'pending';if(!['pending','approved','rejected','review_error','checking','all'].includes(status))throw new GalleryError('invalid_filter');const result=await store.list({status,page});return json({items:result.rows.map(privateEntry),more:result.more});}
   if(path==='/admin/reports'&&request.method==='GET'){const result=await env.GALLERY_DB.prepare("SELECT id,entry_id,reason,detail,created_at FROM gallery_reports WHERE status='open' ORDER BY created_at DESC LIMIT 100").all();return json({reports:result.results});}
   const reportMatch=path.match(/^\/admin\/reports\/([0-9a-f-]{36})\/resolve$/i);
   if(reportMatch&&uuid(reportMatch[1])&&request.method==='POST'){const b=await bodyJson(request);if(typeof b.note!=='string'||b.note.trim().length<3||b.note.length>500)throw new GalleryError('review_note_required');const report=await env.GALLERY_DB.prepare('SELECT * FROM gallery_reports WHERE id=?').bind(reportMatch[1]).first();if(!report)throw new GalleryError('not_found',404);await env.GALLERY_DB.prepare("UPDATE gallery_reports SET status='resolved' WHERE id=?").bind(report.id).run();await store.audit(report.entry_id,owner,'report_resolved',b.note.trim());return json({resolved:true});}
   const match=path.match(/^\/admin\/submissions\/([0-9a-f-]{36})\/(approve|reject|media\/(source|photo))$/i);
   if(!match||!uuid(match[1]))throw new GalleryError('not_found',404);const row=await store.find(match[1]);if(!row)throw new GalleryError('not_found',404);
   if(match[3]&&request.method==='GET'&&['pending','approved','approving'].includes(row.status)){const object=await env.GALLERY_FILES.get(objectKey(row.id,match[3]));if(!object)throw new GalleryError('not_found',404);return mediaResponse(object,'image/jpeg','review.jpg');}
   if(request.method!=='POST')throw new GalleryError('method_not_allowed',405);const b=await bodyJson(request);if(typeof b.note!=='string'||b.note.trim().length<3||b.note.length>500)throw new GalleryError('review_note_required');
   if(match[2]==='reject'){
    if(!['pending','approved'].includes(row.status))throw new GalleryError('review_conflict',409);
    if(!await store.change(row.id,row.status,'rejected',{review_note:b.note.trim(),pdf_ready:0}))throw new GalleryError('review_conflict',409);
    await store.audit(row.id,owner,'reject',b.note.trim());await env.GALLERY_DB.prepare("UPDATE gallery_reports SET status='resolved' WHERE entry_id=? AND status='open'").bind(row.id).run();return json({item:privateEntry(await store.find(row.id))});
   }
   if(b.reviewed_rights!==true||!row.safety_passed||!row.source_ready||row.status!=='pending')throw new GalleryError('review_not_ready',409);
   if(!await store.change(row.id,'pending','approving'))throw new GalleryError('review_conflict',409);
   try{
    if(row.allow_pdf){const object=await env.GALLERY_FILES.get(objectKey(row.id,'source'));if(!object)throw new GalleryError('source_missing');const image=cleanImage(new Uint8Array(await object.arrayBuffer()),'image/jpeg');const result=await render(image.bytes,JSON.parse(row.settings_json),()=>{},'jpeg',{pageLimit:100,orientation:image.orientation});if(result.length>24*1024*1024)throw new GalleryError('pdf_too_large');await env.GALLERY_FILES.put(objectKey(row.id,'pdf'),result,{httpMetadata:{contentType:'application/pdf'}});}
    if(!await store.change(row.id,'approving','approved',{pdf_ready:Number(!!row.allow_pdf),error_code:null,approved_at:now(),review_note:b.note.trim()}))throw new GalleryError('review_conflict',409);
    await store.audit(row.id,owner,'approve',b.note.trim());return json({item:privateEntry(await store.find(row.id))});
   }catch(e){await store.change(row.id,'approving','pending',{error_code:'publish_failed'});const fresh=await store.find(row.id);if(fresh&&['withdrawn','rejected'].includes(fresh.status))await env.GALLERY_FILES.delete(objectKey(row.id,'pdf')).catch(()=>{});throw new GalleryError(e.code||'publish_failed',503);}
  }catch(e){return json({error:e instanceof GalleryError?e.code:'temporarily_unavailable'},e instanceof GalleryError?e.status:503);}
 };
}
export const handleGallery=createGalleryHandler();
export async function maintainGallery(env,{now=()=>Date.now()}={}){
 if(!galleryReady(env))return;const store=new GalleryStore(env.GALLERY_DB,now);
 await env.GALLERY_DB.prepare("UPDATE gallery_entries SET status='review_error',error_code='checks_interrupted',updated_at=? WHERE status='checking' AND updated_at<?").bind(now(),now()-600000).run();
 await env.GALLERY_DB.prepare("UPDATE gallery_entries SET status='pending',error_code='publish_interrupted',updated_at=? WHERE status='approving' AND updated_at<?").bind(now(),now()-600000).run();
 await env.GALLERY_DB.prepare("UPDATE gallery_entries SET status='withdrawn',updated_at=? WHERE status='pending' AND created_at<?").bind(now(),now()-30*86400000).run();
 const rows=(await env.GALLERY_DB.prepare("SELECT * FROM gallery_entries WHERE cleaned_at IS NULL AND (status='withdrawn' OR (status IN ('rejected','review_error') AND updated_at<?)) LIMIT 50").bind(now()-7*86400000).all()).results;
 await env.GALLERY_DB.prepare("DELETE FROM gallery_audit WHERE created_at<?").bind(now()-90*86400000).run();
 await env.GALLERY_DB.prepare("DELETE FROM gallery_reports WHERE status='resolved' AND created_at<?").bind(now()-90*86400000).run();
 await env.GALLERY_DB.prepare("DELETE FROM gallery_entries WHERE cleaned_at IS NOT NULL AND updated_at<? AND status IN ('rejected','withdrawn','review_error')").bind(now()-90*86400000).run();
 for(const row of rows){await env.GALLERY_FILES.delete(['source','photo','pdf'].map(k=>objectKey(row.id,k)));await store.change(row.id,row.status,row.status,{cleaned_at:now(),source_ready:0,photo_ready:0,pdf_ready:0});}
}
