import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api/soilgrids': {
        target: 'https://rest.isric.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/soilgrids/, '/soilgrids/v2.0/properties/query'),
      },
    },
  },
});

