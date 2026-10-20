import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [preact()],
  // Относительные пути: приложение грузится из https://localhost внутри WebView
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    // шарды данных — тысячи мелких JSON: не считаем размер каждого
    reportCompressedSize: false,
  },
  server: { host: true, port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
