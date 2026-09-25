import type { Hasheador, ServicioTokens } from '../../src/application/puertos.js';

/** Hash predecible e instantáneo; además cuenta las llamadas para poder verificarlas. */
export class HasheadorFalso implements Hasheador {
  llamadasHashear = 0;

  async hashear(texto: string): Promise<string> {
    this.llamadasHashear++;
    return `hash:${texto}`;
  }

  async comparar(texto: string, hash: string): Promise<boolean> {
    return hash === `hash:${texto}`;
  }
}

export class TokensFalsos implements ServicioTokens {
  async firmar(usuarioId: number): Promise<string> {
    return `token-${usuarioId}`;
  }

  async verificar(token: string): Promise<number> {
    return Number(token.replace('token-', ''));
  }
}
