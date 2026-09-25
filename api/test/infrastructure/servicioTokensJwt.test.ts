import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServicioTokensJwt } from '../../src/infrastructure/seguridad/servicioTokensJwt.js';

const SECRETO = 'secreto-de-pruebas-con-32-caracteres!';

describe('ServicioTokensJwt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('firma un token y al verificarlo devuelve el id del usuario', async () => {
    const tokens = new ServicioTokensJwt(SECRETO, '1h');

    const token = await tokens.firmar(42);

    await expect(tokens.verificar(token)).resolves.toBe(42);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const ajeno = await new ServicioTokensJwt('otro-secreto-distinto-de-32-caracteres', '1h').firmar(42);

    await expect(new ServicioTokensJwt(SECRETO, '1h').verificar(ajeno)).rejects.toMatchObject({
      tipo: 'no_autorizado',
    });
  });

  it('rechaza un token expirado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const tokens = new ServicioTokensJwt(SECRETO, '1h');
    const token = await tokens.firmar(42);

    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000); // 2 horas después

    await expect(tokens.verificar(token)).rejects.toMatchObject({ tipo: 'no_autorizado' });
  });

  it('rechaza un token sin firma (alg "none")', async () => {
    const base64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const sinFirma = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: '1' })}.`;

    await expect(new ServicioTokensJwt(SECRETO, '1h').verificar(sinFirma)).rejects.toMatchObject({
      tipo: 'no_autorizado',
    });
  });
});
