import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

function extensionAssetsPlugin() {
  return {
    name: 'extension-assets',
    closeBundle() {
      const outDir = resolve(import.meta.dirname, 'dist-extension');
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }

      // Copy manifest.json
      const manifestSrc = resolve(import.meta.dirname, 'src/manifest.json');
      const manifestDest = resolve(outDir, 'manifest.json');
      if (existsSync(manifestSrc)) {
        copyFileSync(manifestSrc, manifestDest);
      }

      // Copy injected fetchProxy.js
      const injectedDir = resolve(outDir, 'injected');
      if (!existsSync(injectedDir)) {
        mkdirSync(injectedDir, { recursive: true });
      }
      const proxySrc = resolve(import.meta.dirname, 'src/injected/fetchProxy.js');
      const proxyDest = resolve(injectedDir, 'fetchProxy.js');
      if (existsSync(proxySrc)) {
        copyFileSync(proxySrc, proxyDest);
      }

      // Copy popup HTML
      const popupDir = resolve(outDir, 'popup');
      if (!existsSync(popupDir)) {
        mkdirSync(popupDir, { recursive: true });
      }
      const popupSrc = resolve(import.meta.dirname, 'src/popup/index.html');
      const popupDest = resolve(popupDir, 'index.html');
      if (existsSync(popupSrc)) {
        copyFileSync(popupSrc, popupDest);
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: mode === 'extension' ? [extensionAssetsPlugin()] : [],
  resolve: {
    alias: {
      '@core': resolve(import.meta.dirname, 'src/core'),
      '@adapters': resolve(import.meta.dirname, 'src/adapters'),
      '@services': resolve(import.meta.dirname, 'src/services'),
      '@ui': resolve(import.meta.dirname, 'src/ui'),
      '@data': resolve(import.meta.dirname, 'data'),
    },
  },
  build: mode === 'extension' ? {
    rollupOptions: {
      input: {
        serviceWorker: resolve(import.meta.dirname, 'src/background/serviceWorker.ts'),
        contentYouTube: resolve(import.meta.dirname, 'src/content/youtube.ts'),
        contentNetflix: resolve(import.meta.dirname, 'src/content/netflix.ts'),
        contentUdemy: resolve(import.meta.dirname, 'src/content/udemy.ts'),
        contentCoursera: resolve(import.meta.dirname, 'src/content/coursera.ts'),
        contentWebReader: resolve(import.meta.dirname, 'src/content/webreader.ts'),
        'popup/popup': resolve(import.meta.dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
    outDir: 'dist-extension',
    emptyOutDir: true,
    sourcemap: true,
  } : {
    outDir: 'dist-web',
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
}));
