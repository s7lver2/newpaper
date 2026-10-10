// Uso: node scripts/release-manifest.mjs <version> <stable|beta> "<notas>"
// Lee el .sig que genera `tauri build` y escribe dist/latest.json en el formato estático del actualizador de Tauri.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const [version, channel = 'stable', notes = ''] = process.argv.slice(2);
if (!version) throw new Error('version required');
const file = `newpaper_${version}_x64-setup.exe`;
const signature = readFileSync(`src-tauri/target/release/bundle/nsis/${file}.sig`, 'utf8').trim();
const tag = channel === 'beta' ? 'beta' : `v${version}`;
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: { 'windows-x86_64': { signature, url: `https://github.com/nickespro130/newpaper/releases/download/${tag}/${file}` } },
};
mkdirSync('dist', { recursive: true });
writeFileSync('dist/latest.json', JSON.stringify(manifest, null, 2));
console.log(`dist/latest.json for ${channel} ${version}`);
