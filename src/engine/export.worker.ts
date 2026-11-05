/// <reference lib="webworker" />
import { normalizeImage } from './image.ts';
import { posterPdf } from './pdf.ts';
const worker = self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage = async ({ data }) => {
  try {
    worker.postMessage({ type: 'progress', page: 0, total: 0 });
    const jpeg = data.preservePng ? new Uint8Array(await data.blob.arrayBuffer()) : data.jpeg ? new Uint8Array(data.jpeg) : await normalizeImage(data.blob);
    const bytes = await posterPdf(jpeg, data.settings, (page, total) => worker.postMessage({ type: 'progress', page, total }), data.preservePng ? 'png' : 'jpeg');
    worker.postMessage({ type: 'complete', bytes }, [bytes.buffer]);
  } catch {
    // Do not send raw errors, source data or filenames across the UI boundary.
    worker.postMessage({ type: 'error', message: 'The PDF could not be prepared on this device. Try a smaller image or fewer sheets.' });
  }
};
