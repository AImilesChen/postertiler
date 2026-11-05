import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, geometry, pagePlans } from '../src/engine/geometry.ts';
import { previewPlan } from '../src/engine/preview.ts';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('10 mm printer margins do not become gaps in the assembled 370 x 544 mm poster', () => {
  const g = geometry({ ...DEFAULTS, margin: 10 });
  const p = previewPlan(g, { width: 370, height: 544 }, 'fit');
  assert.deepEqual(p.canvas, { x: 0, y: 0, width: 370, height: 544 });
  assert.equal(p.gaps.length, 0);
  assert.deepEqual(p.overlaps, [{ x: 180, y: 0, width: 10, height: 544 }, { x: 0, y: 267, width: 370, height: 10 }]);
  assert.deepEqual(p.pages[0].paper, { x: -10, y: -10, width: 210, height: 297 });
  assert.deepEqual(p.pages[1].paper, { x: 170, y: -10, width: 210, height: 297 });
});
test('preview page locations, label bands and tails match PDF plans across paper configurations', () => {
  for (const paper of ['A4', 'US Letter', 'A3']) for (const orientation of ['Portrait', 'Landscape']) for (const labels of [false, true]) {
    const g = geometry({ ...DEFAULTS, paper, orientation, labels, mode: 'exact', width: 400, height: 500,
      separateMargins: true, marginLeft: 3, marginRight: 9, marginTop: 4, marginBottom: 12, pageOrder: 'column-major' });
    const p = previewPlan(g, { width: 800, height: 1000 }, 'fill');
    assert.deepEqual(p.pages.map(({ paper, image, ...page }) => page), pagePlans(g));
    assert.deepEqual(p.columns.map(column => column.label), Array.from({ length: g.columns }, (_, index) => String(index + 1)));
    for (const page of p.pages) { close(page.x - page.paper.x, 3); close(page.y - page.paper.y, 4); }
    close(p.canvas.width, 400); close(p.canvas.height, 500);
    assert.ok(p.pages.every(page => page.paper.x + page.paper.width <= p.paperBounds.x + p.paperBounds.width + 1e-7));
  }
});
test('Fit whitespace and Fill cropping have the same placement in both preview views', () => {
  const g = geometry({ ...DEFAULTS, mode: 'exact', width: 400, height: 500 });
  const fit = previewPlan(g, { width: 2000, height: 1000 }, 'fit');
  close(fit.placement.y, 150); close(fit.placement.height, 200);
  assert.ok(fit.pages.every(page => !page.image || page.image.y >= 150));
  const fill = previewPlan(g, { width: 2000, height: 1000 }, 'fill');
  close(fill.placement.x, -300); close(fill.placement.width, 1000);
  assert.ok(fill.pages.every(page => page.image && page.image.width === page.width && page.image.height === page.height));
});
test('only Framed Grid creates visible image gaps; zero overlap creates touching seams', () => {
  const continuous = previewPlan(geometry({ ...DEFAULTS, overlap: 0 }), { width: 400, height: 574 }, 'fit');
  assert.equal(continuous.gaps.length, 0); assert.equal(continuous.overlaps.length, 0);
  close(continuous.pages[0].x + continuous.pages[0].width, continuous.pages[1].x);
  const g = geometry({ ...DEFAULTS, layoutMode: 'framed', gap: 10 });
  const framed = previewPlan(g, { width: g.width, height: g.height }, 'fit');
  assert.equal(framed.overlaps.length, 0);
  assert.deepEqual(framed.gaps, [{ x: 200, y: 0, width: 10, height: 584 }, { x: 0, y: 287, width: 410, height: 10 }]);
});
