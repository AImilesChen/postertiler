import { LIMITS } from './geometry.ts';
export const PROCESSED_IMAGE_BYTES = 128 * 1024 * 1024;
export async function inspectFile(blob: Blob, maxBytes = LIMITS.bytes) {
  const limit = maxBytes === PROCESSED_IMAGE_BYTES ? PROCESSED_IMAGE_BYTES : LIMITS.bytes;
  if (blob.size > limit) throw new Error(limit === LIMITS.bytes ? 'This local tool supports files up to 32 MB. Choose a smaller image.' : 'The adjusted image is too large to export. Try a smaller source image.');
  const bytes = new Uint8Array(await blob.slice(0, 1024 * 1024).arrayBuffer());
  const v = new DataView(bytes.buffer);
  let width = 0, height = 0, mime = '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes.length >= 24) {
    mime = 'image/png'; width = v.getUint32(16); height = v.getUint32(20);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg';
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xff) { i++; continue; }
      if (marker === 1 || marker >= 0xd0 && marker <= 0xd8) { i += 2; continue; }
      const length = v.getUint16(i + 2);
      if (length < 2) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = v.getUint16(i + 5); width = v.getUint16(i + 7); break;
      }
      i += length + 2;
    }
  } else if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' && bytes.length >= 30) {
    mime = 'image/webp';
    const type = String.fromCharCode(...bytes.slice(12, 16));
    if (type === 'VP8X') { width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16); height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16); }
    if (type === 'VP8 ') { width = v.getUint16(26, true) & 0x3fff; height = v.getUint16(28, true) & 0x3fff; }
    if (type === 'VP8L') { const packed = v.getUint32(21, true); width = 1 + (packed & 0x3fff); height = 1 + ((packed >> 14) & 0x3fff); }
  }
  if (!mime) throw new Error('Choose a valid JPG, PNG or WebP image.');
  if (limit === PROCESSED_IMAGE_BYTES && mime !== 'image/png') throw new Error('Choose a valid processed PNG image.');
  if (!width || !height) throw new Error('We could not read the image dimensions. Try re-saving it as JPG or PNG.');
  validatePixels(width, height);
  return { width, height, mime };
}
export function validatePixels(width: number, height: number) {
  if (width * height > LIMITS.pixels || width > LIMITS.dimension || height > LIMITS.dimension)
    throw new Error('Choose an image up to 24 megapixels with neither side above 12,000 pixels.');
}
export async function normalizeImage(blob: Blob) {
  await inspectFile(blob);
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    validatePixels(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image decoding is not available on this device.');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, bitmap.width, bitmap.height); ctx.drawImage(bitmap, 0, 0);
    const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: .96 })).arrayBuffer());
    canvas.width = canvas.height = 1;
    return jpeg;
  } finally { bitmap.close(); }
}
