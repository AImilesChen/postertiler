import { PDFDocument, PDFName, PDFString, PDFObjectCopier, PDFStream, PDFDict, StandardFonts, PrintScaling, rgb, degrees,
  pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib';
import { pagePlans, pt, type Settings } from './geometry.ts';
import { imageSheetLayout, pdfGroups, type PdfInfo } from './tools-model.ts';
import { readPdf, ToolError } from './pdf-input.ts';
import { assemblyPdf } from './pdf.ts';
import { drawSheetLabel } from './print-labels.ts';
async function document(title: string) {
  const pdf = await PDFDocument.create(); pdf.setTitle(title); pdf.setCreator('PosterTiler');
  pdf.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None); return pdf;
}
export async function mergeJpegs(items: { jpeg: Uint8Array; rotation: number }[], settings: Settings, progress = (_page: number, _total: number) => {}) {
  const pdf = await document('Images to PDF');
  for (const [index, item] of items.entries()) {
    const image = await pdf.embedJpg(item.jpeg);
    const layout = imageSheetLayout(settings, image.width, image.height, item.rotation), g = layout.geometry, p = layout.placement;
    const page = pdf.addPage([pt(g.pw), pt(g.ph)]), x = g.margins.left + p.x, y = g.ph - g.margins.top - p.y - p.height;
    const scale = p.width / (item.rotation % 180 ? image.height : image.width);
    const dx = item.rotation === 180 || item.rotation === 270 ? p.width : 0;
    const dy = item.rotation === 90 || item.rotation === 180 ? p.height : 0;
    page.pushOperators(pushGraphicsState(), rectangle(pt(g.margins.left), pt(g.margins.bottom), pt(g.printableW), pt(g.printableH)), clip(), endPath());
    page.drawImage(image, { x: pt(x + dx), y: pt(y + dy), width: pt(image.width * scale), height: pt(image.height * scale), rotate: degrees(-item.rotation) });
    page.pushOperators(popGraphicsState()); progress(index + 1, items.length);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return pdf.save();
}
export async function tilePdf(bytes: Uint8Array, settings: Settings, range: string, percent: number, progress = (_page: number, _total: number) => {}) {
  const { pdf: source, info } = await readPdf(bytes); let model;
  try { model = pdfGroups(info, settings, range, percent); } catch (error) { throw new ToolError((error as Error).message); }
  const pdf = await document('Tiled PDF poster'), font = await pdf.embedFont(StandardFonts.Helvetica), nums: (number | PDFDict)[] = [];
  let done = 0;
  const sourcePages = model.groups.map(group => source.getPage(group.sourceIndex));
  for (const page of sourcePages) if (!page.node.Contents()) page.drawLine({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, opacity: 0, thickness: 0 });
  // One copier for all selected pages preserves shared fonts and other resources.
  const embeddedPages = await pdf.embedPages(sourcePages, model.groups.map(group => info.pages[group.sourceIndex].box), model.groups.map(group => info.pages[group.sourceIndex].matrix));
  for (const [groupIndex, group] of model.groups.entries()) {
    const input = info.pages[group.sourceIndex], g = group.geometry, sourcePage = source.getPage(group.sourceIndex);
    const embedded = embeddedPages[groupIndex];
    await embedded.embed();
    const groupObject = sourcePage.node.get(PDFName.of('Group'));
    if (groupObject) {
      const form = pdf.context.lookup(embedded.ref, PDFStream);
      form.dict.set(PDFName.of('Group'), PDFObjectCopier.for(source.context, pdf.context).copy(groupObject));
    }
    for (const tile of pagePlans(g)) {
      const page = pdf.addPage([pt(g.pw), pt(g.ph)]), label = `P${group.sourceIndex + 1}-${tile.label}`;
      nums.push(done, pdf.context.obj({ P: PDFString.of(label) }));
      page.pushOperators(pushGraphicsState(), rectangle(pt(g.margins.left), pt(g.ph - g.margins.top - tile.height), pt(tile.width), pt(tile.height)), clip(), endPath());
      page.drawPage(embedded, { x: pt(g.margins.left - tile.x), y: pt(g.ph - g.margins.top + tile.y - g.height), xScale: percent / 100, yScale: percent / 100 });
      page.pushOperators(popGraphicsState());
      if (settings.cutGuides) page.drawRectangle({ x: pt(g.margins.left) + .125, y: pt(g.ph - g.margins.top - tile.height) + .125,
        width: Math.max(0, pt(tile.width) - .25), height: Math.max(0, pt(tile.height) - .25), borderWidth: .25, borderColor: rgb(.5, .5, .5), borderDashArray: [2, 2] });
      drawSheetLabel(page, font, g, label, done, model.count);
      progress(++done, model.count); await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  pdf.catalog.set(PDFName.of('PageLabels'), pdf.context.obj({ Nums: nums }));
  return pdf.save();
}
export async function pdfAssembly(info: PdfInfo, settings: Settings, range: string, percent: number) {
  const model = pdfGroups(info, settings, range, percent), combined = await document('PDF poster assembly maps'), font = await combined.embedFont(StandardFonts.Helvetica);
  for (const group of model.groups) {
    const doc = await PDFDocument.load(await assemblyPdf(group.settings));
    for (const page of await combined.copyPages(doc, doc.getPageIndices())) {
      combined.addPage(page); page.drawText(`SOURCE PAGE ${group.sourceIndex + 1} | labels P${group.sourceIndex + 1}-A1, P${group.sourceIndex + 1}-A2...`, { x: pt(18), y: pt(288), size: 8, font });
    }
  }
  return combined.save();
}
