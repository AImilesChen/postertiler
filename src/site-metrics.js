import {OPS_CONSENT} from './operations-contract';
let enabled=false,timer=null,last=0,lastActivity=0,queue=Promise.resolve(),session=null;
function source(){try{const ref=document.referrer?new URL(document.referrer):null;if(!ref||ref.origin===location.origin)return 'direct';if(/(^|\.)google\.[a-z.]+$/.test(ref.hostname))return 'google';if(/(^|\.)bing\.com$/.test(ref.hostname))return 'bing';if(/(^|\.)(facebook|instagram|pinterest|tiktok|x|twitter)\.com$/.test(ref.hostname))return 'social';return 'referral';}catch{return 'other';}}
function currentSession(){try{const old=JSON.parse(sessionStorage.getItem('postertiler-metric-session')||'null');const value=old&&old.expires>Date.now()?old:{id:crypto.randomUUID()};value.expires=Date.now()+1800000;sessionStorage.setItem('postertiler-metric-session',JSON.stringify(value));return value.id;}catch{session ||= crypto.randomUUID();return session;}}
export function recordSiteMetric(event,properties={}){
 if(!enabled||location.hostname!=='postertiler.com')return;
 const b={id:crypto.randomUUID(),session:currentSession(),consent:OPS_CONSENT,event,path:location.pathname,seconds:properties.seconds||0,source:source(),tool:properties.tool||''};
 queue=queue.catch(()=>{}).then(()=>{if(!enabled)return;return fetch('/api/ops/metrics',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});}).catch(()=>{});
}
const activity=()=>{lastActivity=performance.now();};
function pulse(){const n=performance.now(),seconds=Math.min(30,Math.floor((n-last)/1000));last=n;if(document.visibilityState==='visible'&&n-lastActivity<=60000&&seconds>0)recordSiteMetric('pulse',{seconds});}
const visibility=()=>{last=performance.now();if(document.visibilityState==='visible')lastActivity=last;};
export function setSiteMetrics(value,rejected=false){
 if(enabled===value){if(rejected){try{sessionStorage.removeItem('postertiler-metric-session');}catch{}fetch('/api/ops/metrics/clear',{method:'POST',credentials:'same-origin',keepalive:true}).catch(()=>{});}return;}
 enabled=value;
 if(value){last=lastActivity=performance.now();timer=setInterval(pulse,15000);for(const name of ['pointerdown','keydown','scroll','touchstart'])window.addEventListener(name,activity,{passive:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pulse);}
 else{clearInterval(timer);for(const name of ['pointerdown','keydown','scroll','touchstart'])window.removeEventListener(name,activity);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pulse);if(rejected){try{sessionStorage.removeItem('postertiler-metric-session');}catch{}fetch('/api/ops/metrics/clear',{method:'POST',credentials:'same-origin',keepalive:true}).catch(()=>{});}}
}
