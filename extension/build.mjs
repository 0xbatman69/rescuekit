import { build } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

console.log('[RescueKit] Building extension...');

// Clean dist
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true });
}
fs.mkdirSync('dist', { recursive: true });

// 1. Inpage inject-guard (IIFE)
await build({
  configFile: false,
  build: {
    emptyOutDir: false,
    outDir: 'dist/src/inpage',
    lib: {
      entry: path.resolve('src/inpage/inject-guard.ts'),
      name: 'RescueKitGuard',
      formats: ['iife'],
      fileName: () => 'inject-guard.js',
    },
    rollupOptions: { output: { extend: true } },
  },
});

// 2. Inpage inject.ts (IIFE)
await build({
  configFile: false,
  build: {
    emptyOutDir: false,
    outDir: 'dist/src/inpage',
    lib: {
      entry: path.resolve('src/inpage/inject.ts'),
      name: 'RescueKitInject',
      formats: ['iife'],
      fileName: () => 'inject.js',
    },
    rollupOptions: { output: { extend: true } },
  },
});

// 3. Content script (IIFE)
await build({
  configFile: false,
  build: {
    emptyOutDir: false,
    outDir: 'dist/src/content',
    lib: {
      entry: path.resolve('src/content/contentScript.ts'),
      name: 'RescueKitContent',
      formats: ['iife'],
      fileName: () => 'contentScript.js',
    },
    rollupOptions: { output: { extend: true } },
  },
});

// 4. Background service worker (ESM)
await build({
  configFile: false,
  build: {
    emptyOutDir: false,
    outDir: 'dist/src/background',
    rollupOptions: {
      input: path.resolve('src/background/index.ts'),
      output: {
        entryFileNames: 'index.js',
        format: 'esm',
      },
    },
  },
});

// 5. Popup UI (React)
await build({
  configFile: false,
  plugins: [react()],
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: path.resolve('src/popup/popup.html'),
      },
    },
  },
});

// Ensure crisp PNG icons exist for Chrome manifest & toolbar
const svgIconPath = path.resolve('public/icon.svg');
const iconsDir = path.resolve('public/icons');
if (fs.existsSync(svgIconPath)) {
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
  const svgBuf = fs.readFileSync(svgIconPath);
  for (const size of [16, 32, 48, 128]) {
    const p = path.join(iconsDir, `icon-${size}.png`);
    await sharp(svgBuf).resize(size, size).png().toFile(p);
  }
}

// Copy manifest.json and public assets
fs.copyFileSync('manifest.json', 'dist/manifest.json');
if (fs.existsSync('public')) {
  fs.cpSync('public', 'dist', { recursive: true });
}

console.log('[RescueKit] Build complete! Extension ready in dist/');
