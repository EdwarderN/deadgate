import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The published app may load only its own files and talks to no server at all.
// Build only: the dev server needs inline scripts for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const securityHeaders = (): Plugin => ({
  name: 'security-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
});

// base './' so the built app runs from any static host or sub-folder (GitHub Pages included).
export default defineConfig({ base: './', plugins: [react(), securityHeaders()], test: { include: ['tests/**/*.test.ts'] } });
