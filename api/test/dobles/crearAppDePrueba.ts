import { ServicioAuth } from '../../src/application/servicioAuth.js';
import { ServicioFormularios } from '../../src/application/servicioFormularios.js';
import { crearApp, type DependenciasApp } from '../../src/http/app.js';
import { HasheadorBcrypt } from '../../src/infrastructure/seguridad/hasheadorBcrypt.js';
import { ServicioTokensJwt } from '../../src/infrastructure/seguridad/servicioTokensJwt.js';
import { FormulariosEnMemoria, RegistroEnMemoria, RespuestasEnMemoria } from './formulariosEnMemoria.js';
import { RepositorioUsuariosEnMemoria } from './repositorioUsuariosEnMemoria.js';

export const SECRETO_PRUEBAS = 'secreto-solo-para-pruebas-0123456789';

export const loggerSilencioso = { error: () => {} };

/**
 * App completa para pruebas HTTP: bcrypt y JWT reales, pero los datos en memoria.
 * Cualquier dependencia se puede reemplazar con `reemplazos`.
 */
export function crearAppDePrueba(reemplazos: Partial<DependenciasApp> = {}) {
  const servicioTokens = new ServicioTokensJwt(SECRETO_PRUEBAS, '1h');
  const servicioAuth = new ServicioAuth(new RepositorioUsuariosEnMemoria(), new HasheadorBcrypt(4), servicioTokens);
  const servicioFormularios = new ServicioFormularios(
    new RegistroEnMemoria(),
    new FormulariosEnMemoria(),
    new RespuestasEnMemoria(),
    loggerSilencioso,
  );

  return crearApp({ verificadoresSalud: [], servicioAuth, servicioTokens, servicioFormularios, ...reemplazos });
}
