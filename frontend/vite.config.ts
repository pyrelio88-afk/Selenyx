import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';
import { realpathSync } from 'fs';

const logicalFrontendRoot = resolve(__dirname);
const physicalFrontendRoot = realpathSync(logicalFrontendRoot);
const useSingleFile = process.env.VITE_SINGLEFILE === '1';

export default defineConfig(({ command }) => ({
  root: command === 'serve' ? physicalFrontendRoot : logicalFrontendRoot,
  plugins: useSingleFile ? [react(), viteSingleFile()] : [react()],
  resolve: {
    preserveSymlinks: command === 'build' && useSingleFile,
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@stores': resolve(__dirname, 'src/stores'),
      '@services': resolve(__dirname, 'src/services'),
      '@apptypes': resolve(__dirname, 'src/types'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@hooks': resolve(__dirname, 'src/hooks'),
      '@data': resolve(__dirname, 'src/data'),
      '@lib': resolve(__dirname, 'src/lib'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [logicalFrontendRoot, physicalFrontendRoot] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8770',
        changeOrigin: true,
      },
    },
  },
  build: useSingleFile
    ? {
        target: 'es2022',
        sourcemap: false,
        assetsInlineLimit: 100_000_000,
        rollupOptions: { output: { inlineDynamicImports: true } },
      }
    : {
        target: 'es2022',
        sourcemap: false,
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts';
                if (id.includes('pdfjs-dist')) return 'vendor-pdf';
                if (
                  id.includes('react-markdown')
                  || id.includes('remark-')
                  || id.includes('rehype-')
                  || id.includes('katex')
                  || id.includes('micromark')
                  || id.includes('mdast-')
                  || id.includes('hast-')
                  || id.includes('unified')
                ) {
                  return 'vendor-markdown';
                }
                if (id.includes('react-dom') || id.includes('react/') || id.includes('scheduler') || id.includes('zustand')) {
                  return 'vendor-react';
                }
              }
              if (id.includes('/src/data/disciplines') || id.includes('\\src\\data\\disciplines') || id.includes('/src/data/expansion/') || id.includes('\\src\\data\\expansion\\')) {
                return 'data-disciplines';
              }
              return undefined;
            },
          },
        },
      },
}));
