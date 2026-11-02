/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built app runs from any static host or sub-folder.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { include: ['tests/**/*.test.ts'] },
});
