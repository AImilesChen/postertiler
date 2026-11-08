export function pdfFileName(value){
 const stem=String(value||'postertiler-poster').replace(/\.pdf$/i,'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').trim().replace(/[. ]+$/,'').slice(0,100)||'postertiler-poster';
 return stem+'.pdf';
}
export async function sharePdf(file,navigatorObject=navigator){
 if(!navigatorObject.canShare?.({files:[file]})||!navigatorObject.share)return 'unsupported';
 try{await navigatorObject.share({files:[file],title:'PosterTiler poster'});return 'handed_off';}
 catch(error){if(error.name==='AbortError')return 'canceled';throw new Error('share_failed');}
}
