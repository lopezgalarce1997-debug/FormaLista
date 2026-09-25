import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // "fuente": @formalista/compartido se usa desde su TypeScript, igual que en la API.
  resolve: { conditions: ['fuente', ...defaultClientConditions] },
  server: {
    port: 5173,
    // El navegador llama a /api en su mismo origen y Vite lo reenvía a la API: sin CORS, y la
    // cookie SameSite=Strict funciona porque para el navegador todo es localhost:5173.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
