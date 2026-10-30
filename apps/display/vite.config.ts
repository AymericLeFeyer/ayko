import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const core = process.env.AYKO_CORE_URL ?? 'http://localhost:3100';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: core, changeOrigin: true },
      '/ws': { target: core, ws: true },
    },
  },
});
