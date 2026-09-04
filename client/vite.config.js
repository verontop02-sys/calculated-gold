import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ruHtmlPlugin(enabled) {
  return {
    name: 'reaktivo-ru-html',
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use((req, _res, next) => {
        const url = String(req.url || '').split('?')[0];
        if (url === '/' || url === '/index.html') req.url = '/index-ru.html';
        next();
      });
    },
    closeBundle() {
      if (!enabled) return;
      const dir = path.join(__dirname, 'dist-ru');
      const from = path.join(dir, 'index-ru.html');
      const to = path.join(dir, 'index.html');
      if (fs.existsSync(from)) fs.renameSync(from, to);
    },
  };
}

export default defineConfig(({ mode }) => {
  const isRu = mode === 'ru';
  return {
    plugins: [react(), ruHtmlPlugin(isRu)],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: isRu ? 'dist-ru' : 'dist',
      emptyOutDir: true,
      rollupOptions: isRu
        ? { input: path.resolve(__dirname, 'index-ru.html') }
        : undefined,
    },
  };
});
