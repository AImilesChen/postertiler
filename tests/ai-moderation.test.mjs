import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {deflateSync} from 'node:zlib';
import {sightengine,imageDecision,IMAGE_MODELS} from '../server/ai/moderation.mjs';
import {moderationPng} from '../server/ai/moderation-image.mjs';

const env={SIGHTENGINE_API_USER:'fixture-user',SIGHTENGINE_API_SECRET:'fixture-secret'};
const options={sleep:async()=>{}};
const safeImage=()=>({status:'success',nudity:{sexual_activity:.01,sexual_display:.01,erotica:.01,very_suggestive:.01},gore:{prob:.01},violence:{prob:.01,classes:{physical_violence:.01,firearm_threat:.01,combat_sport:.99}},'self-harm':{prob:.01},offensive:{nazi:.01,supremacist:.01,terrorist:.01,asian_swastika:.99}});
const safeRules=()=>({status:'success',profanity:{matches:[]},violence:{matches:[]},'self-harm':{matches:[]},extremism:{matches:[]}});
const safeMl=()=>({status:'success',moderation_classes:{sexual:.01,discriminatory:.01,violent:.01,'self-harm':.01}});
test('image policy validates every requested score and does not mistake traditional swastikas for hate',()=>{
 assert.equal(imageDecision(safeImage()),false);const violent=safeImage();violent.violence.classes.firearm_threat=.9;assert.equal(imageDecision(violent),true);
 for(const [group,key]of [['nudity','sexual_activity'],['nudity','erotica'],['gore','prob'],['self-harm','prob'],['offensive','terrorist']]){const data=safeImage();data[group][key]=.8;assert.equal(imageDecision(data),true);}
 for(const n of [undefined,null,'0.1',NaN,Infinity,-.1,1.1]){const data=safeImage();data.nudity.sexual_activity=n;assert.throws(()=>imageDecision(data),/moderation_unavailable/);}
});
test('moderation posts only to a fixed HTTPS host; credentials stay out of URLs and JSON results',async()=>{
 let sent;const m=sightengine(env,async(url,init)=>{sent={url,init};return Response.json(safeImage());},options);
 await m.image(new Uint8Array([1,2,3]),'image/jpeg','source');assert.equal(sent.url,'https://api.sightengine.com/1.0/check.json');assert.equal(sent.init.redirect,'manual');assert.equal(sent.init.body.get('models'),IMAGE_MODELS);assert.equal(sent.init.body.get('api_secret'),env.SIGHTENGINE_API_SECRET);assert.equal(sent.init.body.get('url'),null);assert.equal(sent.init.body.get('media').type,'image/jpeg');
});
test('missing configuration, redirects, timeout, HTTP errors, malformed and incomplete results all fail closed',async()=>{
 for(const response of [new Response(null,{status:307,headers:{Location:'https://evil.invalid'}}),new Response(null,{status:429}),new Response(null,{status:500}),Response.json({status:'failure',error:{message:'sensitive provider detail'}}),Response.json({status:'success'}),new Response('not json'),new Response('a'.repeat(128*1024+1))]){
  let calls=0;const m=sightengine(env,async()=>{calls++;return response;},options);
  await assert.rejects(()=>m.image(new Uint8Array([1]),'image/png','output'),e=>['moderation_limit','moderation_unavailable'].includes(e.code)&&!e.message.includes('sensitive'));assert.equal(calls,1);
 }
 const missing=sightengine({},()=>{throw Error('must not call');},options);await assert.rejects(()=>missing.prompt('A garden'),/moderation_unavailable/);
 const timeout=sightengine(env,()=>{throw new DOMException('secret upstream detail','TimeoutError');},options);await assert.rejects(()=>timeout.prompt('A garden'),/moderation_unavailable/);
});
test('prompt rules stop before semantic screening; English ML is checked and Chinese uses supported rules',async()=>{
 let calls=[];const m=sightengine(env,async(url,init)=>{const form=init.body;calls.push({lang:form.get('lang'),mode:form.get('mode')});return Response.json(form.get('mode')==='rules'?safeRules():safeMl());},options);
 await m.prompt('A moonlit garden');assert.deepEqual(calls.map(c=>c.mode),['rules','ml']);calls=[];await m.prompt('国风山水插画');assert.deepEqual(calls.map(c=>c.mode),['rules']);assert.ok(calls[0].lang.includes('zh'));
 let blockedCalls=0;const blocked=sightengine(env,async()=>{blockedCalls++;const data=safeRules();data.profanity.matches=[{type:'sexual',intensity:'high'}];return Response.json(data);},options);
 await assert.rejects(()=>blocked.prompt('fixture prompt'),/moderation_prompt_blocked/);assert.equal(blockedCalls,1);
 const semantic=sightengine(env,async(url,init)=>{const d=init.body.get('mode')==='rules'?safeRules():safeMl();if(d.moderation_classes)d.moderation_classes.violent=.9;return Response.json(d);},options);await assert.rejects(()=>semantic.prompt('fixture prompt'),/moderation_prompt_blocked/);
});
test('moderation requests are paced to the free plan and never automatically retried',async()=>{
 let clock=0;const waits=[];const m=sightengine(env,async()=>Response.json(safeImage()),{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;}});
 await m.image(new Uint8Array([1]),'image/jpeg','source');await m.image(new Uint8Array([1]),'image/png','output');assert.deepEqual(waits,[0,1100]);
});
test('review copy preserves aspect ratio, flattens alpha, stays bounded and leaves the original unchanged',async()=>{
 const canvas=createCanvas(2086,3016),ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,1043,3016);const bytes=new Uint8Array(canvas.toBuffer('image/png')),before=bytes.slice();
 const copy=await moderationPng(bytes),image=await loadImage(copy);assert.equal(image.width,708);assert.equal(image.height,1024);assert.ok(copy.length<12_000_000);assert.deepEqual(bytes,before);
 const out=createCanvas(708,1024),c=out.getContext('2d');c.drawImage(image,0,0);assert.deepEqual([...c.getImageData(10,10,1,1).data],[255,0,0,255]);assert.deepEqual([...c.getImageData(700,10,1,1).data],[255,255,255,255]);
});

// Minimal PNG fixtures deliberately exercise filters/color modes that a vendor
// can return. CRC is ignored by the existing input cleaner, but our output CRCs
// are checked by an independent image decoder below.
function png(colour,pixels,filter=0,palette,alpha){
 const channels={0:1,2:3,3:1,4:2,6:4}[colour],width=2,height=2,row=width*channels,raw=[];
 function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
 for(let y=0;y<height;y++){raw.push(filter);for(let x=0;x<row;x++){const a=x>=channels?pixels[y*row+x-channels]:0,b=y?pixels[(y-1)*row+x]:0,c=y&&x>=channels?pixels[(y-1)*row+x-channels]:0;raw.push((pixels[y*row+x]-(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255);}}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=colour;
 function chunk(name,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(name,4);b.set(data,8);return b;}
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),...(palette?[chunk('PLTE',Buffer.from(palette))]:[]),...(alpha?[chunk('tRNS',Buffer.from(alpha))]:[]),chunk('IDAT',deflateSync(Buffer.from(raw))),chunk('IEND',Buffer.alloc(0))]));
}
test('review PNG handles all five filters and RGB/grayscale/palette transparency without expanding full source memory',async()=>{
 for(let filter=0;filter<=4;filter++){
  const data=png(2,[255,0,0,0,255,0,0,0,255,111,123,145],filter),img=await loadImage(await moderationPng(data));
  const c=createCanvas(2,2).getContext('2d');c.drawImage(img,0,0);assert.deepEqual([...c.getImageData(1,1,1,1).data],[111,123,145,255]);
 }
 for(const [colour,pixels,palette,alpha]of [[0,[0,100,150,200],null,[0,0]],[3,[0,1,0,1],[255,0,0,0,255,0],[0,255]],[4,[0,0,100,255,150,255,200,255]],[6,[255,0,0,0,0,255,0,255,0,0,255,255,111,123,145,255]]]){
  const img=await loadImage(await moderationPng(png(colour,pixels,0,palette,alpha))),c=createCanvas(2,2).getContext('2d');c.drawImage(img,0,0);assert.deepEqual([...c.getImageData(0,0,1,1).data],[255,255,255,255]);
 }
 await assert.rejects(()=>moderationPng(new Uint8Array([1,2,3])));
});


test('pilot diagnostics expose only HTTP/numeric codes, never vendor messages or credentials',async()=>{
 const m=sightengine(env,async()=>Response.json({status:'failure',error:{code:1001,message:'private secret fixture-secret'}},{status:401}),{...options,diagnostics:true});
 await assert.rejects(()=>m.prompt('A garden'),e=>{assert.deepEqual(e.diagnostic,{http_status:401,provider_code:1001,endpoint:'text/check.json',mode:'rules'});assert.ok(!JSON.stringify(e).includes('fixture-secret'));return true;});
});
