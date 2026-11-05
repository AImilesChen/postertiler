export function creativeJob(payload, cancel, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    if (cancel.current) { reject(new Error('canceled')); return; }
    const worker = new Worker(new URL('./engine/creative.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (result, failed = false) => {
      if (settled) return; settled = true; clearInterval(timer); clearTimeout(timeout); worker.terminate();
      failed ? reject(result) : resolve(result);
    };
    const timer = setInterval(() => { if (cancel.current) finish(new Error('canceled'), true); }, 25);
    const timeout = setTimeout(() => finish(new Error('Processing took too long. Try a smaller image or wider dot spacing.'), true), 120000);
    worker.onerror = () => finish(new Error('Image processing stopped. Try again with a smaller image.'), true);
    worker.onmessage = ({ data }) => {
      if (cancel.current) { finish(new Error('canceled'), true); return; }
      if (data.type === 'progress') onProgress(data.ratio);
      if (data.type === 'complete') finish(data);
      if (data.type === 'error') finish(new Error(data.message), true);
    };
    worker.postMessage(payload);
  });
}
