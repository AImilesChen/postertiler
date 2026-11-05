import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin='http://127.0.0.1:4180',out='verification/navigation'; await mkdir(out,{recursive:true});
const browser=await chromium.launch(browserOptions), context=await browser.newContext({viewport:{width:1440,height:1000}}), page=await context.newPage();
const fixture={id:'fixture-google-sub',name:'Fixture Person',email:'fixture@example.com'};
let user=null, failLogout=false, sessions=0, holdSession=false, releaseHeld, deferredReady;
const checks=[],errors=[],external=[];
context.on('page',p=>p.on('pageerror',e=>errors.push(e.message))); page.on('pageerror',e=>errors.push(e.message));
context.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin))external.push(new URL(r.url()).origin);});
await context.route('**/api/auth/session',async route=>{
  sessions++; const body=JSON.stringify({available:true,user});
  if(holdSession){holdSession=false;const wait=new Promise(resolve=>{releaseHeld=resolve;});deferredReady?.();await wait;}
  try {await route.fulfill({status:200,contentType:'application/json',body});}catch{/* A canceled stale request is expected in the race test. */}
});
await context.route('**/api/auth/signout',async route=>{
  assert.equal(route.request().method(),'POST'); assert.equal(route.request().headers().origin,origin);
  if(!failLogout)user=null;
  await route.fulfill({status:failLogout?503:200,contentType:'application/json',body:JSON.stringify({ok:!failLogout})});
});
const nav=p=>p.getByRole('navigation',{name:'Main navigation',exact:true});
const trigger=p=>nav(p).getByRole('button',{name:/Account menu for/});
const menu=p=>nav(p).getByRole('menu',{name:'Account menu',exact:true});
const go=path=>page.goto(origin+path,{waitUntil:'networkidle'});
async function check(name,fn){await fn();checks.push({name,result:'passed'});console.log('PASS',name);}
try {
  await check('Anonymous header has a clear Sign in entry instead of a permanent Account link',async()=>{
    user=null;await go('/');assert.equal(await nav(page).getByRole('link',{name:'Sign in',exact:true}).getAttribute('href'),'/account');
    assert.equal(await nav(page).getByRole('link',{name:'Account',exact:true}).count(),0);assert.equal(await trigger(page).count(),0);
    await page.screenshot({path:out+'/anonymous-desktop.png',fullPage:false});
  });
  await check('Signed-in header shows the profile menu and keeps tool and account popovers exclusive',async()=>{
    user=fixture;await go('/');await trigger(page).waitFor();await trigger(page).click();
    assert.equal(await menu(page).getByRole('menuitem',{name:'My account',exact:true}).getAttribute('href'),'/account');
    assert.ok((await nav(page).innerText()).includes(fixture.email));
    await page.screenshot({path:out+'/signed-in-menu-desktop.png',fullPage:false});
    await nav(page).getByRole('button',{name:'Tools',exact:true}).click();assert.equal(await menu(page).count(),0);
    await trigger(page).click();assert.equal(await nav(page).getByRole('link',{name:'All Tools',exact:true}).count(),0);
  });
  await check('Account menu supports arrows, Home, End, Escape and outside clicks',async()=>{
    await menu(page).getByRole('menuitem',{name:'My account',exact:true}).focus();
    await page.keyboard.press('ArrowDown');assert.equal(await menu(page).getByRole('menuitem',{name:'Sign out',exact:true}).evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Home');assert.equal(await menu(page).getByRole('menuitem',{name:'My account',exact:true}).evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('End');await page.keyboard.press('Escape');await menu(page).waitFor({state:'hidden'});
    assert.equal(await trigger(page).evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('ArrowDown');await menu(page).waitFor();await page.getByRole('heading',{name:'Free Block Poster Maker',exact:true}).click();assert.equal(await menu(page).count(),0);
  });
  await check('Failed header logout can retry; successful logout preserves the selected poster',async()=>{
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/grid.jpg');await page.locator('.preview-canvas canvas').waitFor();
    failLogout=true;await trigger(page).click();await menu(page).getByRole('menuitem',{name:'Sign out',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Could not sign out.'}).waitFor();assert.equal(await trigger(page).count(),1);
    failLogout=false;await menu(page).getByRole('menuitem',{name:'Sign out',exact:true}).click();await nav(page).getByRole('link',{name:'Sign in',exact:true}).waitFor();
    assert.equal(await page.locator('.preview-canvas canvas').count(),1);assert.equal(new URL(page.url()).pathname,'/');
    assert.equal(await page.getByRole('heading',{name:'Your poster preview',exact:true}).count(),0);
  });
  await check('Account page and header share one session request and both update after sign-out',async()=>{
    user=fixture;sessions=0;await go('/account');await page.getByRole('heading',{name:fixture.name,exact:true}).waitFor();assert.equal(sessions,1);
    await page.getByRole('main').getByRole('button',{name:'Sign out',exact:true}).click();await nav(page).getByRole('link',{name:'Sign in',exact:true}).waitFor();
    await page.getByRole('link',{name:'Continue with Google',exact:true}).waitFor();assert.equal(await trigger(page).count(),0);
  });
  await check('Other open tabs update when this browser signs out',async()=>{
    user=fixture;await go('/');const other=await context.newPage();await other.goto(origin+'/account',{waitUntil:'networkidle'});await trigger(other).waitFor();
    await trigger(page).click();await menu(page).getByRole('menuitem',{name:'Sign out',exact:true}).click();
    await nav(other).getByRole('link',{name:'Sign in',exact:true}).waitFor();await other.getByRole('link',{name:'Continue with Google',exact:true}).waitFor();await other.close();
  });
  await check('A delayed pre-logout session response cannot restore a signed-out identity',async()=>{
    user=fixture;await go('/');holdSession=true;const ready=new Promise(resolve=>{deferredReady=resolve;});
    await page.evaluate(()=>{const channel=new BroadcastChannel('postertiler-auth-v1');channel.postMessage({type:'session-changed'});channel.close();});await ready;
    await trigger(page).click();await menu(page).getByRole('menuitem',{name:'Sign out',exact:true}).click();await nav(page).getByRole('link',{name:'Sign in',exact:true}).waitFor();
    releaseHeld();await page.waitForLoadState('networkidle');assert.equal(await trigger(page).count(),0);
  });
  await check('Desktop, compact and mobile headers fit; mobile account menu stays usable',async()=>{
    for(const width of [1440,1024,900,821,820,390,320])for(const signedIn of [false,true]){
      user=signedIn?{...fixture,name:'Longnametocheckheadermenuwidthwithverylongtext Profile'}:null;await page.setViewportSize({width,height:1000});await go('/');
      if(width<=820){await page.getByRole('button',{name:'Open navigation',exact:true}).click();if(signedIn){await trigger(page).click();await menu(page).waitFor();}else await nav(page).getByRole('link',{name:'Sign in',exact:true}).waitFor();}
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Header overflows at ${width}px`);
      if(width===390||width===320)await page.screenshot({path:`${out}/${signedIn?'signed-in-menu':'anonymous'}-${width}.png`,fullPage:false});
    }
  });
  await check('Navigation adds no third-party requests or browser exceptions',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
}catch(e){checks.push({name:'failure',result:'failed',message:e.message});releaseHeld?.();await page.screenshot({path:out+'/failure.png',fullPage:true});console.error(e);process.exitCode=1;}
finally{await writeFile(out+'/results.json',JSON.stringify({environment:'local fixture API; Google authorization not repeated',checks,errors,external},null,2));await browser.close();}
