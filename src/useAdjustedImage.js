import { useEffect, useRef, useState } from 'react';
import { creativeJob } from './creative-job';
import { FULL_CROP } from './engine/creative.ts';
import { isOriginalTreatment } from './engine/image-adjustments.ts';
import { inspectFile, PROCESSED_IMAGE_BYTES } from './engine/image.ts';

export default function useAdjustedImage(source, treatment) {
  const [result,setResult] = useState(null),[job,setJob] = useState(null),[attempt,setAttempt] = useState(0);
  const current = useRef(null), neutral = isOriginalTreatment(treatment);
  const key = JSON.stringify([source,treatment]);
  useEffect(() => {
    if (!source || neutral) { setResult(null); setJob(null); current.current = null; return; }
    const run = { key, cancel: {current:false}, controller:new AbortController(), timer:null };
    current.current = run; setJob({key,phase:'waiting'});
    run.timer = setTimeout(async () => {
      try {
        setJob({key,phase:'processing'});
        const response = await fetch(source,{signal:run.controller.signal});
        if (!response.ok) throw new Error('The image could not be read. Choose it again.');
        const blob = await response.blob();
        if (run.cancel.current) return;
        const {brightness,contrast,saturation,warmth,hue,effect,cell,colour,invert} = treatment;
        const output = await creativeJob({blob,crop:FULL_CROP,adjustments:{brightness,contrast,saturation,warmth,hue},
          options:effect==='original'?null:{effect,cell,colour,invert,contrast:1}},run.cancel);
        await inspectFile(output.blob,PROCESSED_IMAGE_BYTES);
        if (current.current !== run || run.cancel.current) return;
        setResult({source,key,url:URL.createObjectURL(output.blob),width:output.width,height:output.height});
        setJob({key,phase:'ready'});
      } catch(error) {
        if (current.current !== run) return;
        setJob({key,phase:run.cancel.current?'canceled':'failed',error:run.cancel.current?'':error.message});
      }
    },280);
    return () => { clearTimeout(run.timer);run.cancel.current=true;run.controller.abort(); };
  },[source,key,neutral,attempt]);
  useEffect(() => { if (!result) return;return () => URL.revokeObjectURL(result.url); },[result]);
  const ready = !!source && (neutral || result?.key===key);
  const phase = neutral || !source ? 'ready' : ready ? 'ready' : job?.key===key ? job.phase : 'waiting';
  return {
    url:neutral?source:result?.source===source?result.url:source,
    ready, edited:!neutral, phase, error:job?.key===key?job.error:'',
    cancel:()=>{const run=current.current;if(!run)return;clearTimeout(run.timer);run.cancel.current=true;run.controller.abort();setJob({key:run.key,phase:'canceled'});},
    retry:()=>setAttempt(value=>value+1),
  };
}
