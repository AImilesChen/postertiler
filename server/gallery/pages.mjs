import {galleryReady,publicEntry,uuid} from './contract.mjs';
import {GalleryStore} from './store.mjs';
export const escapeHtml=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const jsonScript=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
export function detailHtml(item){const e=escapeHtml,id=item.id;return `<a href="/gallery">← Back to the gallery</a><header class="gr-intro"><span class="gr-eyebrow">${item.kind==='printed'?'PRINTED PROJECT':'DIGITAL ARTWORK'} · ${e(item.category)}</span><h1>${e(item.title)}</h1><p>By ${e(item.author)} · Published after review</p></header><div class="gr-detail-grid"><div class="gr-detail-art"><img src="${item.preview_url}" alt="${e(item.title)}">${item.kind==='printed'?'<p>Contributor’s photo of their print. Dimensions are submitted settings, not independently measured.</p>':''}</div><aside class="gr-project-info"><h2>The print plan</h2><dl><div><dt>Finished size</dt><dd>${e(item.size)}</dd></div><div><dt>Paper</dt><dd>${e(item.settings.paper)}</dd></div><div><dt>Poster sheets</dt><dd>${item.sheet_count}</dd></div><div><dt>Image copy</dt><dd>${item.width} × ${item.height} px</dd></div></dl><p>${e(item.description)}</p><div class="gr-project-actions">${item.allow_remix?`<a class="button" href="/?gallery=${id}#poster-editor">Make a poster like this →</a>`:''}${item.allow_pdf?`<a class="button secondary" href="/api/gallery/items/${id}/pdf">Download printable PDF</a>`:''}</div><p class="gr-muted">${item.allow_remix?'Personal poster making is permitted.':'Display only. Image reuse is not enabled.'} ${item.allow_pdf?'Print the available PDF at Actual Size / 100%.':'No public PDF download is enabled.'} No resale or redistribution rights are granted.</p><p>Report a rights or privacy concern to support@postertiler.com, or use the report form on this page.</p></aside></div>`;}
function cardsHtml(items){return `<div class="gr-section-heading"><h2 id="gr-community-title">Community projects</h2><span>Published after review</span></div><div class="gr-grid">${items.map(i=>`<article class="gr-card"><a class="gr-card-image" href="/gallery/${i.id}"><img loading="lazy" src="${i.preview_url}" alt="${escapeHtml(i.title)}"><span>${i.kind==='printed'?'Printed project':'Digital artwork'}</span></a><div class="gr-card-body"><p>${escapeHtml(i.category)} · By ${escapeHtml(i.author)}</p><h3><a href="/gallery/${i.id}">${escapeHtml(i.title)}</a></h3><p>${escapeHtml(i.size)} · ${i.sheet_count} sheets</p><a href="/gallery/${i.id}">View project →</a></div></article>`).join('')}</div>`;}
export async function galleryPages(request,env){
 const url=new URL(request.url),path=url.pathname,match=path.match(/^\/gallery\/([0-9a-f-]{36})$/i);
 if(!match&&path!=='/gallery'&&path!=='/sitemap-gallery.xml'&&path!=='/robots.txt')return null;
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const ready=galleryReady(env),origin=new URL(env.AUTH_ORIGIN||'https://postertiler.com').origin;
 if(path==='/sitemap-gallery.xml'){
  const rows=ready?(await env.GALLERY_DB.prepare("SELECT id,approved_at FROM gallery_entries WHERE status='approved' ORDER BY approved_at DESC LIMIT 1000").all()).results:[];
  const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.map(r=>`<url><loc>${origin}/gallery/${r.id}</loc><lastmod>${new Date(r.approved_at).toISOString()}</lastmod></url>`).join('')}</urlset>`;
  return new Response(request.method==='HEAD'?null:xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
 }
 const fetchAsset=p=>env.ASSETS.fetch(new Request(new URL(p,url.origin),{method:'GET'}));
 if(path==='/robots.txt'){
  const asset=await fetchAsset('/robots.txt'),text=await asset.text();return new Response(request.method==='HEAD'?null:text+(text.includes('Allow: /')?`Sitemap: ${origin}/sitemap-gallery.xml\n`:''),{status:asset.status,headers:asset.headers});
 }
 if(match){
  const row=ready&&uuid(match[1])?await new GalleryStore(env.GALLERY_DB).find(match[1]):null;
  if(!row||row.status!=='approved'){const asset=await fetchAsset('/404.html');return new Response(request.method==='HEAD'?null:asset.body,{status:404,headers:{...Object.fromEntries(asset.headers),'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});}
  const item=publicEntry(row),asset=await fetchAsset('/gallery'),canonical=origin+'/gallery/'+item.id,title=item.title+' | PosterTiler Gallery',description=(item.description||`${item.size} poster on ${item.sheet_count} sheets, shared by ${item.author}.`).slice(0,180);
  const transformed=new HTMLRewriter().on('main',{element(el){el.setAttribute('class','gr-page gr-detail');el.setAttribute('data-gallery-detail','');el.setInnerContent(detailHtml(item),{html:true});}})
   .on('title',{element(el){el.setInnerContent(escapeHtml(title),{html:true});}})
   .on('link[rel="canonical"]',{element(el){el.setAttribute('href',canonical);}})
   .on('meta[name="description"],meta[property="og:description"]',{element(el){el.setAttribute('content',description);}})
   .on('meta[property="og:title"]',{element(el){el.setAttribute('content',title);}})
   .on('meta[property="og:url"]',{element(el){el.setAttribute('content',canonical);}})
   .on('meta[property="og:image"]',{element(el){el.setAttribute('content',origin+item.preview_url);}})
   .on('script[type="application/ld+json"]',{element(el){el.setInnerContent(jsonScript({'@context':'https://schema.org','@type':'CreativeWork',name:item.title,description,image:origin+item.preview_url,url:canonical,author:{'@type':'Person',name:item.author}}),{html:true});}})
   .on('head',{element(el){el.append(`<script id="gallery-bootstrap" type="application/json">${jsonScript(item)}</script>`,{html:true});}}).transform(asset);
  return new Response(request.method==='HEAD'?null:transformed.body,{headers:{...Object.fromEntries(transformed.headers),'Cache-Control':'no-store'}});
 }
 if(path==='/gallery'&&ready){const asset=await fetchAsset('/gallery'),result=await new GalleryStore(env.GALLERY_DB).list({status:'approved'});if(!result.rows.length)return new Response(request.method==='HEAD'?null:asset.body,{headers:{...Object.fromEntries(asset.headers),'Cache-Control':'no-store'}});const items=result.rows.map(publicEntry);const transformed=new HTMLRewriter().on('.gr-community',{element(el){el.setInnerContent(cardsHtml(items),{html:true});}}).transform(asset);return new Response(request.method==='HEAD'?null:transformed.body,{headers:{...Object.fromEntries(transformed.headers),'Cache-Control':'no-store'}});}
 return null;
}
