import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    lib: { entry: 'src/content.ts', formats: ['iife'], name: 'npContent', fileName: () => 'content.js' },
  },
});
