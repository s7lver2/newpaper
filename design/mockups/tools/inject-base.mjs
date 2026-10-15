// node design/mockups/tools/inject-base.mjs
// Copies tools/motion-base.css between the /*@m-base*/ ... /*@m-base-end*/ markers of every project/Movil-*.dc.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, 'motion-base.css'), 'utf8').trim();
const dir = path.join(here, '..', 'project');
let n = 0;
for (const f of fs.readdirSync(dir).filter((x) => /^Movil-.*\.dc\.html$/.test(x))) {
  const p = path.join(dir, f);
  const src = fs.readFileSync(p, 'utf8');
  const re = /\/\*@m-base\*\/[\s\S]*?\/\*@m-base-end\*\//;
  if (!re.test(src)) continue;
  fs.writeFileSync(p, src.replace(re, () => `/*@m-base*/\n${css}\n/*@m-base-end*/`));
  n++;
}
console.log('updated', n, 'artboards');
