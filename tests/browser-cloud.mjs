import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const {origin,token}=JSON.parse(await readFile('verification/cloud/local-session.json','utf8'));
await mkdir('verification/cloud',{recursive:true});
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage(),checks=[],errors=[];
await context.addCookies([{name:'postertiler-dev-session',value:token,url:origin,httpOnly:true,sameSite:'Lax'}]);
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(origin+'/cloud');const panel=page.getByRole('region',{name:'Cloud PDF settings'}),preview=page.getByRole('region',{name:'Cloud poster preview'});await panel.waitFor();
 assert.equal(await panel.getByRole('button',{name:'Generate PDF · 1 credit'}).isDisabled(),true);
 await panel.getByLabel('Source image',{exact:true}).setInputFiles('public/assets/images/alpine-lake.png');
 await panel.locator('summary').filter({hasText:'Print options'}).click();await panel.getByLabel('Printer margin (mm)',{exact:true}).fill('6');
 assert.equal(await panel.getByRole('button',{name:'Generate PDF · 1 credit'}).isDisabled(),true);
 await panel.getByRole('checkbox',{name:'I agree to upload',exact:false}).check();
 await panel.getByRole('button',{name:'Generate PDF · 1 credit'}).click();
 await preview.getByText('Task saved.',{exact:false}).waitFor();
 await preview.getByText('Ready to download',{exact:true}).waitFor({timeout:30000});
 checks.push({name:'Actual local server queue creates a PDF after explicit consent',result:'passed'});
 const before=await panel.locator('.cloud-review dl').innerText();
 const downloadPromise=page.waitForEvent('download');await preview.getByRole('link',{name:'Download PDF',exact:true}).click();const download=await downloadPromise;await download.saveAs('verification/cloud/browser-download.pdf');
 assert.equal(await panel.locator('.cloud-review dl').innerText(),before);
 checks.push({name:'Browser downloads the actual PDF without another debit',result:'passed'});
 await page.screenshot({path:'verification/cloud/cloud-panel-desktop.png',fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:`verification/cloud/cloud-panel-${width}.png`,fullPage:true});}
 checks.push({name:'Cloud controls and tasks fit 390px and 320px widths',result:'passed'});
 assert.deepEqual(errors,[]);await writeFile('verification/cloud/browser-results.json',JSON.stringify({environment:'actual local workerd/D1/R2/Queue with fixture Google session and credits',checks,errors},null,2));console.log(JSON.stringify(checks));
}finally{await browser.close();}
