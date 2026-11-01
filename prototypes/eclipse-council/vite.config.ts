import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  return {
    base: './',
    plugins: [vue(), ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      // 单文件包含大图时，跳过 esbuild 的临时文件转译，供现代浏览器直接预览。
      target: single ? 'esnext' : 'es2020',
      minify: single ? false : 'esbuild',
      cssTarget: 'chrome100',
      assetsInlineLimit: single ? 100_000_000 : 4096,
      chunkSizeWarningLimit: 1200,
    },
    server: { host: '127.0.0.1', port: 5178, strictPort: true, watch: { ignored: ['**/.browser-audit/**'] } },
    preview: { host: '127.0.0.1', port: 4178, strictPort: true },
  }
})
