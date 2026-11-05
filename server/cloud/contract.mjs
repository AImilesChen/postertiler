import { DEFAULTS, geometry } from '../../src/engine/geometry.ts';

export const CLOUD_LIMITS = Object.freeze({ jpegBytes:20*1024*1024, jpegPixels:100_000_000, pngBytes:8*1024*1024, pngPixels:4_000_000,
  dimension:30000, pages:400, resultBytes:24*1024*1024, retentionMs:86400000, uploadMs:600000, taskMs:1200000, leaseMs:120000 });
export const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('');
export const ownerKey = user => sha256(new TextEncoder().encode('google:'+user.id));
export class CloudError extends Error { constructor(code,status=400) { super(code); this.code=code; this.status=status; } }
export function cloudReady(env) { return env.CLOUD_TEST_ENABLED === 'true' && !!env.BILLING_TEST_DB?.prepare && !!env.CLOUD_TEST_FILES?.put && !!env.CLOUD_TEST_QUEUE?.send; }
export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CloudError('invalid_settings');
  const value = {...DEFAULTS};
  const optional={separateMargins:false,marginTop:5,marginRight:5,marginBottom:5,marginLeft:5,imageRatio:1};
  const allowed={...DEFAULTS,...optional};
  for(const [key,v] of Object.entries(input)) {
    if(!Object.hasOwn(allowed,key) || typeof v !== typeof allowed[key] || (typeof v==='number' && (!Number.isFinite(v)||Math.abs(v)>1e6))) throw new CloudError('invalid_settings');
    value[key]=v;
  }
  if(!['mm','cm','in'].includes(value.unit)) throw new CloudError('invalid_settings');
  const g=geometry(value,CLOUD_LIMITS.pages);
  if(g.error || g.count<1 || g.width>30000 || g.height>30000) throw new CloudError('invalid_settings');
  return {settings:value,geometry:g};
}
export function publicJob(row,now=Date.now()) {
  return {id:row.id,status:row.status,credit_state:row.credit_state,page_count:row.page_count,created_at:row.created_at,expires_at:row.expires_at,
    error:row.error_code,can_retry:row.status==='failed' && !!row.retryable && !!row.source_ready && row.retries<3 && row.expires_at>now,
    can_download:row.status==='succeeded' && !!row.result_key && row.expires_at>now,
    can_upload:row.status==='awaiting_upload' && row.upload_until>now,settings:JSON.parse(row.settings_json)};
}
