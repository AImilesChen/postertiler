import {useEffect,useState} from 'react';
export default function useDither(source,options,edge,retry=0){
 const [state,setState]=useState({result:null,busy:false,error:'',progress:0});
 const key=JSON.stringify([source?.id,options,edge,retry]);
 useEffect(()=>{
  if(!source){setState({result:null,busy:false,error:'',progress:0});return;}
  let current=true,worker,url,timer,timeout;
  setState(previous=>({...previous,busy:true,error:'',progress:0}));
  function fail(message){if(!current)return;clearTimeout(timeout);worker?.terminate();setState(previous=>({...previous,busy:false,error:message}));}
  timer=setTimeout(()=>{
   try{
    worker=new Worker(new URL('./engine/dithering.worker.ts',import.meta.url),{type:'module'});
    timeout=setTimeout(()=>fail('Processing took too long. Try a smaller output size or a larger grain.'),90000);
    worker.onerror=()=>fail('Processing stopped. Retry, or choose a smaller image.');
    worker.onmessage=({data})=>{
     if(!current)return;
     if(data.type==='progress')setState(previous=>({...previous,progress:Math.round(data.ratio*100)}));
     if(data.type==='error')fail(data.message);
     if(data.type==='complete'){
      clearTimeout(timeout);worker.terminate();url=URL.createObjectURL(data.blob);
      setState({result:{...data,url,key},busy:false,error:'',progress:100});
     }
    };
    worker.postMessage({blob:source.blob,options,edge});
   }catch{fail('Use a current browser with background image processing support.');}
  },160);
  return()=>{current=false;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();if(url)URL.revokeObjectURL(url);};
 },[key]);
 return {...state,ready:state.result?.key===key&&!state.busy&&!state.error};
}
