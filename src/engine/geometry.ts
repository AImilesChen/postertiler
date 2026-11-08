export const MM_PER_UNIT = { mm: 1, cm: 10, in: 25.4 } as const;
export type Unit = keyof typeof MM_PER_UNIT;
export interface Settings {
  paper: 'A4' | 'US Letter' | 'A3'; orientation: 'Portrait' | 'Landscape' | 'Automatic';
  unit: Unit; margin: number; overlap: number;
  separateMargins?: boolean; marginTop?: number; marginRight?: number; marginBottom?: number; marginLeft?: number;
  mode: 'sheets' | 'exact'; columns: number; rows: number; width: number; height: number;
  placement: 'fit' | 'fill'; locked: boolean; cutGuides: boolean; labels: boolean; imageRatio?: number;
  pageOrder: 'row-major' | 'column-major';
  layoutMode: 'continuous' | 'framed'; gap: number;
}
export const LIMITS = { bytes: 32 * 1024 * 1024, pixels: 24_000_000, dimension: 12000, pages: 100 };
export const DEFAULTS: Settings = {
  paper: 'A4', orientation: 'Portrait', unit: 'cm', margin: 5, overlap: 10,
  mode: 'sheets', columns: 2, rows: 2, width: 390, height: 564,
  placement: 'fit', locked: true, cutGuides: true, labels: false, pageOrder: 'row-major', layoutMode: 'continuous', gap: 10,
};
// New print jobs opt in to physical assembly labels. DEFAULTS stays stable for
// previously shared settings, saved gallery plans and documented no-label cases.
export const PRINT_DEFAULTS: Settings = { ...DEFAULTS, labels: true };
const numeric = (v: unknown) => v === '' || v === null || v === undefined ? NaN : Number(v);
export const pt = (mm: number) => mm * 72 / 25.4;
export function geometry(s: Settings, pageLimit = LIMITS.pages) {
  let error = '';
  const papers = { A4: [210, 297], 'US Letter': [215.9, 279.4], A3: [297, 420] };
  let [pw, ph] = papers[s.paper] || papers.A4;
  if (!papers[s.paper]) error = 'Choose A4, US Letter or A3 paper.';
  if (!['Portrait', 'Landscape', 'Automatic'].includes(s.orientation)) error = 'Choose a supported orientation.';
  const ratio = s.imageRatio || (s.mode === 'exact' ? s.width / s.height : s.columns / s.rows);
  if (s.orientation === 'Landscape' || (s.orientation === 'Automatic' && ratio > 1)) [pw, ph] = [ph, pw];
  const margins = {
    top: numeric(s.separateMargins ? s.marginTop ?? s.margin : s.margin),
    right: numeric(s.separateMargins ? s.marginRight ?? s.margin : s.margin),
    bottom: numeric(s.separateMargins ? s.marginBottom ?? s.margin : s.margin),
    left: numeric(s.separateMargins ? s.marginLeft ?? s.margin : s.margin),
  };
  // Printed annotations have a removable band; they never cover the artwork.
  const labelBand = s.labels ? 5 : 0;
  const printableW = pw - margins.left - margins.right;
  const printableH = ph - margins.top - margins.bottom - labelBand;
  const framed = s.layoutMode === 'framed', gap = framed ? numeric(s.gap) : 0;
  const o = framed ? 0 : numeric(s.overlap);
  if (Object.values(margins).some(v => !Number.isFinite(v) || v < 0) || printableW <= 0 || printableH <= 0) error = 'These margins leave no printable area. Reduce them or choose a larger paper size.';
  if (!Number.isFinite(o) || o < 0 || o >= printableW || o >= printableH) error = 'Enter an overlap of zero or more, smaller than the printable width and height.';
  if (framed && (!Number.isFinite(gap) || gap < 0 || gap >= Math.min(printableW, printableH))) error = 'Enter a panel gap of zero or more, smaller than the panel width and height.';
  if (s.layoutMode && !['continuous', 'framed'].includes(s.layoutMode)) error = 'Choose a continuous poster or Framed Grid.';
  let columns = numeric(s.columns), rows = numeric(s.rows), width: number, height: number;
  if (s.mode === 'exact') {
    if (framed) error = 'Framed Grid uses sheet counts. Choose Sheets, or switch to a continuous poster for exact dimensions.';
    width = numeric(s.width); height = numeric(s.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) error = 'Enter a width and height greater than zero.';
    columns = Math.max(1, Math.ceil((width - o) / (printableW - o) - 1e-9));
    rows = Math.max(1, Math.ceil((height - o) / (printableH - o) - 1e-9));
  } else {
    if (s.mode !== 'sheets') error = 'Choose Sheets or Exact size.';
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) error = 'Enter a whole number of at least 1 for each sheet count.';
    width = columns * printableW + (columns - 1) * (framed ? gap : -o);
    height = rows * printableH + (rows - 1) * (framed ? gap : -o);
  }
  if (!['fit', 'fill'].includes(s.placement)) error = 'Choose Fit or Fill.';
  if (s.pageOrder && !['row-major', 'column-major'].includes(s.pageOrder)) error = 'Choose a supported page order.';
  const count = columns * rows;
  if (!error && (!Number.isFinite(count) || count > pageLimit)) error = `Use ${pageLimit} poster sheets or fewer for this export.`;
  return { pw, ph, margins, printableW, printableH, labelBand, columns, rows, width, height,
    count, overlap: o, framed, gap, stepW: printableW + (framed ? gap : -o), stepH: printableH + (framed ? gap : -o), pageOrder: s.pageOrder || 'row-major',
    coverageW: columns * printableW + (columns - 1) * (framed ? gap : -o),
    coverageH: rows * printableH + (rows - 1) * (framed ? gap : -o), error };
}
export type Geometry = ReturnType<typeof geometry>;
export function imagePlacement(g: Geometry, width: number, height: number, placement: string) {
  const scale = placement === 'fill' ? Math.max(g.width / width, g.height / height) : Math.min(g.width / width, g.height / height);
  const iw = width * scale, ih = height * scale;
  return { x: (g.width - iw) / 2, y: (g.height - ih) / 2, width: iw, height: ih, ppi: 25.4 / scale };
}
export function pagePlans(g: Geometry) {
  if (g.error) throw new Error(g.error);
  const plans = Array.from({ length: g.count }, (_, index) => {
    const row = Math.floor(index / g.columns), col = index % g.columns;
    const x = col * g.stepW, y = row * g.stepH;
    return { index, row, col, label: `${rowLabel(row)}${col + 1}`, x, y,
      width: Math.min(g.printableW, g.width - x), height: Math.min(g.printableH, g.height - y) };
  });
  if (g.pageOrder === 'column-major') plans.sort((a, b) => a.col - b.col || a.row - b.row);
  return plans.map((page, index) => ({ ...page, index }));
}
export function rowLabel(row: number) {
  let result = '';
  for (let i = row + 1; i > 0; i = Math.floor((i - 1) / 26)) result = String.fromCharCode(65 + (i - 1) % 26) + result;
  return result;
}
export const formatMeasure = (v: number, unit: Unit = 'cm') => (v / MM_PER_UNIT[unit]).toLocaleString('en-US', { maximumFractionDigits: unit === 'in' ? 2 : 1, minimumFractionDigits: unit === 'cm' ? 1 : 0 });
export const sizeText = (g: Geometry, unit: Unit) => `${formatMeasure(g.width, unit)} × ${formatMeasure(g.height, unit)} ${unit}`;
export function sanitizeSettings(input: unknown): Settings {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const result = { ...DEFAULTS } as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS)) if (key in value && typeof value[key] === typeof result[key]) result[key] = value[key];
  if (typeof value.separateMargins === 'boolean') result.separateMargins = value.separateMargins;
  for (const key of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']) if (typeof value[key] === 'number') result[key] = value[key];
  return result as unknown as Settings;
}
