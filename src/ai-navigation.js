export const AI_UPSCALER_URL = '/tools/ai-image-upscaler';
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
