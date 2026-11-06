export const activeAi = job => ['awaiting_upload','queued','submitting','processing'].includes(job.status);
export const aiMessage = code => ({
 request_closed:'That attempt has ended. Check its history, then start a new task if needed.',
 pilot_access_required:'AI sandbox is currently limited to invited testers. Free local tools remain available.',
 ai_unavailable:'AI tools are not enabled yet. Your free local tools are available.',
 moderation_unavailable:'Safety checks are temporarily unavailable. This task stopped without delivering an unchecked image. Your reserved credits were returned.',
 moderation_limit:'Safety checks have reached their current limit. Try later; your reserved credits were returned.',
 moderation_consent_required:'The safety-check disclosure has changed. Refresh this page and confirm the updated processing permission before starting a new task.',
 moderation_prompt_blocked:'This prompt did not pass our content safety checks. Try a different subject. Your credits were returned.',
 moderation_source_blocked:'This source image did not pass our content safety checks. Choose another image. Your credits were returned.',
 moderation_output_blocked:'The AI result did not pass our content safety checks and cannot be viewed or downloaded. Your credits were returned.',
 insufficient_ai_credits:'You need more AI credits for this task.',
 task_limit:'Finish or cancel your current AI task, or try again later.',
 daily_budget_reached:'AI processing has reached its daily limit. Your reserved credits were returned.',
 submission_uncertain:'The model submission could not be confirmed. Automatic retries stopped; your credits were returned.',
 provider_submit_timeout:'The model service did not confirm the request in time. Automatic retries stopped; your credits were returned.',
 provider_submit_connection:'The connection to the model service was interrupted. Automatic retries stopped; your credits were returned.',
 provider_redirect_blocked:'The model service returned an unexpected response. We stopped this task and returned your credits.',
 provider_submit_receipt:'The model service returned an invalid submission receipt. Automatic retries stopped; your credits were returned.',
 provider_submit_unavailable:'The model service could not accept the submission right now. Your credits were returned.',
 provider_rejected:'The model service rejected this task. Your credits were returned.',
 provider_failed:'The model service could not complete this task. Your credits were returned.',
 source_mismatch:'The upload did not match. Retry with the same image or cancel this task.',
 output_size_mismatch:'The result did not match the requested dimensions. Your credits were returned.',
 result_expired:'This download has expired. A new generation requires a new task.',
 invalid_result:'The image could not be verified. Your credits were returned.',
 task_timeout:'This task timed out. Your reserved credits were returned.',
 credit_revoked:'The reserved credits are no longer available. No result was charged.',
 output_too_large:'Choose a lower multiplier. This release supports results up to 24 MP.',
 file_too_large:'This working image is too large. Choose a smaller file.',
 sign_in_required:'Sign in to use optional AI processing.'
}[code] || 'We could not finish this request. Refresh the status before starting another task.');

export function aiJobFeedback(job) {
 if(!job)return null;
 const noun=job.kind==='upscale'?'Enhancement':'AI image',credits=Number(job.credits)||0;
 const states={
  preparing:{tone:'working',title:'Preparing your image',description:'Preparing a working copy before uploading. Keep this tab open.',step:0},
  awaiting_upload:{tone:'working',title:'Uploading your image',description:'Sending the working copy for this task. Your original stays unchanged.',step:1},
  queued:{tone:'working',title:'Checking content and queuing',description:'Checking your input before sending it to the AI model. The task will continue automatically if it passes.',step:2},
  submitting:{tone:'working',title:'Contacting the model service',description:'Confirming this task with the model service. Do not start another request.',step:2},
  processing:{tone:'working',title:job.kind==='upscale'?'Enhancing and checking your image':'Creating and checking your AI image',description:'Processing your image and checking the result for safety. A verified result will appear here automatically.',step:3},
  succeeded:{tone:'success',title:noun+' complete',description:'Your image is ready. Open the result, compare the details and download or use it in your poster.',step:4},
  failed:{tone:'error',title:noun+' failed',description:aiMessage(job.error)+' No result is available for this task.',step:null},
  canceled:{tone:'neutral',title:'Task canceled',description:'This task was canceled. Your original image is unchanged.',step:null},
  expired:{tone:'neutral',title:'Result availability ended',description:'Website copies expire after 24 hours. Previously downloaded files remain on your device.',step:null},
 };
 const state=states[job.status]||{tone:'neutral',title:'Check task status',description:'Refresh the task status before starting again.',step:null};
 return {...state,creditText:activeAi(job)?`${credits} AI credits reserved; charged only after a verified result.`:job.status==='failed'||job.status==='canceled'?`${credits} AI credits released. No credits used for this task.`:job.status==='succeeded'?`${credits} AI credits used. Download this result again at no extra cost.`:''};
}
