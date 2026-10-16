// Uso: node scripts/release-manifest.mjs <version> <stable|beta> "<notas>"
// Lee los .sig que genera `tauri build` y escribe dist/latest.json en el formato estático del actualizador de Tauri.
//
// Una plataforma por máquina de compilación: en Windows se lee el instalador NSIS; en Linux, el AppImage (se
// autoactualiza) y el .deb/.rpm (el actualizador los instala con pkexec). Si `dist/latest.json` ya existe con la misma
// versión (generado en la otra máquina) se CONSERVAN sus plataformas y se añaden las nuevas: copia el fichero de una
// máquina a la otra antes de ejecutar el script, o fusiona los dos a mano.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [version, channel = 'stable', notes = ''] = process.argv.slice(2);
if (!version) throw new Error('version required');
const tag = channel === 'beta' ? 'beta' : `v${version}`;
const base = `https://github.com/nickespro130/newpaper/releases/download/${tag}`;
const bundle = 'src-tauri/target/release/bundle';

// [clave de plataforma de Tauri, carpeta del bundle, nombre del fichero]
const candidates = [
  ['windows-x86_64', 'nsis', `newpaper_${version}_x64-setup.exe`],
  ['linux-x86_64', 'appimage', `newpaper_${version}_amd64.AppImage`],
  ['linux-x86_64-deb', 'deb', `newpaper_${version}_amd64.deb`],
  ['linux-x86_64-rpm', 'rpm', `newpaper-${version}-1.x86_64.rpm`],
];

const platforms = {};
for (const [key, dir, file] of candidates) {
  const sig = `${bundle}/${dir}/${file}.sig`;
  if (existsSync(sig)) platforms[key] = { signature: readFileSync(sig, 'utf8').trim(), url: `${base}/${file}` };
}
if (Object.keys(platforms).length === 0) throw new Error(`no .sig found under ${bundle} for version ${version}`);

mkdirSync('dist', { recursive: true });
let previous = {};
if (existsSync('dist/latest.json')) {
  try {
    const old = JSON.parse(readFileSync('dist/latest.json', 'utf8'));
    if (old.version === version) previous = old.platforms ?? {};
  } catch {
    /* un latest.json ilegible se sustituye */
  }
}
const manifest = { version, notes, pub_date: new Date().toISOString(), platforms: { ...previous, ...platforms } };
writeFileSync('dist/latest.json', JSON.stringify(manifest, null, 2));
console.log(`dist/latest.json for ${channel} ${version}: ${Object.keys(manifest.platforms).join(', ')}`);
