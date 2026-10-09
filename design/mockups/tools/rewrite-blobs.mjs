// Prepares the mockups for republishing to a NEW Design canvas, where uploaded assets get new /_blob/<id> URLs.
// usage: node design/mockups/tools/rewrite-blobs.mjs <mapping.json> <outDir>
// mapping.json: { "<old asset id>": "/_blob/<new id>" } (the new URL exactly as returned by the Artifact upload)
// Copies project/ to <outDir>/project/ and replaces every /_blob/<old id> reference. Run from any directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const [mappingFile, outDir] = process.argv.slice(2);
if (!mappingFile || !outDir) throw new Error('usage: rewrite-blobs.mjs <mapping.json> <outDir>');
const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
const out = path.join(path.resolve(outDir), 'project');
fs.mkdirSync(out, { recursive: true });
let replaced = 0;
for (const name of fs.readdirSync(path.join(root, 'project'))) {
  let text = fs.readFileSync(path.join(root, 'project', name), 'utf8');
  for (const [oldId, newUrl] of Object.entries(mapping)) {
    const before = text;
    text = text.split(`/_blob/${oldId}`).join(newUrl);
    if (text !== before) replaced++;
  }
  fs.writeFileSync(path.join(out, name), text);
}
console.log(`wrote ${out} (${replaced} file(s) had asset references rewritten)`);
