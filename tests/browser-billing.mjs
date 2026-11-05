import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const origin='http://127.0.0.1:4180',out='verification/billing';await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();
const checks=[],errors=[],posts=[];let enabled=false,fail=false,unsafe=false,orderStatus='pending';
const orderId='c965fca2-7ef7-4cba-a30e-7de9a2ca6878';
const plans=[{id:'single',name:'Cloud Single',amount:199,currency:'usd',credits:1},{id:'pack5',name:'Cloud Pack — 5 Exports',amount:599,currency:'usd',credits:5}];
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/api/auth/session',route=>route.fulfill({json:{available:true,user:{id:'fixture-only',name:'Payment Tester',email:'fixture@example.invalid'}}}));
await context.route('**/api/billing/test/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path.endsWith('/status'))return route.fulfill({json:{mode:'test',enabled,cloud_delivery:false,test_credits:orderStatus==='paid'?5:0,orders:orderStatus==='paid'?[{id:orderId,sku:'pack5',status:'paid',amount:599}]:[],plans}});
 if(path.includes('/orders/'))return route.fulfill({json:{id:orderId,status:orderStatus}});
 if(path.endsWith('/checkout')){posts.push(route.request().postDataJSON());return route.fulfill({status:fail?503:200,json:fail?{error:'billing_temporarily_unavailable'}:{mode:'test',order_id:orderId,url:unsafe?'https://attacker.invalid/':'https://checkout.stripe.com/c/pay/fixture'}});}
 return route.fulfill({status:404,json:{error:'not_found'}});
});
await context.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Local Stripe Checkout fixture</h1>'}));
async function check(name,fn){await fn();checks.push({name,result:'passed'});console.log('PASS',name);}
const go=path=>page.goto(origin+path,{waitUntil:'networkidle'});
try{
 await check('Disabled billing leaves the current account screen intact',async()=>{await go('/account');assert.equal(await page.getByRole('region',{name:'Stripe payment testing'}).count(),0);await page.getByRole('heading',{name:'Payment Tester',exact:true}).waitFor();});
 enabled=true;
 await check('Enabled sandbox explains test-only credits and can retry a failed checkout idempotently',async()=>{
  fail=true;await go('/account');const region=page.getByRole('region',{name:'Stripe payment testing'});await region.waitFor();assert.match(await region.innerText(),/No real money is charged/);
  await region.getByRole('button',{name:'Test $1.99 checkout',exact:true}).click();await region.getByRole('alert').filter({hasText:'Test checkout could not open'}).waitFor();
  await region.getByRole('button',{name:'Test $1.99 checkout',exact:true}).click();await region.getByRole('alert').filter({hasText:'Test checkout could not open'}).waitFor();assert.deepEqual(posts[0],posts[1]);assert.deepEqual(Object.keys(posts[0]).sort(),['plan','request_id']);
  fail=false;await region.getByRole('button',{name:'Test $5.99 checkout',exact:true}).click();await page.waitForURL('https://checkout.stripe.com/c/pay/fixture');assert.equal(posts.at(-1).plan,'pack5');
 });
 await check('A pending browser return displays pending state without posting another checkout',async()=>{const count=posts.length;await go('/account?billing_order='+orderId);await page.getByRole('status').filter({hasText:'Waiting for Stripe'}).waitFor();assert.equal(posts.length,count);});
 await check('A confirmed test return shows the persisted test balance and order',async()=>{orderStatus='paid';await go('/account?billing_order='+orderId);await page.getByRole('status').filter({hasText:'Test payment confirmed by Stripe'}).waitFor();await page.getByText('5 test credits',{exact:true}).waitFor();await page.screenshot({path:out+'/account-test-desktop.png',fullPage:true});});
 await check('320px and 390px sandbox views keep controls and order text within the viewport',async()=>{for(const width of [390,320]){await page.setViewportSize({width,height:1000});await go('/account');await page.getByRole('region',{name:'Stripe payment testing'}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:`${out}/account-test-${width}.png`,fullPage:true});}});
 await check('A non-Stripe checkout URL is refused and remains on the account page',async()=>{unsafe=true;await go('/account');await page.getByRole('button',{name:'Test $1.99 checkout',exact:true}).click();await page.getByRole('alert').filter({hasText:'Test checkout could not open'}).waitFor();assert.equal(new URL(page.url()).origin,origin);});
 assert.deepEqual(errors,[]);await writeFile(out+'/browser-results.json',JSON.stringify({environment:'local build; auth, billing and Stripe Checkout are explicit fixtures',checks,errors},null,2));
}finally{await browser.close();}
