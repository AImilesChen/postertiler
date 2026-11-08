import {validateSettings,ownerKey,sha256,uuid} from '../cloud/contract.mjs';
import {geometry,sizeText} from '../../src/engine/geometry.ts';
export {ownerKey,sha256,uuid};
export const GALLERY_VERSION='gallery-publish-v1';
export const GALLERY_LIMITS={imageBytes:8*1024*1024,bodyBytes:17*1024*1024,pixels:8_000_000,dimension:6000,daily:5,pending:3,pages:100};
export const CATEGORIES=['Art','Landscape','Maps','Events','People','Education'];
export class GalleryError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
export const galleryReady=env=>env.GALLERY_ENABLED==='true'&&!!env.GALLERY_DB?.prepare&&!!env.GALLERY_FILES?.put;
export const galleryAdmin=(env,user)=>!!user&&user.email_verified!==false&&(env.GALLERY_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
const text=(v,max,min=0)=>{if(typeof v!=='string'||v.length>max||v.trim().length<min||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw new GalleryError('invalid_submission');return v.trim();};
export function validateSubmission(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['request_id','title','author','description','category','kind','allow_remix','allow_pdf','settings','consent','rights','source_hash','photo_hash'].includes(k)))throw new GalleryError('invalid_submission');
 if(!uuid(body.request_id)||body.consent!==GALLERY_VERSION||body.rights!==true)throw new GalleryError('publication_consent_required');
 if(!CATEGORIES.includes(body.category)||!['artwork','printed'].includes(body.kind)||typeof body.allow_remix!=='boolean'||typeof body.allow_pdf!=='boolean')throw new GalleryError('invalid_submission');
 if(!/^[a-f0-9]{64}$/.test(body.source_hash||'')||(body.kind==='printed'?!/^[a-f0-9]{64}$/.test(body.photo_hash||''):!!body.photo_hash))throw new GalleryError('invalid_source');
 let settings;try{settings=validateSettings(body.settings).settings;}catch{throw new GalleryError('invalid_settings');}
 if(geometry(settings).error)throw new GalleryError('invalid_settings');
 return {...body,title:text(body.title,90,3),author:text(body.author,50,1),description:text(body.description,800),settings};
}
export function publicEntry(row){
 const settings=JSON.parse(row.settings_json),g=geometry(settings);
 return {id:row.id,title:row.title,author:row.author,description:row.description,category:row.category,kind:row.kind,
  allow_remix:!!row.allow_remix,allow_pdf:!!row.allow_pdf&&!!row.pdf_ready,settings,
  width:row.width,height:row.height,size:sizeText(g,'cm'),sheet_count:g.count,
  preview_url:`/api/gallery/items/${row.id}/media/${row.kind==='printed'?'photo':'preview'}`,
  approved_at:row.approved_at};
}
export function privateEntry(row){return {...publicEntry(row),allow_pdf:!!row.allow_pdf,status:row.status,error:row.error_code,review_note:row.review_note,created_at:row.created_at,safety_passed:!!row.safety_passed,source_ready:!!row.source_ready,photo_ready:!!row.photo_ready};}
export const objectKey=(id,kind)=>`gallery/${id}/${kind}`;
