import { configDefaults, defineConfig } from 'vitest/config';

// Condición "fuente": el paquete @formalista/compartido se lee desde su TypeScript (sin compilarlo antes).
export const resolverFuente = { resolve: { conditions: ['fuente'] }, ssr: { resolve: { conditions: ['fuente'] } } };

// Pruebas unitarias (npm test): rápidas y sin bases de datos reales.
// Las de integración (test/integracion) corren aparte con vitest.integracion.config.ts.
export default defineConfig({
  ...resolverFuente,
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/integracion/**'],
  },
});
