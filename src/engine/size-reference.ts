// Head-to-sole alpha bounds define human height, excluding PNG margins.
export const REFERENCE_HEIGHT_MM = 1800;
export const REFERENCE_ART = {
  src: '/assets/reference/person-profile-v2.png', width: 887, height: 1774,
  bounds: { x: 179, y: 44, width: 449, height: 1691 },
};
export const REFERENCE_WIDTH_MM = REFERENCE_HEIGHT_MM * REFERENCE_ART.bounds.width / REFERENCE_ART.bounds.height;

// Fit the poster first, then use that same millimetre-to-pixel scale. The
// person starts at the poster top and may be clipped by the preview frame.
export function sizeReferenceScene(width: number, height: number, fitScale = 1, gapPixels = 32) {
  if (![width, height, fitScale].every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(gapPixels) || gapPixels < 0)
    throw new Error('A size reference needs positive finished poster dimensions.');
  const person = { x: -REFERENCE_WIDTH_MM - gapPixels / fitScale, y: 0, width: REFERENCE_WIDTH_MM, height: REFERENCE_HEIGHT_MM };
  return { person, bounds: { x: 0, y: 0, width, height } };
}
