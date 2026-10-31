import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  define: { 'import.meta.env.VITE_LINX_BUILD_ID': JSON.stringify(process.env.LINX_BUILD_ID || process.env.VITE_LINX_BUILD_ID || 'unknown') },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    // 主客户端、暮林夜宴 3D 舞台与九人局页面各自独立入口
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        werewolf: fileURLToPath(new URL('./werewolf.html', import.meta.url)),
        game: fileURLToPath(new URL('./game.html', import.meta.url))
      }
    }
  },
  server: { port: Number(process.env.CLIENT_VUE_PORT || 5173), strictPort: false }
});
