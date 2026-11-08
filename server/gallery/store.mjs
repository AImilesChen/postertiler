import {GalleryError,GALLERY_LIMITS} from './contract.mjs';
export class GalleryStore{
 constructor(db,now=()=>Date.now()){this.db=db;this.now=now;}
 async find(id){return this.db.prepare('SELECT * FROM gallery_entries WHERE id=?').bind(id).first();}
 async request(owner,id){return this.db.prepare('SELECT * FROM gallery_entries WHERE owner=? AND request_id=?').bind(owner,id).first();}
 async create(owner,body,fingerprint){
  const id=crypto.randomUUID(),now=this.now();
  await this.db.prepare(`INSERT INTO gallery_entries(id,owner,request_id,fingerprint,consent_version,rights_confirmed,title,author,description,category,kind,allow_remix,allow_pdf,settings_json,status,created_at,updated_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'checking',?,? WHERE
   (SELECT COUNT(*) FROM gallery_entries WHERE owner=? AND created_at>?)<? AND
   (SELECT COUNT(*) FROM gallery_entries WHERE owner=? AND status IN ('checking','pending','approving'))<? AND (SELECT COUNT(*) FROM gallery_entries WHERE created_at>?)<20 AND (SELECT COUNT(*) FROM gallery_entries WHERE created_at>?)<100 AND (SELECT COUNT(*) FROM gallery_entries WHERE status IN ('checking','pending','approving','approved'))<1000
   ON CONFLICT(owner,request_id) DO NOTHING`).bind(id,owner,body.request_id,fingerprint,body.consent,Number(body.rights),body.title,body.author,body.description,body.category,body.kind,Number(body.allow_remix),Number(body.allow_pdf),JSON.stringify(body.settings),now,now,owner,now-86400000,GALLERY_LIMITS.daily,owner,GALLERY_LIMITS.pending,now-86400000,now-30*86400000).run();
  const row=await this.request(owner,body.request_id);return row?{...row,_created:row.id===id}:null;
 }
 async list({owner,status,page=0,category,kind}={}){
  const terms=[],args=[];if(owner){terms.push('owner=?');args.push(owner);}if(status&&status!=='all'){terms.push('status=?');args.push(status);}if(category){terms.push('category=?');args.push(category);}if(kind){terms.push('kind=?');args.push(kind);}
  const where=terms.length?' WHERE '+terms.join(' AND '):'';
  const rows=(await this.db.prepare(`SELECT * FROM gallery_entries${where} ORDER BY created_at DESC,id LIMIT 21 OFFSET ?`).bind(...args,page*20).all()).results;
  return {rows:rows.slice(0,20),more:rows.length>20};
 }
 async change(id,from,to,extra={}){
  const allowed=['safety_passed','error_code','source_ready','photo_ready','width','height','review_note','pdf_ready','approved_at','cleaned_at'];
  const keys=Object.keys(extra);if(keys.some(k=>!allowed.includes(k)))throw new Error('invalid_update');
  const result=await this.db.prepare(`UPDATE gallery_entries SET status=?,updated_at=?${keys.map(k=>`,${k}=?`).join('')} WHERE id=? AND status=?`).bind(to,this.now(),...keys.map(k=>extra[k]),id,from).run();return !!result.meta.changes;
 }
 async audit(id,actor,action,note=''){await this.db.prepare('INSERT INTO gallery_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,actor,action,note,this.now()).run();}
 async report(row,reporter,reason,detail){
  const existing=await this.db.prepare('SELECT * FROM gallery_reports WHERE entry_id=? AND reporter=? LIMIT 1').bind(row.id,reporter).first();
  if(existing?.status==='open')return;
  const count=await this.db.prepare('SELECT COUNT(*) n FROM gallery_reports WHERE reporter=? AND created_at>?').bind(reporter,this.now()-86400000).first();
  if(count.n>=5)throw new GalleryError('report_limit',429);
  if(existing){await this.db.prepare("UPDATE gallery_reports SET status='open',reason=?,detail=?,created_at=? WHERE id=? AND status='resolved'").bind(reason,detail,this.now(),existing.id).run();return;}
  const result=await this.db.prepare(`INSERT INTO gallery_reports(id,entry_id,reporter,reason,detail,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM gallery_reports WHERE reporter=? AND created_at>?)<5 AND NOT EXISTS(SELECT 1 FROM gallery_reports WHERE entry_id=? AND reporter=?) ON CONFLICT(entry_id,reporter,status) DO NOTHING`).bind(crypto.randomUUID(),row.id,reporter,reason,detail,this.now(),reporter,this.now()-86400000,row.id,reporter).run();
  if(!result.meta.changes&&!await this.db.prepare("SELECT id FROM gallery_reports WHERE entry_id=? AND reporter=? AND status='open'").bind(row.id,reporter).first())throw new GalleryError('report_limit',429);
 }
}
