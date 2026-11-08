import { rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { pt, type Geometry } from './geometry.ts';

// This band is part of geometry, outside both the artwork and printer margins.
export function sheetLabelText(label: string, index: number, count: number) {
  return `${label}  |  Page ${index + 1} / ${count}  |  TOP`;
}
export function drawSheetLabel(page: PDFPage, font: PDFFont, g: Geometry, label: string, index: number, count: number) {
  if (!g.labelBand) return;
  const ink = rgb(.08, .08, .08), x = pt(g.margins.left), bottom = pt(g.ph - g.margins.top - g.printableH - g.labelBand);
  const available = pt(g.printableW), inset = Math.min(pt(1), available / 12);
  const text = sheetLabelText(label, index, count);
  const size = Math.min(9, (available - 2 * inset) / (font.widthOfTextAtSize(text, 1) + 1.1));
  const width = font.widthOfTextAtSize(text, size), baseline = bottom + (pt(g.labelBand) - font.heightAtSize(size, { descender: false })) / 2;
  page.drawText(text, { x: x + inset, y: baseline, size, font, color: ink });
  const arrowX = x + inset + width + size * .55, arrowTop = baseline + size * .85, arrowBottom = baseline;
  const line = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: Math.min(.8, size / 10), color: ink });
  line(arrowX, arrowBottom, arrowX, arrowTop);
  line(arrowX, arrowTop, arrowX - size * .22, arrowTop - size * .28);
  line(arrowX, arrowTop, arrowX + size * .22, arrowTop - size * .28);
}
