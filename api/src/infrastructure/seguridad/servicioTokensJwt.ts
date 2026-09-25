import { jwtVerify, SignJWT } from 'jose';
import { ErrorAplicacion } from '../../application/errores.js';
import type { ServicioTokens } from '../../application/puertos.js';

const ALGORITMO = 'HS256';

export class ServicioTokensJwt implements ServicioTokens {
  private readonly clave: Uint8Array;

  /** @param expiraEn duración relativa, por ejemplo '1h' o '30m'. */
  constructor(
    secreto: string,
    private readonly expiraEn: string,
  ) {
    this.clave = new TextEncoder().encode(secreto);
  }

  firmar(usuarioId: number): Promise<string> {
    return new SignJWT()
      .setProtectedHeader({ alg: ALGORITMO })
      .setSubject(String(usuarioId))
      .setIssuedAt()
      .setExpirationTime(this.expiraEn)
      .sign(this.clave);
  }

  async verificar(token: string): Promise<number> {
    try {
      // Se fija el algoritmo esperado: rechaza tokens con alg "none" u otro algoritmo elegido por el cliente.
      const { payload } = await jwtVerify(token, this.clave, { algorithms: [ALGORITMO] });
      const usuarioId = Number(payload.sub);
      if (!Number.isInteger(usuarioId) || usuarioId <= 0) throw new Error('sub inválido');
      return usuarioId;
    } catch {
      throw new ErrorAplicacion('no_autorizado', 'Token inválido o expirado');
    }
  }
}
