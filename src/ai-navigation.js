export const AI_UPSCALER_URL = '/tools/ai-image-upscaler';
export const AI_GENERATOR_URL = '/tools/ai-image-generator';
export const AI_EDITOR_URL = '/tools/ai-image-editor';
export const AI_PUBLIC_PAGES = Object.freeze({
 edit:{path:AI_EDITOR_URL,title:'AI Image Editor — Edit Images for Posters',description:'Upload an image, describe changes and compare the AI-edited result before making a printable poster. Optional one-time AI credits; currently invite-only.'},
 upscale:{path:AI_UPSCALER_URL,title:'AI Image Upscaler — Enlarge Images for Printing',description:'Enlarge images 2× or 4× with AI, compare real before-and-after results and prepare a printable poster. Optional credit-based cloud tool; currently invite-only.'},
 generate:{path:AI_GENERATOR_URL,title:'AI Image Generator for Posters',description:'Describe artwork, explore editable prompt ideas and create an AI image for a printable poster. Optional one-time AI credits; currently an invite-only pilot.'},
});
export const aiPublicTask = path => Object.keys(AI_PUBLIC_PAGES).find(task=>AI_PUBLIC_PAGES[task].path===path);
export const aiToolUrl = task => AI_PUBLIC_PAGES[task]?.path || aiTaskUrl(task);
export const AI_TASKS = Object.freeze({
  upscale: { title: 'AI Image Upscaler', verb: 'Enhance image', description: 'Increase image resolution without writing a prompt. Compare the result, then use it in your poster.' },
  generate: { title: 'AI Image Generator', verb: 'Generate image', description: 'Describe your artwork, create an image, then prepare its printable sheets.' },
  edit: { title: 'AI Image Editor', verb: 'Edit image', description: 'Choose an image and describe the changes you want to make.' },
});
export const aiTaskFromSearch = search => {
  const value = new URLSearchParams(search).get('task');
  return Object.hasOwn(AI_TASKS, value) ? value : 'upscale';
};
export const aiTaskUrl = task => `/account/ai?task=${Object.hasOwn(AI_TASKS, task) ? task : 'upscale'}`;
export const AI_CHANNEL = 'postertiler-ai-credits-v1';
export function notifyAiCredits(orderId, type = 'credits-updated') {
  window.dispatchEvent(new Event('ai-updated'));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(AI_CHANNEL);
    channel.postMessage({ type, orderId }); channel.close();
  }
}
