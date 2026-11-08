import { BILLING_VERSION } from './catalog.mjs';
import { AI_VERSION } from '../ai/contract.mjs';
export const ORDER_FILTERS = Object.freeze({all:'1=1',paid:"status='paid'",open:"status IN ('created','pending')",refunded:"status IN ('refunded','partially_refunded')",closed:"status IN ('failed','expired')"});

export class BillingStore {
  constructor(db,{ai=false}={}) {
    this.db=db;this.version=ai?AI_VERSION:BILLING_VERSION;
    // Fixed namespaces only: AI purchases never grant ordinary cloud exports.
    this.prepare=sql=>db.prepare(ai?sql.replaceAll('billing_test_orders','ai_test_orders').replaceAll('billing_test_events','ai_test_events'):sql);
  }
  find(id) { return this.prepare('SELECT * FROM billing_test_orders WHERE id = ?').bind(id).first(); }
  findRequest(user, requestId) { return this.prepare('SELECT * FROM billing_test_orders WHERE user_key = ? AND request_id = ?').bind(user, requestId).first(); }
  async create(user, requestId, sku, plan) {
    const now = Date.now();
    await this.prepare(`INSERT INTO billing_test_orders
      (id,user_key,request_id,sku,price_id,price_version,amount,currency,credits,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_key,request_id) DO NOTHING`)
      .bind(crypto.randomUUID(), user, requestId, sku, plan.price, this.version, plan.amount, plan.currency, plan.credits, now, now).run();
    return this.findRequest(user, requestId);
  }
  async recentCount(user) {
    const row = await this.prepare('SELECT COUNT(*) AS count FROM billing_test_orders WHERE user_key = ? AND created_at > ?').bind(user, Date.now() - 3600000).first();
    return Number(row?.count || 0);
  }
  async attach(id, sessionId) {
    await this.prepare(`UPDATE billing_test_orders SET session_id = ?, status = CASE WHEN paid = 1 OR refunded_amount > 0 THEN status ELSE 'pending' END, updated_at = ? WHERE id = ? AND (session_id IS NULL OR session_id = ?)`)
      .bind(sessionId, Date.now(), id, sessionId).run();
    const row = await this.find(id);
    if (row.session_id !== sessionId) throw new Error('Session conflict');
    return row;
  }
  async summary(user) {
    const result = await this.prepare('SELECT id,sku,status,amount,currency,credits,paid,refunded_amount,refunded_credits,created_at FROM billing_test_orders WHERE user_key = ? ORDER BY created_at DESC LIMIT 20').bind(user).all();
    const balance = await this.prepare('SELECT COALESCE(SUM(CASE WHEN paid = 1 THEN credits - refunded_credits ELSE 0 END),0) AS credits FROM billing_test_orders WHERE user_key = ?').bind(user).first();
    return { test_credits: Number(balance.credits), orders: result.results };
  }
  async listPage(user,params) {
    const where=ORDER_FILTERS[params.filter];
    const total=await this.prepare(`SELECT COUNT(*) AS total FROM billing_test_orders WHERE user_key=? AND ${where}`).bind(user).first();
    const rows=await this.prepare(`SELECT id,sku,status,amount,currency,credits,paid,refunded_amount,created_at FROM billing_test_orders WHERE user_key=? AND ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(user,params.limit,params.offset).all();
    return {orders:rows.results,total:Number(total.total),page:params.page,page_size:params.limit};
  }
  async apply(event, order, session, refundedAmount = null) {
    const now = Date.now();
    const insert = this.prepare('INSERT OR IGNORE INTO billing_test_events(event_id,event_type,order_id,processed_at) VALUES(?,?,?,?)').bind(event.id, event.type, order.id, now);
    let update;
    if (refundedAmount !== null) {
      const amount = Math.min(order.amount, refundedAmount);
      // A whole-credit refund is rounded to cents (e.g. 599 / 5 -> 120).
      // Allow that half-cent rounding before revoking an indivisible test credit.
      const credits = Math.max(0, Math.min(order.credits, Math.ceil((amount - 0.5) * order.credits / order.amount)));
      update = this.prepare(`UPDATE billing_test_orders SET refunded_amount = MAX(refunded_amount,?), refunded_credits = MAX(refunded_credits,?),
        status = CASE WHEN MAX(refunded_amount,?) >= amount THEN 'refunded' WHEN MAX(refunded_amount,?) > 0 THEN 'partially_refunded' ELSE status END,
        updated_at = ? WHERE id = ?`).bind(amount, credits, amount, amount, now, order.id);
    } else if (session.payment_status === 'paid') {
      const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      update = this.prepare(`UPDATE billing_test_orders SET paid = 1, session_id = ?, payment_intent_id = ?,
        paid_at = COALESCE(paid_at,?), status = CASE WHEN refunded_amount >= amount THEN 'refunded' WHEN refunded_amount > 0 THEN 'partially_refunded' ELSE 'paid' END,
        updated_at = ? WHERE id = ? AND (session_id IS NULL OR session_id = ?)`).bind(session.id, pi, Number.isInteger(event.created)?event.created*1000:null, now, order.id, session.id);
    } else {
      const status = event.type === 'checkout.session.expired' ? 'expired' : event.type === 'checkout.session.async_payment_failed' ? 'failed' : 'pending';
      update = this.prepare(`UPDATE billing_test_orders SET status = CASE WHEN paid = 1 OR refunded_amount > 0 THEN status ELSE ? END,
        session_id = COALESCE(session_id,?), updated_at = ? WHERE id = ? AND (session_id IS NULL OR session_id = ?)`).bind(status, session.id, now, order.id, session.id);
    }
    // D1 batch is transactional. Monotonic order totals also make different event
    // IDs for the same payment and out-of-order deliveries safe to replay.
    await this.db.batch([insert, update]);
  }
}
