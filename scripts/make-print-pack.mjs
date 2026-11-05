import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { DEFAULTS } from '../src/engine/geometry.ts';
import { posterPdf, calibrationPdf, assemblyPdf } from '../src/engine/pdf.ts';
const directory = 'verification/print-acceptance'; await mkdir(directory, { recursive: true });
const jpeg = new Uint8Array(await readFile('tests/fixtures/grid.jpg'));
const cases = [
  ['A-A4-overlap', { ...DEFAULTS }],
  ['B-Letter-exact', { ...DEFAULTS, paper: 'US Letter', mode: 'exact', margin: 6.35, overlap: 6.35, width: 400, height: 500, placement: 'fill', locked: false }],
  ['C-A4-zero-overlap', { ...DEFAULTS, mode: 'exact', overlap: 0, width: 400, height: 574, locked: false }],
];
for (const [id, settings] of cases) {
  await writeFile(`${directory}/${id}-poster.pdf`, await posterPdf(jpeg, settings));
  await writeFile(`${directory}/${id}-calibration.pdf`, await calibrationPdf(settings));
  await writeFile(`${directory}/${id}-assembly.pdf`, await assemblyPdf(settings));
}
console.log('Prepared three print cases with separate posters, calibration pages and assembly maps. Physical verification remains unexecuted.');
