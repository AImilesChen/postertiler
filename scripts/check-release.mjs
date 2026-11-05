import { readFile } from 'node:fs/promises';
const files = ['privacy', 'terms', 'cookies', 'contact'];
let missing = 0;
for (const id of files) {
  const text = await readFile(`src/policies/published/${id}.en.md`, 'utf8');
  const fields = [...new Set(text.match(/\[[A-Z][A-Z0-9_]+\]/g) || [])];
  if (fields.length) { console.log(`${id}: ${fields.join(', ')}`); missing += fields.length; }
}
console.log(missing ? `Local development is available; ${missing} policy fields still need facts before public release.` : 'Policy placeholders resolved; complete the documented publication checks.');
process.exitCode = missing ? 1 : 0;
