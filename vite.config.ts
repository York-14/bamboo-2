/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス（/bamboo-2/）で配信するため、CI から BASE_PATH で指定する
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // manifold-3d は Emscripten 製の WASM モジュール。事前バンドルすると .wasm の解決が壊れるので除外する
  optimizeDeps: { exclude: ['manifold-3d'] },
  worker: { format: 'es' },
  // 個人用のローカルツールなので、three.js を含む 1 チャンクの大きさは許容する
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
