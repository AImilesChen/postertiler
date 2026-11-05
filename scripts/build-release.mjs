import { spawnSync } from 'node:child_process';
const env = { ...process.env, VITE_PUBLIC_INDEXING: 'true' };
for (const args of [
  ['scripts/check-release.mjs'], ['scripts/prepare-pdfjs.mjs'],
  ['node_modules/vite/bin/vite.js', 'build'],
  ['node_modules/vite/bin/vite.js', 'build', '--ssr', 'src/entry-server.jsx', '--outDir', '.ssr'],
  ['scripts/prerender.mjs'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status || 1);
}
