import { imagePlacement, pagePlans, rowLabel, type Geometry } from './geometry.ts';

type Rect = { x: number; y: number; width: number; height: number };
function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

// Finished-poster millimetres, shared with PDF page plans. Paper outlines can
// overlap here: margins are trimmed/covered when assembling the actual sheets.
export function previewPlan(g: Geometry, pixels: { width: number; height: number }, fit: string) {
  const canvas = { x: 0, y: 0, width: g.width, height: g.height };
  const placement = pixels.width > 0 && pixels.height > 0 ? imagePlacement(g, pixels.width, pixels.height, fit) : canvas;
  const pages = pagePlans(g).map(page => ({ ...page,
    paper: { x: page.x - g.margins.left, y: page.y - g.margins.top, width: g.pw, height: g.ph },
    image: intersection(page, placement),
  }));
  const last = pages.reduce((box, page) => ({
    right: Math.max(box.right, page.paper.x + page.paper.width),
    bottom: Math.max(box.bottom, page.paper.y + page.paper.height),
  }), { right: 0, bottom: 0 });
  const paperBounds = { x: -g.margins.left, y: -g.margins.top,
    width: last.right + g.margins.left, height: last.bottom + g.margins.top };
  const overlaps: Rect[] = [], gaps: Rect[] = [];
  const columns = pages.filter(page => page.row === 0).sort((a, b) => a.col - b.col);
  const rows = pages.filter(page => page.col === 0).sort((a, b) => a.row - b.row);
  for (const page of columns.slice(1)) {
    if (g.framed && g.gap) gaps.push({ x: page.x - g.gap, y: 0, width: g.gap, height: g.height });
    else if (g.overlap) overlaps.push({ x: page.x, y: 0, width: g.overlap, height: g.height });
  }
  for (const page of rows.slice(1)) {
    if (g.framed && g.gap) gaps.push({ x: 0, y: page.y - g.gap, width: g.width, height: g.gap });
    else if (g.overlap) overlaps.push({ x: 0, y: page.y, width: g.width, height: g.overlap });
  }
  return { canvas, placement, pages, paperBounds, gaps,
    overlaps: overlaps.map(rect => intersection(rect, placement)).filter((rect): rect is Rect => !!rect),
    columns: columns.map(page => ({ label: String(page.col + 1), start: page.x, center: page.x + page.width / 2 })),
    rows: rows.map(page => ({ label: rowLabel(page.row), start: page.y, center: page.y + page.height / 2 })),
  };
}
