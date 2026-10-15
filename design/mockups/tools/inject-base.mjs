// node design/mockups/tools/inject-base.mjs
// Copies tools/motion-base.css between the /*@m-base*/ ... /*@m-base-end*/ markers of every project/Movil-*.dc.html,
// and tools/intro-engine.js between /*@intro-engine*/ ... /*@intro-engine-end*/ in the artboards that use it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, 'motion-base.css'), 'utf8').trim();
const js = fs.readFileSync(path.join(here, 'intro-engine.js'), 'utf8').trim();
const dir = path.join(here, '..', 'project');
let n = 0, m = 0;
for (const f of fs.readdirSync(dir).filter((x) => /^Movil-.*\.dc\.html$/.test(x))) {
  const p = path.join(dir, f);
  let src = fs.readFileSync(p, 'utf8');
  const re = /\/\*@m-base\*\/[\s\S]*?\/\*@m-base-end\*\//;
  const re2 = /\/\*@intro-engine\*\/[\s\S]*?\/\*@intro-engine-end\*\//;
  const before = src;
  if (re.test(src)) { src = src.replace(re, () => `/*@m-base*/\n${css}\n/*@m-base-end*/`); n++; }
  if (re2.test(src)) { src = src.replace(re2, () => `/*@intro-engine*/\n${js}\n/*@intro-engine-end*/`); m++; }
  if (src !== before) fs.writeFileSync(p, src);
}
console.log('updated', n, 'artboards (base),', m, '(intro engine)');
