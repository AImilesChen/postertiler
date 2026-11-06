// Scene coordinates are finished-poster millimetres. The person and poster
// share a baseline and one display scale, including at every preview zoom.
export const REFERENCE_HEIGHT_MM = 1800;
export function sizeReferenceScene(width: number, height: number) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0))
    throw new Error('A size reference needs positive finished poster dimensions.');
  const person = { x: -655, y: height - REFERENCE_HEIGHT_MM, width: 495, height: REFERENCE_HEIGHT_MM };
  return { person, bounds: { x: person.x, y: Math.min(0, person.y), width: width - person.x, height: Math.max(height, REFERENCE_HEIGHT_MM) } };
}
