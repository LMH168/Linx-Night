import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    // 主客户端与「暮林夜宴」3D 舞台原型各自独立入口
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        werewolf: fileURLToPath(new URL('./werewolf.html', import.meta.url))
      }
    }
  },
  server: { port: Number(process.env.CLIENT_VUE_PORT || 5173), strictPort: false }
});
