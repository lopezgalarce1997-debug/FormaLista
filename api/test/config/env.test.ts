import { describe, expect, it } from 'vitest';
import { cargarConfig } from '../../src/config/env.js';

const envValido = {
  MYSQL_HOST: 'localhost',
  MYSQL_USER: 'formalista',
  MYSQL_PASSWORD: 'secreto',
  MYSQL_DATABASE: 'formalista',
  MONGODB_URI: 'mongodb://localhost:27017/formalista',
  JWT_SECRET: 'x'.repeat(32),
};

describe('cargarConfig', () => {
  it('aplica valores por defecto y convierte números', () => {
    const config = cargarConfig({ ...envValido, PORT: '4000' });

    expect(config.puerto).toBe(4000);
    expect(config.mysql.port).toBe(3306);
    expect(config.entorno).toBe('development');
    expect(config.jwt.expiraEn).toBe('1h');
  });

  it('falla indicando qué variable falta o es inválida', () => {
    const { MYSQL_HOST: _omitida, ...sinHost } = envValido;

    expect(() => cargarConfig({ ...sinHost, JWT_SECRET: 'corto' })).toThrow(/MYSQL_HOST[\s\S]*JWT_SECRET/);
  });
});
