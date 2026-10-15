import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// El motor de la intro es un script clásico (`const NPIntro`): se exporta al cargarlo como módulo, sin tocar la copia.
const introExport = {
  name: 'np-intro-export',
  transform(code: string, id: string) {
    if (!id.replace(/\\/g, '/').endsWith('/src/splash/intro-engine.js')) return null;
    return { code: `${code}
export default NPIntro;
`, map: null };
  },
};

export default defineConfig({
  plugins: [react(), introExport],
  clearScreen: false,
  server: { port: 1421, strictPort: true, host: process.env.TAURI_DEV_HOST || false },
  build: { target: 'es2022', outDir: 'dist' },
});
