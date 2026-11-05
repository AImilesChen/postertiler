import { DEFAULTS, geometry, imagePlacement, LIMITS, type Settings } from './geometry.ts';
export const TOOL_LIMITS = { pdfBytes: 64 * 1024 * 1024, sourcePages: 100, images: 20, mergeBytes: 64 * 1024 * 1024, mergePixels: 48_000_000 };
export interface PdfPageInfo {
  index: number; widthMm: number; heightMm: number; rotation: number; userUnit: number;
  box: { left: number; bottom: number; right: number; top: number };
  matrix: [number, number, number, number, number, number];
  unsupportedAnnotations: boolean; links: boolean;
}
export interface PdfInfo { pages: PdfPageInfo[]; unembeddedFonts: boolean; }
export function pageSelection(value: string, count: number) {
  if (!value.trim()) throw new Error('Choose at least one source page. Use numbers or ranges, such as 1, 3-5.');
  const selected = new Set<number>();
  for (const part of value.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use source page numbers or ranges, such as 1, 3-5.');
    const first = Number(match[1]), last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > count) throw new Error(`Choose source pages between 1 and ${count}, using ascending ranges.`);
    for (let i = first; i <= last; i++) selected.add(i - 1);
  }
  return [...selected];
}
export function pdfGroups(info: PdfInfo, settings: Settings, range: string, percent: number) {
  if (!Number.isFinite(percent) || percent < 1 || percent > 1000) throw new Error('Enter a scale between 1% and 1000%. Actual Size is 100%.');
  const indices = pageSelection(range, info.pages.length);
  const groups = indices.map(index => {
    const page = info.pages[index];
    if (page.unsupportedAnnotations) throw new Error(`Source page ${index + 1} has printable annotations or form fields. Flatten them in a PDF editor before tiling it.`);
    const resolved: Settings = { ...settings, mode: 'exact', width: page.widthMm * percent / 100, height: page.heightMm * percent / 100, imageRatio: page.widthMm / page.heightMm, placement: 'fit' };
    const g = geometry(resolved); if (g.error) throw new Error(g.error);
    return { sourceIndex: index, settings: resolved, geometry: g };
  });
  const count = groups.reduce((sum, group) => sum + group.geometry.count, 0);
  if (count > LIMITS.pages) throw new Error(`The selected source pages need ${count} sheets. Use ${LIMITS.pages} or fewer by selecting fewer source pages or a smaller scale.`);
  return { groups, count };
}
export const MERGE_DEFAULTS: Settings = { ...DEFAULTS, columns: 1, rows: 1, overlap: 0, labels: false, orientation: 'Automatic' };
export function imageSheetLayout(settings: Settings, width: number, height: number, rotation: number) {
  if (![0, 90, 180, 270].includes(rotation)) throw new Error('Choose a quarter-turn image rotation.');
  const rotated = rotation % 180 !== 0;
  const rw = rotated ? height : width, rh = rotated ? width : height;
  const g = geometry({ ...settings, mode: 'sheets', columns: 1, rows: 1, overlap: 0, labels: false, imageRatio: rw / rh });
  if (g.error) throw new Error(g.error);
  return { geometry: g, placement: imagePlacement(g, rw, rh, settings.placement), rotation, width, height };
}
