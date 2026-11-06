import React from 'react';
import { CircleNotch,CheckCircle,WarningCircle } from '@phosphor-icons/react';
import { aiJobFeedback } from './ai-job-state';

export default function AiJobStatus({job,onRefresh,onOpenResult,hasResult,busy=false}){
 const state=aiJobFeedback(job);if(!state)return null;
 const Icon=state.tone==='working'?CircleNotch:state.tone==='success'?CheckCircle:WarningCircle;
 return <div className={'ai-job-feedback '+state.tone} role={state.tone==='error'?'alert':'status'} aria-live="polite"><Icon size={23} className={state.tone==='working'?'ai-spinning':''} aria-hidden="true"/><div><strong>{state.title}</strong><p>{state.description}</p>{state.creditText&&<small>{state.creditText}</small>}{state.tone==='working'&&<ol className="ai-job-stages" aria-label="Task progress">{['Upload','Queue','Enhance','Ready'].map((label,index)=><li key={label} aria-current={state.step===index+1?'step':undefined} className={state.step>=index+1?'reached':''}>{label}</li>)}</ol>}<div className="ai-job-actions">{job.can_download&&!hasResult&&onOpenResult&&<button disabled={busy} onClick={onOpenResult}>Open enhanced image</button>}{onRefresh&&<button disabled={busy} onClick={onRefresh}>Refresh task status</button>}</div></div></div>;
}
