/// <reference lib="webworker" />
import { normalizeImage, inspectFile } from './image.ts';
import { readPdf, ToolError } from './pdf-input.ts';
import { mergeJpegs, tilePdf } from './document-tools.ts';
import { TOOL_LIMITS } from './tools-model.ts';
const worker = self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage = async ({ data }) => {
  try {
    if (data.kind === 'inspect-pdf') {
      const { info } = await readPdf(new Uint8Array(await data.file.arrayBuffer()));
      worker.postMessage({ type: 'complete', info }); return;
    }
    const progress = (page: number, total: number) => worker.postMessage({ type: 'progress', page, total });
    let bytes: Uint8Array;
    if (data.kind === 'merge-images') {
      if (!Array.isArray(data.items) || !data.items.length || data.items.length > TOOL_LIMITS.images) throw new ToolError('Choose between 1 and 20 images.');
      if (data.items.reduce((sum: number, item: { file: Blob }) => sum + item.file.size, 0) > TOOL_LIMITS.mergeBytes) throw new ToolError('Keep the selected files within 64 MB in total.');
      const items = []; let pixels = 0;
      for (const [index, item] of data.items.entries()) {
        progress(index, data.items.length * 2);
        const size = await inspectFile(item.file); pixels += size.width * size.height;
        if (pixels > TOOL_LIMITS.mergePixels) throw new ToolError('Keep the selected images within 48 megapixels in total.');
        items.push({ jpeg: await normalizeImage(item.file), rotation: item.rotation });
      }
      bytes = await mergeJpegs(items, data.settings, (page, total) => progress(total + page, total * 2));
    } else if (data.kind === 'tile-pdf') {
      bytes = await tilePdf(new Uint8Array(await data.file.arrayBuffer()), data.settings, data.range, data.percent, progress);
    } else throw new ToolError('Unknown document operation.');
    worker.postMessage({ type: 'complete', bytes }, [bytes.buffer]);
  } catch (error) {
    worker.postMessage({ type: 'error', message: error instanceof ToolError ? error.message : 'This document could not be prepared. Check the file and settings, or try a smaller file.' });
  }
};
