import { ServicioAuth } from '../../src/application/servicioAuth.js';
import { crearApp, type DependenciasApp } from '../../src/http/app.js';
import { HasheadorBcrypt } from '../../src/infrastructure/seguridad/hasheadorBcrypt.js';
import { ServicioTokensJwt } from '../../src/infrastructure/seguridad/servicioTokensJwt.js';
import { RepositorioUsuariosEnMemoria } from './repositorioUsuariosEnMemoria.js';

export const SECRETO_PRUEBAS = 'secreto-solo-para-pruebas-0123456789';

/**
 * App completa para pruebas HTTP: bcrypt y JWT reales, pero los datos en memoria.
 * Cualquier dependencia se puede reemplazar con `reemplazos`.
 */
export function crearAppDePrueba(reemplazos: Partial<DependenciasApp> = {}) {
  const servicioTokens = new ServicioTokensJwt(SECRETO_PRUEBAS, '1h');
  const servicioAuth = new ServicioAuth(new RepositorioUsuariosEnMemoria(), new HasheadorBcrypt(4), servicioTokens);

  return crearApp({ verificadoresSalud: [], servicioAuth, servicioTokens, ...reemplazos });
}
