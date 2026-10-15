import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1421, strictPort: true, host: process.env.TAURI_DEV_HOST || false },
  build: { target: 'es2022', outDir: 'dist' },
});
