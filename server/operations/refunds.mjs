import {OpsError,ownerKey,text,uuid,sha256,q,rows,listing} from './core.mjs';
import {REFUND_STATES} from '../../src/operations-contract.js';
export const REFUND_POLICY='refund-v1-2026-11-08';
const dbOf=env=>{if(!env.BILLING_TEST_DB?.prepare)throw new OpsError('billing_unavailable',503);return env.BILLING_TEST_DB;};
const sql=(env,s,...v)=>dbOf(env).prepare(s).bind(...v);
const all=async(env,s,...v)=>(await sql(env,s,...v).all()).results;
const table=kind=>{if(!['cloud','ai'].includes(kind))throw new OpsError('invalid_order');return kind==='ai'?'ai_test_orders':'billing_test_orders';};
const stripeUrl=o=>/^pi_[A-Za-z0-9]+$/.test(o.payment_intent_id||'')?'https://dashboard.stripe.com/test/payments/'+o.payment_intent_id:null;
export async function importLegacyRefunds(env){
 if(await sql(env,"SELECT value FROM billing_refund_meta WHERE key='legacy_imported'").first())return;
 const old=await rows(env,'SELECT * FROM ops_refund_requests');
 for(const r of old)await sql(env,`INSERT OR IGNORE INTO billing_refund_reviews(id,user_key,mode,kind,order_id,requested_amount,reason,status,internal_note,response,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,r.id,r.user_key,r.mode,r.kind,r.order_id,r.requested_amount,r.reason,r.status==='approved'?'reviewing':r.status,r.internal_note,r.response,r.revision,r.created_at,r.updated_at).run();
 // Only copy recorded, verified payment facts; never infer a payment date from order creation.
 for(const f of await rows(env,"SELECT * FROM ops_payment_facts WHERE mode='test'"))if(['ai','cloud'].includes(f.kind))await sql(env,`UPDATE ${table(f.kind)} SET paid_at=? WHERE id=? AND paid=1 AND paid_at IS NULL`,f.paid_at,f.order_id).run();
 await sql(env,"INSERT OR IGNORE INTO billing_refund_meta VALUES('legacy_imported',?)",String(Date.now())).run();
}
export async function refundQuote(env,kind,id,request=null){
 if(!uuid(id))throw new OpsError('invalid_order');table(kind);
 const order=await sql(env,'SELECT * FROM billing_refund_orders WHERE kind=? AND id=?',kind,id).first();if(!order)throw new OpsError('not_found',404);
 const allocation=await sql(env,'SELECT * FROM billing_credit_available WHERE kind=? AND id=?',kind,id).first();
 const counts=await sql(env,"SELECT COALESCE(SUM(CASE WHEN state='consumed' THEN units ELSE 0 END),0) used,COALESCE(SUM(CASE WHEN state='held' THEN units ELSE 0 END),0) held,COALESCE(SUM(CASE WHEN legacy=1 AND state IN ('consumed','held') THEN units ELSE 0 END),0) legacy FROM billing_credit_allocations WHERE kind=? AND order_id=?",kind,id).first();
 const jobTable=kind==='ai'?'ai_test_jobs':'cloud_test_jobs',unit=kind==='ai'?'credits':'1',used=kind==='ai'?'charged=1':"credit_state='consumed'",held=kind==='ai'?"charged=0 AND status IN ('awaiting_upload','queued','submitting','processing')":"credit_state='held'";
 const total=await sql(env,`SELECT COALESCE(SUM(${unit}),0) n FROM ${jobTable} WHERE user_key=? AND ((${used}) OR (${held}))`,order.user_key).first();
 const assigned=await sql(env,"SELECT COALESCE(SUM(units),0) n FROM billing_credit_allocations WHERE kind=? AND state IN ('held','consumed') AND order_id IN(SELECT id FROM billing_refund_orders WHERE kind=? AND user_key=?)",kind,kind,order.user_key).first();
 const granted=await sql(env,'SELECT COALESCE(SUM(credits-refunded_credits),0) n FROM billing_refund_orders WHERE kind=? AND user_key=? AND paid=1',kind,order.user_key).first();
 const at=request?.created_at||Date.now(),remaining=Math.max(0,order.amount-order.refunded_amount),free=allocation?.free||0;
 const paidAt=order.paid_at||null,within=paidAt===null?null:at>=paidAt&&at<=paidAt+14*86400000;
 const gap=Math.max(0,total.n-assigned.n),debt=Math.max(0,total.n-granted.n);
 const covered=!!request?.approved_amount&&order.refunded_amount>=request.baseline_refunded+request.approved_amount;
 const warnings=[];if(paidAt===null)warnings.push('payment_date_unknown');if(within===false)warnings.push('outside_voluntary_window');if(counts.legacy)warnings.push('legacy_fifo_reconstruction');if(gap)warnings.push('allocation_gap');if(debt)warnings.push('credit_debt');if(counts.held)warnings.push('active_task_credits_excluded');if(request?.status==='approved'&&!covered)warnings.push('approved_refund_pending');
 const proportional=Math.min(remaining,Math.round(order.amount*free/order.credits));
 const suggested=order.paid&&!gap&&!debt&&within!==false?proportional:0;
 const value={policy_version:REFUND_POLICY,kind,order_id:id,order_amount:order.amount,remaining_amount:remaining,refunded_amount:order.refunded_amount,purchased_credits:order.credits,refunded_credits:order.refunded_credits,used_credits:counts.used,task_reserved_credits:counts.held,refund_reserved_credits:allocation?.refund_held||0,unused_credits:free,paid_at:paidAt,requested_at:at,voluntary_deadline:paidAt===null?null:paidAt+14*86400000,within_window:within,proportional_amount:proportional,suggested_amount:suggested,manual_review:within!==true||!!gap||!!debt,allocation_gap:gap,credit_debt:debt,legacy:!!counts.legacy,warnings,approval_covered:covered,currency:'usd'};
 return {...value,quote_token:await sha256(JSON.stringify(value)),stripe_url:stripeUrl(order),order};
}
const publicQuote=({order,stripe_url,...value})=>value;
export async function quoteForOrder(env,kind,id){return publicQuote(await refundQuote(env,kind,id));}
export async function requestRefund(env,user,b){
 if(b.mode!=='test')throw new OpsError('unsupported_payment_mode');await importLegacyRefunds(env);
 const owner=await ownerKey(user),reason=text(b.reason,2000,10),quote=await refundQuote(env,b.kind,b.order_id);
 if(quote.order.user_key!==owner)throw new OpsError('not_found',404);
 if(!quote.order.paid||quote.remaining_amount<=0)throw new OpsError('order_not_refundable',409);
 const id=crypto.randomUUID(),n=Date.now();
 await sql(env,`INSERT OR IGNORE INTO billing_refund_reviews(id,user_key,kind,order_id,requested_amount,reason,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,id,owner,b.kind,b.order_id,quote.suggested_amount,reason,n,n).run();
 const saved=await sql(env,"SELECT * FROM billing_refund_reviews WHERE mode='test' AND kind=? AND order_id=?",b.kind,b.order_id).first();
 // Notifications are secondary. A support-outbox outage must not lose a financial review record.
 try{await q(env,'INSERT OR IGNORE INTO ops_outbox(id,kind,target,created_at) VALUES(?,?,?,?)','refund:'+b.kind+':'+b.order_id,'refund',saved.id,n).run();}catch{}
 return {id:saved.id,saved:true};
}
export async function refundList(env,params,owner=null){
 await importLegacyRefunds(env);const args=owner?[owner]:[],where=owner?' WHERE user_key=?':'';
 const data=await listing({...env,GALLERY_DB:dbOf(env)},'SELECT * FROM billing_refund_reviews'+where+' ORDER BY created_at DESC',args,params);
 return {...data,items:await Promise.all(data.items.map(async r=>{const quote=await refundQuote(env,r.kind,r.order_id,r);const {internal_note,decision_reason,quote_json,last_mutation,...safe}=r;return {...(owner?safe:r),quote:publicQuote(quote),payment_status:quote.order.status,refunded_amount:quote.refunded_amount,order_amount:quote.order_amount,...(!owner?{stripe_url:quote.stripe_url,audit:await all(env,'SELECT action,details,created_at FROM billing_refund_audit WHERE target=? ORDER BY created_at DESC LIMIT 20',r.id)}:{})};}))};
}
export async function updateRefund(env,user,id,b){
 if(!uuid(id)||!REFUND_STATES.includes(b.status)||!Number.isInteger(b.revision))throw new OpsError('invalid_refund');
 const item=await sql(env,'SELECT * FROM billing_refund_reviews WHERE id=?',id).first();if(!item)throw new OpsError('not_found',404);
 if(item.revision!==b.revision)throw new OpsError('revision_conflict',409);
 const note=text(b.internal_note,3000),response=text(b.response,3000),quote=await refundQuote(env,item.kind,item.order_id,item),n=Date.now(),token=crypto.randomUUID();
 let amount=item.approved_amount,units=item.approved_units,hold=item.hold_units,baseline=item.baseline_refunded,baselineCredits=item.baseline_credits,decision=item.decision_reason;
 const newApproval=b.status==='approved'&&item.status!=='approved';
 if(newApproval){
  if(b.quote_token!==quote.quote_token)throw new OpsError('refund_quote_changed',409);
  amount=b.approved_amount;if(!Number.isSafeInteger(amount)||amount<=0||amount>quote.remaining_amount)throw new OpsError('invalid_refund_amount');
  decision=text(b.decision_reason||'',1000);
  if((quote.manual_review||amount>quote.suggested_amount)&&(!(b.manual_override===true)||decision.length<10))throw new OpsError('refund_exception_reason_required');
  if(!quote.order.paid)throw new OpsError('order_not_refundable',409);
  baseline=quote.refunded_amount;baselineCredits=quote.refunded_credits;
  const cumulative=Math.min(quote.purchased_credits,Math.max(0,Math.ceil(((baseline+amount)-.5)*quote.purchased_credits/quote.order_amount)));
  units=Math.max(0,cumulative-baselineCredits);hold=Math.min(quote.unused_credits,units);
 }else if(b.status!=='approved'){if(item.status==='approved'&&!quote.approval_covered&&b.release_hold!==true)throw new OpsError('refund_release_confirmation_required');hold=0;}
 const details=JSON.stringify({status:b.status,approved_amount:amount,approved_units:units,held_units:hold,manual_override:newApproval&&b.manual_override===true,policy_version:REFUND_POLICY});
 const paymentGuard=' AND hold_units=? AND EXISTS(SELECT 1 FROM billing_refund_orders WHERE kind=? AND id=? AND refunded_amount=? AND refunded_credits=?)';
 const guard=newApproval?' AND EXISTS(SELECT 1 FROM billing_credit_available WHERE kind=? AND id=? AND free=? AND refunded_amount=? AND consumed=? AND task_held=?)':'';
 const update=sql(env,`UPDATE billing_refund_reviews SET status=?,internal_note=?,response=?,approved_amount=?,approved_units=?,hold_units=?,baseline_refunded=?,baseline_credits=?,quote_json=?,decision_reason=?,last_mutation=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?${paymentGuard}${guard}`,b.status,note,response,amount,units,hold,baseline,baselineCredits,JSON.stringify(publicQuote(quote)),decision,token,n,id,b.revision,item.hold_units,item.kind,item.order_id,quote.refunded_amount,quote.refunded_credits,...(newApproval?[item.kind,item.order_id,quote.unused_credits,quote.refunded_amount,quote.used_credits,quote.task_reserved_credits]:[]));
 const result=await dbOf(env).batch([update,sql(env,'INSERT INTO billing_refund_audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM billing_refund_reviews WHERE id=? AND last_mutation=?)',token,await ownerKey(user),'refund.review',id,details,n,id,token)]);
 if(!result[0].meta.changes)throw new OpsError('refund_quote_changed',409);
 try{await q(env,'INSERT OR IGNORE INTO ops_audit VALUES(?,?,?,?,?,?)',token,await ownerKey(user),'refund.review',id,details,n).run();}catch{}
 return {saved:true};
}
