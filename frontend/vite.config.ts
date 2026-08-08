import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';
import { realpathSync } from 'fs';

const logicalFrontendRoot = resolve(__dirname);
const physicalFrontendRoot = realpathSync(logicalFrontendRoot);

export default defineConfig(({ command }) => ({
  // During serve, use Windows' physical junction target consistently for the
  // optimiser. During build retain the visible Desktop root so the single-file
  // output remains in the Tauri directory expected by the desktop app.
  root: command === 'serve' ? physicalFrontendRoot : logicalFrontendRoot,
  plugins: [react(), viteSingleFile()],
  resolve: {
    // `Desktop` is a Windows Junction to OneDrive on this workstation. Keep
    // Vite's module ids under the configured root so the HTML entry is emitted
    // as `index.html`, rather than a `../../../OneDrive/...` relative path.
    // This only affects dev/build path resolution; Tauri still consumes dist/.
    // Build needs logical Desktop paths for vite-plugin-singlefile's emitted
    // HTML name. Dev has no emitted HTML, and resolving the junction there
    // avoids an optimiser bug triggered by duplicate symlink module ids.
    preserveSymlinks: command === 'build',
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
    // Permit the one resolved frontend root as well as its visible Desktop
    // junction. This is intentionally narrower than Vite's broad default and
    // lets /src requests work when Windows resolves the junction to OneDrive.
    fs: { allow: [logicalFrontendRoot, physicalFrontendRoot] },
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
}));
