import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;
export function openPdf(bytes) {
  return getDocument({ data: bytes, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/',
    enableXfa: false, isEvalSupported: false, verbosity: 0, stopAtErrors: true, maxImageSize: 24_000_000,
    canvasMaxAreaInBytes: 32 * 1024 * 1024, useSystemFonts: true });
}
