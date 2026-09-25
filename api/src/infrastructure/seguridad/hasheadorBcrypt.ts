import bcrypt from 'bcryptjs';
import type { Hasheador } from '../../application/puertos.js';

export class HasheadorBcrypt implements Hasheador {
  /**
   * @param rondas factor de costo: cada +1 duplica el tiempo de cálculo.
   * 12 es un buen valor para producción; en pruebas se usa 4 para que sean rápidas.
   */
  constructor(private readonly rondas = 12) {}

  hashear(texto: string): Promise<string> {
    // bcrypt genera una sal aleatoria y la guarda dentro del mismo hash.
    return bcrypt.hash(texto, this.rondas);
  }

  comparar(texto: string, hash: string): Promise<boolean> {
    return bcrypt.compare(texto, hash);
  }
}
