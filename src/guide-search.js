const normal=text=>String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function searchGuides(guides,query,metadata={}){
 const q=normal(String(query).slice(0,160));if(!q)return guides;
 const terms=q.split(/\s+/);
 return guides.map((guide,index)=>{
  const meta=metadata[guide.slug]||{},title=normal(guide.title),keywords=normal((meta.keywords||[]).join(' ')),summary=normal(guide.intro+' '+guide.category),body=normal(guide.steps.flat().join(' ')+' '+(meta.details||[]).join(' '));
  const fields=[title,keywords,summary,body];
  if(!terms.every(term=>fields.some(field=>field.includes(term))))return null;
  const score=terms.reduce((sum,term)=>sum+(title.includes(term)?12:0)+(keywords.includes(term)?8:0)+(summary.includes(term)?4:0)+(body.includes(term)?1:0),0)+(title.includes(q)?16:0);
  return {guide,index,score};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.index-b.index).map(item=>item.guide);
}
