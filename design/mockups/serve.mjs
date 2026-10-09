// Serves the newpaper UI mockups (.dc.html) locally: node design/mockups/serve.mjs [port]
// The x-dc runtime (runtime/support.js) is served as ./support.js and /_blob/<id> is served from assets/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 5601);
const types = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

function resolve(url) {
  const p = decodeURIComponent(url.split('?')[0]);
  if (p === '/' || p === '/index.html') return null;
  if (p === '/support.js') return path.join(here, 'runtime', 'support.js');
  const blob = p.match(/^\/_blob\/([0-9a-f]{32})$/);
  if (blob) return path.join(here, 'assets', `${blob[1]}.svg`);
  const file = path.join(here, 'project', p);
  return file.startsWith(path.join(here, 'project')) ? file : null;
}

http.createServer((req, res) => {
  const file = resolve(req.url);
  if (!file) {
    const names = fs.readdirSync(path.join(here, 'project')).filter((n) => n.endsWith('.dc.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta charset="utf-8"><title>newpaper mockups</title><ul>${names.map((n) => `<li><a href="/${n}">${n}</a></li>`).join('')}</ul>`);
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`mockups: http://127.0.0.1:${port}/`));
