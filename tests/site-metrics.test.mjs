import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('browser measurement stops without consent, on hidden and idle pages, and clears identity on refusal',async()=>{
 let clock=0,timer;const calls=[],events=new Map(),storage=new Map();
 const document={referrer:'https://www.google.com/',visibilityState:'visible',addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 const context=vm.createContext({document,location:{hostname:'postertiler.com',origin:'https://postertiler.com',pathname:'/'},crypto,URL,Promise,Date,performance:{now:()=>clock},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)},setInterval:f=>{timer=f;return 1;},clearInterval:()=>{timer=null;},fetch:async(path,options)=>{calls.push({path,body:options.body&&JSON.parse(options.body)});return new Response('{}');},Response});
 const source=(await readFile(new URL('../src/site-metrics.js',import.meta.url),'utf8')).replace(/^import .*$/m,"const OPS_CONSENT='fixture';").replaceAll('export ','');vm.runInContext(source+';this.api={setSiteMetrics,recordSiteMetric};',context);
 const flush=()=>new Promise(resolve=>setImmediate(resolve));const {api}=context;
 api.recordSiteMetric('page_view');await flush();assert.equal(calls.length,0);
 api.setSiteMetrics(true);api.recordSiteMetric('page_view');await flush();assert.equal(calls[0].body.source,'google');assert.ok(storage.size);
 clock=15000;timer();await flush();assert.equal(calls[1].body.seconds,15);
 document.visibilityState='hidden';events.get('visibilitychange')();clock=45000;timer();await flush();assert.equal(calls.length,2);
 document.visibilityState='visible';events.get('visibilitychange')();clock=60000;timer();await flush();assert.equal(calls.length,3);assert.equal(calls[2].body.seconds,15);
 clock=130000;timer();await flush();assert.equal(calls.length,3);
 api.setSiteMetrics(false,true);api.recordSiteMetric('page_view');await flush();assert.equal(storage.size,0);assert.equal(calls.at(-1).path,'/api/ops/metrics/clear');assert.equal(timer,null);
});
