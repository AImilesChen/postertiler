import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:4180', out = 'verification/auth';
await mkdir(out, { recursive:true });
const browser = await chromium.launch(browserOptions), context = await browser.newContext({ viewport:{width:1440,height:1000} }), page = await context.newPage();
const checks = [], errors = [], external = [];
page.on('pageerror', e => errors.push(e.message));
context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(origin)) external.push(r.url()); });
let failSession = false, failLogout = false, user = null, available = true;
const fixture = { id:'fixture-google-sub', name:'Fixture Person', email:'fixture@example.com' };
await page.route('**/api/auth/session', route => route.fulfill({ status:failSession?503:200, contentType:'application/json', body:JSON.stringify({ available,user }) }));
await page.route('**/api/auth/signout', route => {
  assert.equal(route.request().method(),'POST'); assert.equal(route.request().headers().origin, origin);
  if (!failLogout) user = null;
  return route.fulfill({ status:failLogout?503:200, contentType:'application/json', body:JSON.stringify({ok:!failLogout}) });
});
async function check(name, fn) { await fn(); checks.push({name,result:'passed'}); console.log('PASS', name); }
const go = suffix => page.goto(origin+'/account'+suffix,{waitUntil:'networkidle'});
try {
  await check('Account page has real Google entry and remains noindex, with free tools linked', async () => {
    await go(''); await page.getByRole('link',{name:'Continue with Google',exact:true}).waitFor();
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow');
    assert.equal(await page.getByRole('link',{name:'Continue with Google',exact:true}).getAttribute('href'),'/api/auth/google');
    assert.equal(await page.getByRole('link',{name:'Browse the free tools',exact:true}).getAttribute('href'),'/tools');
    await page.screenshot({path:out+'/sign-in-desktop.png',fullPage:true});
  });
  await check('Unavailable configuration and failed session checks give usable recovery', async () => {
    available=false; await go(''); await page.getByText('Sign-in is temporarily unavailable. The free tools are ready to use.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Continue with Google',exact:true}).count(),0);
    available=true; failSession=true; await go(''); await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
    failSession=false; await page.getByRole('button',{name:'Try again',exact:true}).click(); await page.getByRole('link',{name:'Continue with Google',exact:true}).waitFor();
  });
  await check('Canceled, expired and failed callbacks show safe retry messages', async () => {
    for (const [reason, text] of [['canceled','Google sign-in was canceled.'],['expired','This sign-in attempt expired'],['failed','We could not complete Google sign-in.']]) {
      await go('?error='+reason); assert.ok((await page.locator('main').innerText()).includes(text));
    }
    await go('?error=UNTRUSTED_HTML'); assert.ok(!(await page.locator('main').innerText()).includes('UNTRUSTED_HTML'));
  });
  await check('Signed-in fixture profile, failed logout and successful logout behave correctly', async () => {
    user=fixture; await go(''); await page.getByRole('heading',{name:'Fixture Person',exact:true}).waitFor();
    assert.ok((await page.locator('main').innerText()).includes(fixture.email));
    await page.screenshot({path:out+'/signed-in-desktop.png',fullPage:true});
    failLogout=true; await page.getByRole('button',{name:'Sign out',exact:true}).click(); await page.getByText('We could not sign you out. Please try again.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Fixture Person',exact:true}).count(),1);
    failLogout=false; await page.getByRole('button',{name:'Sign out',exact:true}).click(); await page.getByRole('link',{name:'Continue with Google',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Fixture Person',exact:true}).count(),0);
  });
  await check('Titles stay above the account card at desktop, tablet and phone sizes', async () => {
    for (const width of [1440,1024,820,390,320]) for (const loggedIn of [false,true]) {
      await page.setViewportSize({width,height:1000}); user=loggedIn?fixture:null; await go('');
      const layout=await page.evaluate(()=>{ const h=document.querySelector('.auth-heading').getBoundingClientRect(), t=document.querySelector('h1').getBoundingClientRect(), c=document.querySelector('.auth-card').getBoundingClientRect(); return {headingBottom:h.bottom,titleWidth:t.width,cardTop:c.top,cardLeft:c.left,cardRight:c.right,viewport:innerWidth}; });
      assert.ok(layout.headingBottom+16<=layout.cardTop,`Title and card overlap at ${width}px`);
      assert.ok(layout.titleWidth>=Math.min(320,width-40),`Title is squeezed into a narrow column at ${width}px`);
      assert.ok(layout.cardLeft>=15&&layout.cardRight<=layout.viewport-15,`Card exceeds the viewport at ${width}px`);
    }
  });
  await check('Anonymous and signed-in long-profile states fit 390px and 320px without markup injection', async () => {
    for(const width of [390,320]) for(const loggedIn of [false,true]) {
      await page.setViewportSize({width,height:844}); user=loggedIn?{...fixture,name:'<script>Fixture only</script>',email:'long-profile-fixture-address-for-mobile-layout@example.com'}:null;
      await go(''); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.equal(await page.locator('script').filter({hasText:'Fixture only'}).count(),0);
      await page.screenshot({path:`${out}/${loggedIn?'fixture-profile':'sign-in'}-${width}.png`,fullPage:true});
    }
  });
  await check('Account fixtures cause no browser exceptions or external requests', async () => { assert.deepEqual(errors,[]); assert.deepEqual(external,[]); });
} catch(e) { checks.push({name:'failure',result:'failed',message:e.message}); await page.screenshot({path:out+'/failure.png',fullPage:true}); console.error(e); process.exitCode=1; }
finally { await writeFile(out+'/browser-results.json',JSON.stringify({environment:'local fixture API; not real Google authorization',checks,errors,external},null,2)); await browser.close(); }
