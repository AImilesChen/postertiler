import { useCallback, useEffect, useRef, useState } from 'react';
export const CLOUD_API='/api/cloud/test';
export const activeJob = job => ['awaiting_upload','queued','processing'].includes(job.status);
export async function accountRequest(path,init={}) {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
  let result;try{result=await response.json();}catch{throw new Error('temporarily_unavailable');}
  if(!response.ok)throw new Error(result.error||'temporarily_unavailable');return result;
}
export function useCloudAccount() {
  const [state,setState]=useState({data:null,error:'',loading:true});
  const alive=useRef(true),pending=useRef(null);
  const refresh=useCallback(async()=>{
    if(pending.current)return pending.current.promise;
    const controller=new AbortController();
    const promise=(async()=>{try{
      const data=await accountRequest(CLOUD_API+'/status',{signal:controller.signal});
      if(!data.enabled||!data.balance||!Array.isArray(data.jobs))throw new Error('invalid_response');
      if(alive.current)setState({data,error:'',loading:false});return data;
    }catch(e){if(alive.current&&e.name!=='AbortError')setState(s=>({...s,error:e.message,loading:false}));}
    finally{if(pending.current?.controller===controller)pending.current=null;}})();
    pending.current={promise,controller};return promise;
  },[]);
  useEffect(()=>{
    alive.current=true;refresh();const update=()=>refresh();
    window.addEventListener('focus',update);window.addEventListener('cloud-updated',update);window.addEventListener('billing-updated',update);
    return()=>{alive.current=false;pending.current?.controller.abort();window.removeEventListener('focus',update);window.removeEventListener('cloud-updated',update);window.removeEventListener('billing-updated',update);};
  },[refresh]);
  useEffect(()=>{if(!state.data?.jobs.some(activeJob))return;const timer=setInterval(()=>{if(!document.hidden)refresh();},4000);return()=>clearInterval(timer);},[state.data,refresh]);
  return {...state,refresh};
}
export function useAccountListing(path,filter,page,version=0) {
  const [state,setState]=useState({data:null,error:'',loading:true});
  useEffect(()=>{const controller=new AbortController();let alive=true;setState(s=>({...s,error:'',loading:true}));
    if(!path)return()=>{alive=false;controller.abort();};
    accountRequest(`${path}?filter=${encodeURIComponent(filter)}&page=${page}`,{signal:controller.signal}).then(data=>{if(alive)setState({data,error:'',loading:false});}).catch(e=>{if(alive&&e.name!=='AbortError')setState({data:null,error:e.message,loading:false});});
    return()=>{alive=false;controller.abort();};
  },[path,filter,page,version]);return state;
}
