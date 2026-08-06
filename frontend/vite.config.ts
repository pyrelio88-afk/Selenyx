import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/**
 * anydoc-wasm 内联插件
 * 单文件构建下 .wasm 无法走 new URL(import.meta.url)，故构建时读取
 * @firecrawl/anydoc-wasm 的 wasm 二进制，base64 编码后注入虚拟模块，
 * 运行时由服务层解码并用 initSync 加载（绕开 new URL 路径）。
 */
function anydocWasmInlinePlugin(): Plugin {
  const virtualId = 'virtual:anydoc-wasm-base64';
  const resolvedVirtualId = '\0' + virtualId;
  let cache: string | null = null;

  function loadBase64(): string {
    if (cache) return cache;
    const wasmPath = resolve(process.cwd(), 'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm');
    const buf = readFileSync(wasmPath);
    cache = buf.toString('base64');
    return cache;
  }

  return {
    name: 'anydoc-wasm-inline',
    enforce: 'pre',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
      return null;
    },
    load(id) {
      if (id === resolvedVirtualId) {
        const b64 = loadBase64();
        return `// 自动生成：anydoc wasm 二进制（base64，构建时内联）\nexport default ${JSON.stringify(b64)};`;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), anydocWasmInlinePlugin(), viteSingleFile()],
  resolve: {
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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8770',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
