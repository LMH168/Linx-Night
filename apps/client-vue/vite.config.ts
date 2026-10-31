import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  define: { 'import.meta.env.VITE_LINX_BUILD_ID': JSON.stringify(process.env.LINX_BUILD_ID || process.env.VITE_LINX_BUILD_ID || 'unknown') },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true },
  server: { port: Number(process.env.CLIENT_VUE_PORT || 5173), strictPort: false }
});
