/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Content-Security-Policy injected into production builds only (the dev server
 * needs a websocket for hot reload). `connect-src 'none'` makes the browser
 * itself refuse any fetch / XHR / beacon / websocket from the page, which is the
 * technical guarantee behind the privacy statement: uploaded data cannot be
 * transmitted even if a future dependency tried to.
 */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function productionCsp(): Plugin {
  return {
    name: 'qa-dashboard-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`,
      );
    },
  };
}

/**
 * The <meta> CSP covers the page, but a Web Worker takes its policy from the HTTP
 * headers of its own script, so the same policy is also sent as a header. Static
 * hosts get the equivalent from public/staticwebapp.config.json and public/_headers.
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': `${PRODUCTION_CSP}; frame-ancestors 'none'`,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export default defineConfig({
  plugins: [react(), productionCsp()],
  preview: {
    headers: SECURITY_HEADERS,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: {
    format: 'es',
  },
  build: {
    // The modulepreload polyfill uses fetch(); it is disabled so the CSP can forbid all connections.
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    css: false,
    testTimeout: 30000,
  },
});
