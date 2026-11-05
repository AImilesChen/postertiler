import { cp, mkdir } from 'node:fs/promises';
for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await mkdir(`public/pdfjs/${folder}`, { recursive: true });
  await cp(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, { recursive: true });
}
await mkdir('third-party-licenses', { recursive: true });
await cp('node_modules/pdfjs-dist/LICENSE', 'third-party-licenses/pdfjs-dist-LICENSE.txt');
console.log('Prepared same-origin PDF.js support files.');
