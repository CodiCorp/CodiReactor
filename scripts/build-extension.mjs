// ─────────────────────────────────────────────────
// Build Script for CodiReactor Chrome Extension
// Bundles content scripts as standalone IIFE scripts
// (ensuring zero 'import' statements in content scripts)
// ─────────────────────────────────────────────────

import { build } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const rootDir = resolve(__dirname, '..');
const outDir = resolve(rootDir, 'dist-extension');

async function buildExtension() {
  console.log('🚀 Building CodiReactor Chrome Extension...');

  // 1. Clean output directory
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });
  mkdirSync(resolve(outDir, 'injected'), { recursive: true });
  mkdirSync(resolve(outDir, 'popup'), { recursive: true });

  const alias = {
    '@core': resolve(rootDir, 'src/core'),
    '@adapters': resolve(rootDir, 'src/adapters'),
    '@services': resolve(rootDir, 'src/services'),
    '@ui': resolve(rootDir, 'src/ui'),
    '@data': resolve(rootDir, 'data'),
  };

  // 2. Build Background Service Worker (ES module is supported in MV3)
  console.log('📦 Building Background Service Worker...');
  await build({
    root: rootDir,
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: true,
      rollupOptions: {
        input: { serviceWorker: resolve(rootDir, 'src/background/serviceWorker.ts') },
        output: {
          entryFileNames: '[name].js',
          format: 'es',
        },
      },
    },
  });

  // 3. Content scripts to bundle as standalone IIFE (Zero import statements!)
  const contentScripts = [
    { name: 'contentYouTube', file: 'src/content/youtube.ts', global: 'CodiReactorYouTube' },
    { name: 'contentNetflix', file: 'src/content/netflix.ts', global: 'CodiReactorNetflix' },
    { name: 'contentUdemy', file: 'src/content/udemy.ts', global: 'CodiReactorUdemy' },
    { name: 'contentCoursera', file: 'src/content/coursera.ts', global: 'CodiReactorCoursera' },
    { name: 'contentWebReader', file: 'src/content/webreader.ts', global: 'CodiReactorWebReader' },
    { name: 'popup/popup', file: 'src/popup/popup.ts', global: 'CodiReactorPopup' },
  ];

  for (const cs of contentScripts) {
    console.log(`📦 Bundling standalone ${cs.name}...`);
    await build({
      root: rootDir,
      resolve: { alias },
      build: {
        outDir,
        emptyOutDir: false,
        sourcemap: true,
        rollupOptions: {
          input: { [cs.name]: resolve(rootDir, cs.file) },
          output: {
            entryFileNames: '[name].js',
            format: 'iife',
            name: cs.global,
            inlineDynamicImports: true,
          },
        },
      },
    });
  }

  // 4. Copy static assets
  console.log('📋 Copying static assets...');
  copyFileSync(resolve(rootDir, 'src/manifest.json'), resolve(outDir, 'manifest.json'));
  copyFileSync(resolve(rootDir, 'src/injected/fetchProxy.js'), resolve(outDir, 'injected/fetchProxy.js'));
  copyFileSync(resolve(rootDir, 'src/popup/index.html'), resolve(outDir, 'popup/index.html'));

  console.log('✅ Extension build complete in dist-extension/');
}

buildExtension().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
