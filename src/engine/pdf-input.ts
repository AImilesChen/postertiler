import { PDFDocument, PDFName, PDFNumber, PDFDict, PDFArray, PDFStream } from 'pdf-lib';
import { TOOL_LIMITS, type PdfInfo, type PdfPageInfo } from './tools-model.ts';
export class ToolError extends Error {}
export async function readPdf(bytes: Uint8Array) {
  if (bytes.byteLength > TOOL_LIMITS.pdfBytes) throw new ToolError('Choose a PDF of 64 MB or less for local processing.');
  const header = new TextDecoder('latin1').decode(bytes.slice(0, 1024));
  if (!header.includes('%PDF-')) throw new ToolError('Choose a valid PDF file.');
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }); }
  catch (error) {
    if (String(error).includes('encrypted')) throw new ToolError('Password-protected or encrypted PDFs are not supported. Save an unencrypted copy you are allowed to use.');
    throw new ToolError('This PDF could not be read. Re-save it as a standard PDF and try again.');
  }
  if (pdf.isEncrypted) throw new ToolError('Choose an unencrypted PDF.');
  if (!pdf.getPageCount() || pdf.getPageCount() > TOOL_LIMITS.sourcePages) throw new ToolError('Choose a PDF with 1 to 100 source pages.');
  if (pdf.catalog.has(PDFName.of('OCProperties'))) throw new ToolError('This PDF uses optional layers. Flatten the visible layers in a PDF editor before tiling it.');
  const pages: PdfPageInfo[] = [];
  for (const [index, page] of pdf.getPages().entries()) {
    const media = page.getMediaBox(), crop = page.getCropBox();
    const left = Math.max(media.x, crop.x), bottom = Math.max(media.y, crop.y);
    const right = Math.min(media.x + media.width, crop.x + crop.width), top = Math.min(media.y + media.height, crop.y + crop.height);
    const w = right - left, h = top - bottom;
    const unitObject = page.node.lookupMaybe(PDFName.of('UserUnit'), PDFNumber), userUnit = unitObject?.asNumber() ?? 1;
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(rotation) || !Number.isFinite(w + h + userUnit) || w <= 0 || h <= 0 || userUnit <= 0 || userUnit > 75000)
      throw new ToolError(`Source page ${index + 1} has unsupported page dimensions or rotation.`);
    const u = userUnit;
    const matrix: PdfPageInfo['matrix'] = rotation === 90 ? [0, -u, u, 0, -u * bottom, u * right] :
      rotation === 180 ? [-u, 0, 0, -u, u * right, u * top] :
      rotation === 270 ? [0, u, -u, 0, u * top, -u * left] : [u, 0, 0, u, -u * left, -u * bottom];
    let unsupportedAnnotations = false, links = false;
    const annotations = page.node.Annots();
    for (let i = 0; annotations && i < annotations.size(); i++) {
      const annotation = annotations.lookup(i, PDFDict);
      if (annotation.get(PDFName.of('Subtype'))?.toString() === '/Link') links = true;
      else unsupportedAnnotations = true;
    }
    pages.push({ index, widthMm: (rotation % 180 ? h : w) * u * 25.4 / 72, heightMm: (rotation % 180 ? w : h) * u * 25.4 / 72,
      rotation, userUnit, box: { left, bottom, right, top }, matrix, unsupportedAnnotations, links });
  }
  let unembeddedFonts = false;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (object instanceof PDFStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
      const width = object.dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() || 0;
      const height = object.dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() || 0;
      if (width * height > 24_000_000) throw new ToolError('This PDF contains an image above the local 24 MP safety limit. Reduce that image before importing.');
    }
    if (object instanceof PDFDict && object.get(PDFName.of('Type'))?.toString() === '/Font') {
      if (object.get(PDFName.of('Subtype'))?.toString() === '/Type3') continue;
      let descriptor = object.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      const descendants = object.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
      if (!descriptor && descendants?.size()) descriptor = descendants.lookup(0, PDFDict).lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      if (!descriptor || !['FontFile', 'FontFile2', 'FontFile3'].some(key => descriptor!.has(PDFName.of(key)))) unembeddedFonts = true;
    }
  }
  return { pdf, info: { pages, unembeddedFonts } satisfies PdfInfo };
}
