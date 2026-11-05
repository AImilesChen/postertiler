import { PDFDocument, PDFName, PDFString, StandardFonts, PrintScaling, rgb,
  pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib';
import { geometry, imagePlacement, pagePlans, pt, rowLabel, type Settings } from './geometry.ts';
const ink = rgb(.08, .08, .08), grey = rgb(.5, .5, .5);
async function document(title: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title); pdf.setAuthor(''); pdf.setSubject(''); pdf.setCreator('PosterTiler');
  pdf.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  return pdf;
}
export async function posterPdf(jpeg: Uint8Array, settings: Settings, progress: (page: number, total: number) => void = () => {}, format: 'jpeg' | 'png' = 'jpeg') {
  const g = geometry(settings), plans = pagePlans(g), pdf = await document('Printable poster');
  const image = format === 'png' ? await pdf.embedPng(jpeg) : await pdf.embedJpg(jpeg), font = await pdf.embedFont(StandardFonts.Helvetica);
  const placement = imagePlacement(g, image.width, image.height, settings.placement);
  pdf.catalog.set(PDFName.of('PageLabels'), pdf.context.obj({
    Nums: plans.flatMap(p => [p.index, pdf.context.obj({ P: PDFString.of(p.label) })]),
  }));
  for (const plan of plans) {
    const page = pdf.addPage([pt(g.pw), pt(g.ph)]);
    const left = g.margins.left, top = g.margins.top;
    // Clip to the exact finished canvas; the last sheet never enlarges it.
    page.pushOperators(pushGraphicsState(), rectangle(pt(left), pt(g.ph - top - plan.height), pt(plan.width), pt(plan.height)), clip(), endPath());
    page.drawImage(image, {
      x: pt(left + placement.x - plan.x), y: pt(g.ph - top - placement.y + plan.y - placement.height),
      width: pt(placement.width), height: pt(placement.height),
    });
    page.pushOperators(popGraphicsState());
    if (settings.labels) {
      const text = g.printableW >= 80 ? `${plan.label}  |  ${plan.index + 1} of ${g.count}  |  trim this guide band` : plan.label;
      const inset = Math.min(.7, g.printableW / 10);
      const size = Math.min(7, pt(g.printableW - 2 * inset) / font.widthOfTextAtSize(text, 1));
      page.drawText(text, { x: pt(left + inset), y: pt(g.ph - top - g.printableH - 3.3), size, font, color: ink });
    }
    if (settings.cutGuides) {
      // The edge itself is the trim reference; no diagonal lines across art.
      page.drawRectangle({ x: pt(left) + .125, y: pt(g.ph - top - plan.height) + .125, width: Math.max(0, pt(plan.width) - .25), height: Math.max(0, pt(plan.height) - .25),
        borderWidth: .25, borderColor: grey, borderDashArray: [2, 2] });
    }
    progress(plan.index + 1, g.count);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return pdf.save();
}
export async function calibrationPdf(settings: Settings) {
  const g = geometry(settings); if (g.error) throw new Error(g.error);
  const pdf = await document('Print calibration'), font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([pt(g.pw), pt(g.ph)]);
  page.drawText('Print calibration', { x: pt(20), y: pt(g.ph - 25), size: 17, font });
  ['Match the printer paper and orientation to this PDF.', 'Choose Actual Size / 100%. Turn off Fit to page.',
    'Measure both reference lines: each must be 100 mm.', 'If either differs, correct the print settings before continuing.',
    'Check that your printer can print within your chosen margins.'].forEach((text, i) =>
    page.drawText(text, { x: pt(20), y: pt(g.ph - 39 - i * 7), size: 9, font }));
  page.drawLine({ start: { x: pt(25), y: pt(g.ph - 92) }, end: { x: pt(125), y: pt(g.ph - 92) }, thickness: .7 });
  page.drawLine({ start: { x: pt(25), y: pt(g.ph - 92) }, end: { x: pt(25), y: pt(g.ph - 192) }, thickness: .7 });
  for (let i = 0; i <= 10; i++) {
    page.drawLine({ start: { x: pt(25 + i * 10), y: pt(g.ph - 92) }, end: { x: pt(25 + i * 10), y: pt(g.ph - 96) }, thickness: .5 });
    page.drawLine({ start: { x: pt(25), y: pt(g.ph - 92 - i * 10) }, end: { x: pt(29), y: pt(g.ph - 92 - i * 10) }, thickness: .5 });
  }
  page.drawText('100 mm / 10 cm', { x: pt(60), y: pt(g.ph - 104), size: 10, font });
  page.drawText('100 mm vertically', { x: pt(35), y: pt(g.ph - 185), size: 9, font });
  return pdf.save();
}
export async function assemblyPdf(settings: Settings) {
  const g = geometry(settings); pagePlans(g);
  const pdf = await document('Poster assembly map'), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let r0 = 0; r0 < g.rows; r0 += 10) for (let c0 = 0; c0 < g.columns; c0 += 10) {
    const page = pdf.addPage([pt(210), pt(297)]);
    const cols = Math.min(10, g.columns - c0), rows = Math.min(10, g.rows - r0);
    page.drawText('Poster assembly map', { x: pt(18), y: pt(277), size: 16, font });
    page.drawText(`${g.columns} across x ${g.rows} down | ${g.count} poster pages`, { x: pt(18), y: pt(266), size: 10, font });
    page.drawText(`Finished size: ${g.width.toFixed(2)} x ${g.height.toFixed(2)} mm`, { x: pt(18), y: pt(258), size: 10, font });
    const cw = Math.min(170 / cols, 152 / rows * g.pw / g.ph), ch = cw * g.ph / g.pw;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = 20 + c * cw, y = 247 - (r + 1) * ch;
      page.drawRectangle({ x: pt(x), y: pt(y), width: pt(cw - .7), height: pt(ch - .7), borderWidth: .5, borderColor: grey });
      page.drawText(`${rowLabel(r0 + r)}${c0 + c + 1}`, { x: pt(x + 1), y: pt(y + ch / 2), size: 8, font });
    }
    ['TOP is row A. A1 is always the top-left sheet.',
      g.pageOrder === 'column-major' ? 'Print order: top to bottom, then left to right.' : 'Print order: left to right, then top to bottom.',
      'Letters mark rows; numbers mark columns. Keep the map.',
      settings.labels ? 'Trim off the separate 5 mm printed-label band.' : 'PDF page labels match this map; print order starts at A1.',
      g.framed ? 'Trim all outside white margins on each panel.' : 'At joins, trim the left white margin of right-hand sheets',
      g.framed ? `Mount panels with ${g.gap} mm horizontal and vertical gaps.` : 'and the top white margin of lower sheets.',
      g.framed ? 'Image strips in the gaps are intentionally not printed.' : g.overlap ? `Align the ${g.overlap} mm repeated strips, overlay, then tape.` : 'Zero overlap: join trimmed edges and tape the back.',
      'Dashed outlines show printable/finished edges to trim.',
      'Trim the outside to the finished canvas, including Fit whitespace.',
      'Print poster pages at Actual Size / 100%. Test first.',
      'This diagram is a layout map, not a print-scale template.'].forEach((text, i) =>
        page.drawText(text, { x: pt(18), y: pt(80 - i * 6), size: 9, font }));
  }
  return pdf.save();
}
