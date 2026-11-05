import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
// These are public browser tag identifiers, not API credentials.
const publicTracking = JSON.parse(readFileSync(new URL('../src/tracking-config.json', import.meta.url), 'utf8'));
const env = { ...publicTracking, ...process.env, VITE_PUBLIC_INDEXING: 'true' };
for (const args of [
  ['scripts/check-release.mjs'], ['scripts/prepare-pdfjs.mjs'],
  ['node_modules/vite/bin/vite.js', 'build'],
  ['node_modules/vite/bin/vite.js', 'build', '--ssr', 'src/entry-server.jsx', '--outDir', '.ssr'],
  ['scripts/prerender.mjs'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status || 1);
}
