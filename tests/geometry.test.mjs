import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, geometry, pagePlans, imagePlacement, sanitizeSettings, MM_PER_UNIT } from '../src/engine/geometry.ts';
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
test('PRD A: A4 overlap produces 390 x 564 mm and four pages', () => {
  const g = geometry(DEFAULTS); assert.equal(g.error, ''); assert.equal(g.count, 4); close(g.width, 390); close(g.height, 564);
  assert.deepEqual(pagePlans(g).map(p => p.label), ['A1', 'A2', 'B1', 'B2']);
});
test('PRD B: Letter exact canvas retains 400 x 500, not grid coverage', () => {
  const g = geometry({ ...DEFAULTS, paper: 'US Letter', mode: 'exact', margin: 6.35, overlap: 6.35, width: 400, height: 500 });
  assert.equal(g.error, ''); assert.equal(g.count, 4); close(g.width, 400); close(g.height, 500); close(g.coverageW, 400.05); close(g.coverageH, 527.05);
  const tail = pagePlans(g).at(-1); close(tail.width, 203.15); close(tail.height, 239.65);
});
test('PRD C: exact full-sheet boundaries do not create extra rows or columns', () => {
  const g = geometry({ ...DEFAULTS, mode: 'exact', width: 400, height: 574, overlap: 0 });
  assert.equal(g.count, 4); assert.ok(pagePlans(g).every(p => p.width > 0 && p.height > 0));
});
test('asymmetric margins, automatic landscape and A3 stay physical', () => {
  const g = geometry({ ...DEFAULTS, paper: 'A3', orientation: 'Automatic', imageRatio: 2, separateMargins: true, marginTop: 3, marginRight: 4, marginBottom: 7, marginLeft: 9 });
  close(g.pw, 420); close(g.ph, 297); close(g.printableW, 407); close(g.printableH, 287);
});
test('unit display and reversible conversions do not change the model', () => {
  for (const unit of Object.keys(MM_PER_UNIT)) {
    const g = geometry({ ...DEFAULTS, unit }); close(g.width, 390); close(g.height, 564);
    close(390 / MM_PER_UNIT[unit] * MM_PER_UNIT[unit], 390);
  }
});
test('Fit, Fill and PPI use the whole scaled image and preserve proportions', () => {
  const g = geometry({ ...DEFAULTS, mode: 'exact', width: 400, height: 500 });
  const fit = imagePlacement(g, 2000, 1000, 'fit'), fill = imagePlacement(g, 2000, 1000, 'fill');
  close(fit.width, 400); close(fit.height, 200); close(fit.y, 150); close(fit.ppi, 127);
  close(fill.width, 1000); close(fill.height, 500); close(fill.x, -300); close(fill.ppi, 50.8);
});
test('printed labels reserve a band before computing any page sizes', () => {
  const g = geometry({ ...DEFAULTS, labels: true }); close(g.printableH, 282); close(g.height, 554); assert.equal(g.labelBand, 5);
});
test('column-first order changes export order without changing placement or canvas', () => {
  const g = geometry({ ...DEFAULTS, pageOrder: 'column-major' });
  assert.deepEqual(pagePlans(g).map(p => p.label), ['A1', 'B1', 'A2', 'B2']); close(g.width, 390); close(g.height, 564);
});
test('Framed Grid includes mounting gaps and omits the corresponding image strips', () => {
  const g = geometry({ ...DEFAULTS, layoutMode: 'framed', gap: 10 });
  assert.equal(g.count, 4); close(g.width, 410); close(g.height, 584); close(g.overlap, 0);
  const plans = pagePlans(g); close(plans[1].x, 210); close(plans[2].y, 297);
  assert.ok(geometry({ ...DEFAULTS, layoutMode: 'framed', mode: 'exact' }).error);
  assert.ok(geometry({ ...DEFAULTS, layoutMode: 'framed', gap: -1 }).error);
});
test('invalid fields and unreasonable sheet counts stop before page iteration', () => {
  for (const values of [{ margin: 200 }, { overlap: 200 }, { overlap: -1 }, { columns: 1.2 }, { columns: '' }, { mode: 'exact', width: 0 }, { columns: 101, rows: 1 }, { paper: 'invalid' }, { margin: NaN }]) {
    const g = geometry({ ...DEFAULTS, ...values }); assert.ok(g.error); assert.throws(() => pagePlans(g));
  }
});
test('shared settings accept known fields without importing user-defined properties', () => {
  const s = sanitizeSettings({ paper: 'US Letter', width: 400, arbitrary: 'secret', labels: 'yes', imageRatio: 99 });
  assert.equal(s.paper, 'US Letter'); assert.equal(s.labels, false); assert.equal(s.arbitrary, undefined); assert.equal(s.imageRatio, undefined);
});
test('changing exact dimensions keeps tail sheets valid across paper configurations', () => {
  for (const paper of ['A4', 'US Letter', 'A3']) for (const orientation of ['Portrait', 'Landscape']) for (const overlap of [0, 6.35, 10]) for (const labels of [false, true]) {
    const g = geometry({ ...DEFAULTS, paper, orientation, overlap, labels, mode: 'exact', width: 800, height: 1100 });
    assert.equal(g.error, ''); const plans = pagePlans(g); assert.equal(plans.length, g.count);
    assert.ok(plans.every(p => p.width > 0 && p.height > 0 && p.x < g.width && p.y < g.height));
  }
});
