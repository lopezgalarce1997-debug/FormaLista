import { defineConfig } from 'vitest/config';
import { resolverFuente } from './vitest.config.js';

// Pruebas de integración (npm run test:integracion): usan un MongoDB real y temporal
// levantado por mongodb-memory-server. La primera vez descarga el binario de MongoDB
// (queda en caché), por eso los tiempos de espera son más largos.
export default defineConfig({
  ...resolverFuente,
  test: {
    include: ['test/integracion/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 300_000,
    // Un solo proceso: todas las pruebas comparten el mismo servidor de Mongo en memoria.
    fileParallelism: false,
  },
});
