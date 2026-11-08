import {quoteForOrder} from './refunds.mjs';
import {OpsError,q,rows,listing,ownerKey,text,uuid,audit} from './core.mjs';
import {REFUND_STATES} from '../../src/operations-contract.js';
const orderSql=`SELECT 'cloud' kind,'test' mode,id,user_key,sku,amount,currency,credits,paid,status,refunded_amount,refunded_credits,created_at,updated_at,payment_intent_id FROM billing_test_orders UNION ALL SELECT 'ai' kind,'test' mode,id,user_key,sku,amount,currency,credits,paid,status,refunded_amount,refunded_credits,created_at,updated_at,payment_intent_id FROM ai_test_orders`;
const paymentDB=env=>{if(!env.BILLING_TEST_DB?.prepare)throw new OpsError('billing_unavailable',503);return env.BILLING_TEST_DB;};
export async function orderById(env,kind,id){if(!['cloud','ai'].includes(kind)||!uuid(id))throw new OpsError('invalid_order');return paymentDB(env).prepare(`SELECT *,? kind,'test' mode FROM ${kind==='ai'?'ai_test_orders':'billing_test_orders'} WHERE id=?`).bind(kind,id).first();}
const stripeUrl=row=>/^pi_[A-Za-z0-9]+$/.test(row.payment_intent_id||'')?'https://dashboard.stripe.com/test/payments/'+row.payment_intent_id:null;
export async function orderList(env,params,owner=null){
 const mode=params.get('mode')||'test';if(mode==='live')return {items:[],page:1,pages:1,total:0,available:false,reason:'live_billing_not_enabled'};if(mode!=='test')throw new OpsError('invalid_mode');
 const args=[],where=[];if(owner){where.push('user_key=?');args.push(owner);}
 const query=(params.get('q')||'').trim().slice(0,100);if(query){where.push('(id LIKE ? OR user_key=?)');args.push('%'+query.replaceAll('%','').replaceAll('_','')+'%',query);}
 const status=params.get('status');if(status&&status!=='all'){if(!['paid','pending','created','failed','expired','refunded','partially_refunded'].includes(status))throw new OpsError('invalid_status');where.push('status=?');args.push(status);}
 const sql=`SELECT * FROM (${orderSql})${where.length?' WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC`;
 const db=paymentDB(env),data=await listing({...env,GALLERY_DB:db},sql,args,params);
 const profiles=owner?[]:await rows(env,'SELECT user_key,email FROM ops_users');const names=new Map(profiles.map(p=>[p.user_key,p.email]));
 return {...data,available:true,items:await Promise.all(data.items.map(async({payment_intent_id,...r})=>({...r,email:names.get(r.user_key)||null,stripe_url:stripeUrl({payment_intent_id}),...(owner&&r.paid?{refund_quote:await quoteForOrder(env,r.kind,r.id)}:{})})))};
}
export async function paymentSummary(env,r){
 if(!env.BILLING_TEST_DB?.prepare)return {available:false,live:{available:false}};
 const db=paymentDB(env),snapshot=await db.prepare(`SELECT COUNT(*) orders,COUNT(DISTINCT CASE WHEN paid=1 THEN user_key END) payers,COALESCE(SUM(CASE WHEN paid=1 THEN amount ELSE 0 END),0) gross,COALESCE(SUM(refunded_amount),0) refunded FROM (${orderSql})`).first();
 const facts=await rows(env,"SELECT * FROM ops_payment_facts WHERE mode='test' AND paid_at>=? AND paid_at<?",r.start,r.end);
 const keys=new Set(facts.map(f=>f.kind+':'+f.order_id)),all=(await db.prepare(`SELECT * FROM (${orderSql}) WHERE paid=1`).all()).results;
 const period=all.filter(o=>keys.has(o.kind+':'+o.id));
 return {available:true,mode:'test',live:{available:false,reason:'live_billing_not_enabled'},lifetime:{...snapshot,net_after_refunds:snapshot.gross-snapshot.refunded},period:{orders:period.length,payers:new Set(period.map(o=>o.user_key)).size,gross:period.reduce((s,o)=>s+o.amount,0)},unattributed_historical_payments:all.filter(o=>!keys.has(o.kind+':'+o.id)).length,period_refunds:null,currency:'usd',note:'测试订单不代表真实收入。期间付款只统计启用后台后验证到的支付事件；历史订单的真实支付日期未补造。累计退款按订单当前快照计算；期间退款流水暂不可用。金额未扣 Stripe 手续费、税及 AI 成本。'};
}
export {requestRefund,refundList,updateRefund} from './refunds.mjs';
export async function taskReport(env,r,params){
 const db=paymentDB(env),status=params.get('status')||'all';if(!['all','failed','succeeded','completed_expired','submitting','processing','queued','expired','canceled'].includes(status))throw new OpsError('invalid_status');
 const sql=`SELECT 'cloud' kind,id,user_key,CASE WHEN status='expired' AND credit_state='consumed' THEN 'completed_expired' ELSE status END status,credit_state,0 charged,0 budget_cents,0 budget_committed,error_code,created_at,updated_at,expires_at,deadline FROM cloud_test_jobs UNION ALL SELECT json_extract(spec_json,'$.kind') kind,id,user_key,CASE WHEN status='expired' AND charged=1 THEN 'completed_expired' ELSE status END status,NULL credit_state,charged,budget_cents,budget_committed,error_code,created_at,updated_at,expires_at,created_at+1200000 deadline FROM ai_test_jobs`;
 const data=await listing({...env,GALLERY_DB:db},`SELECT * FROM (${sql}) WHERE created_at>=? AND created_at<?${status==='all'?'':' AND status=?'} ORDER BY created_at DESC`,[r.start,r.end,...(status==='all'?[]:[status])],params);
 const stats=await db.prepare(`SELECT json_extract(spec_json,'$.kind') kind,COUNT(*) jobs,SUM(CASE WHEN charged=1 THEN 1 ELSE 0 END) succeeded,SUM(charged*credits) credits_used,SUM(CASE WHEN budget_committed=1 THEN budget_cents ELSE 0 END) committed_budget_ceiling_cents FROM ai_test_jobs WHERE created_at>=? AND created_at<? GROUP BY kind`).bind(r.start,r.end).all();
 const anomalies=await db.prepare(`SELECT * FROM (${sql}) WHERE (status IN ('failed','canceled') AND (charged=1 OR credit_state='held')) OR (status='expired' AND credit_state='held') OR (status IN ('submitting','processing','queued') AND deadline<?) ORDER BY created_at DESC LIMIT 30`).bind(Date.now()).all();
 return {...data,ai_costs:stats.results,anomalies:anomalies.results,actual_provider_cost:null,cost_note:'显示任务预留预算上限，并非 fal 实际账单；Stripe 测试积分的 AI 任务仍可能产生真实供应商费用。此页不会重跑任务或调用模型。'};
}
