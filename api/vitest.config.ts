import { configDefaults, defineConfig } from 'vitest/config';

// Pruebas unitarias (npm test): rápidas y sin bases de datos reales.
// Las de integración (test/integracion) corren aparte con vitest.integracion.config.ts.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/integracion/**'],
  },
});
