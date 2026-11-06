import { useCallback,useEffect,useRef,useState } from 'react';
import { useAuth } from './AuthContext';
import { accountRequest } from './account-data';
import { AI_CHANNEL } from './ai-navigation';
export const AI_API='/api/ai/test';
export { activeAi,aiMessage } from './ai-job-state';
import { activeAi } from './ai-job-state';
export function useAiAccount(){
 const auth=useAuth(),[state,setState]=useState({data:null,error:'',loading:false}),pending=useRef(null),epoch=useRef(0);
 const refresh=useCallback(async()=>{
  if(!auth.user)return;if(pending.current)return pending.current;
  const version=epoch.current;
  const work=(async()=>{try{const data=await accountRequest(AI_API+'/status',{signal:AbortSignal.timeout(10000)});if(version===epoch.current)setState({data,error:'',loading:false});return data;}catch(e){if(version===epoch.current)setState(s=>({...s,error:e.message,loading:false}));}finally{if(version===epoch.current)pending.current=null;}})();
  pending.current=work;return work;
 },[auth.user?.id]);
 useEffect(()=>{epoch.current++;pending.current=null;setState({data:null,error:'',loading:!!auth.user});refresh();const update=()=>refresh();const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(AI_CHANNEL):null;if(channel)channel.onmessage=()=>refresh();const visible=()=>{if(!document.hidden)refresh();};document.addEventListener('visibilitychange',visible);window.addEventListener('focus',update);window.addEventListener('ai-updated',update);return()=>{epoch.current++;channel?.close();document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',update);window.removeEventListener('ai-updated',update);};},[refresh]);
 useEffect(()=>{if(!state.data?.jobs.some(activeAi))return;const timer=setInterval(()=>{if(!document.hidden)refresh();},4000);return()=>clearInterval(timer);},[state.data,refresh]);
 return {...state,refresh};
}
export async function aiWorkingCopy(source,edit=false){
 const response=await fetch(source);if(!response.ok)throw new Error('source_missing');
 const image=await createImageBitmap(await response.blob(),{imageOrientation:'from-image'});
 try{
  if(image.width*image.height>24_000_000||Math.max(image.width,image.height)>12000)throw new Error('output_too_large');
  const scale=edit?Math.min(1,1536/Math.max(image.width,image.height),Math.sqrt(1_600_000/(image.width*image.height))):1;
  const width=Math.max(1,Math.floor(image.width*scale)),height=Math.max(1,Math.floor(image.height*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');if(!context)throw new Error('image_unavailable');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.96));canvas.width=canvas.height=1;
  if(!blob||blob.size>8*1024*1024)throw new Error('file_too_large');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  return {blob,width,height,hash};
 }finally{image.close();}
}
