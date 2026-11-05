export function documentJob(kind, payload, cancel, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./engine/tools.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (result, failed = false) => {
      if (settled) return; settled = true; clearInterval(timer); clearTimeout(timeout); worker.terminate();
      failed ? reject(result) : resolve(result);
    };
    const timer = setInterval(() => { if (cancel.current) finish(new Error('canceled'), true); }, 25);
    const timeout = setTimeout(() => finish(new Error('This local job took too long. Try fewer pages or a smaller file.'), true), 180000);
    worker.onerror = () => finish(new Error('Background processing stopped. Try a smaller file or restart the operation.'), true);
    worker.onmessage = ({ data }) => {
      if (cancel.current) { finish(new Error('canceled'), true); return; }
      if (data.type === 'progress') onProgress(data.page, data.total);
      if (data.type === 'complete') finish(data);
      if (data.type === 'error') finish(new Error(data.message), true);
    };
    worker.postMessage({ kind, ...payload });
  });
}
