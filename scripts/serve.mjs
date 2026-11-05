import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist'), port = Number(process.env.PORT || 4180);
const sharedHeaders = {};
try {
  const headers = await readFile(path.join(root, '_headers'), 'utf8');
  for (const line of headers.split(/\r?\n/)) {
    const match = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/);
    if (match) sharedHeaders[match[1]] = match[2];
  }
} catch { /* Local builds may not provide Cloudflare headers. */ }
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.pdf': 'application/pdf' };
createServer(async (req, res) => {
  for (const [name, value] of Object.entries(sharedHeaders)) res.setHeader(name, value);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-cache');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname !== '/' && /(?:\.html|\/$)/.test(pathname)) {
      const canonical = pathname.replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '') || '/';
      res.writeHead(307, { Location: canonical }).end(); return;
    }
    const base = path.resolve(root, '.' + pathname);
    if (base !== root && !base.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    let candidate = pathname === '/' ? path.join(root, 'index.html') : base;
    try { if (!(await stat(candidate)).isFile()) throw new Error(); } catch { candidate = base + '.html'; }
    let content, code = 200;
    try { content = await readFile(candidate); } catch { candidate = path.join(root, '404.html'); content = await readFile(candidate); code = 404; }
    const extension = path.extname(candidate);
    res.writeHead(code, { 'Content-Type': extension === '.mjs' ? 'text/javascript; charset=utf-8' : extension === '.wasm' ? 'application/wasm' : types[extension] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(400).end('Bad request'); }
}).listen(port, '127.0.0.1', () => console.log(`PosterTiler V1: http://127.0.0.1:${port}`));
