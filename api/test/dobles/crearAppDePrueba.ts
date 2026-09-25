import { ServicioAuth } from '../../src/application/servicioAuth.js';
import { ServicioEquipos } from '../../src/application/servicioEquipos.js';
import { ServicioFormularios } from '../../src/application/servicioFormularios.js';
import { ServicioPublico } from '../../src/application/servicioPublico.js';
import { ServicioResultados } from '../../src/application/servicioResultados.js';
import { crearApp, type DependenciasApp } from '../../src/http/app.js';
import { HasheadorBcrypt } from '../../src/infrastructure/seguridad/hasheadorBcrypt.js';
import { ServicioTokensJwt } from '../../src/infrastructure/seguridad/servicioTokensJwt.js';
import { EquiposEnMemoria } from './equiposEnMemoria.js';
import { FormulariosEnMemoria, RegistroEnMemoria, RespuestasEnMemoria } from './formulariosEnMemoria.js';
import { RepositorioUsuariosEnMemoria } from './repositorioUsuariosEnMemoria.js';

export const SECRETO_PRUEBAS = 'secreto-solo-para-pruebas-0123456789';

export const loggerSilencioso = { error: () => {} };

/**
 * App completa para pruebas HTTP: bcrypt y JWT reales, pero los datos en memoria.
 * Los servicios comparten los mismos repositorios, igual que en server.ts, y se devuelven
 * para que la prueba pueda preparar o revisar datos. Cualquier dependencia se puede reemplazar.
 */
export function crearEntornoDePrueba(reemplazos: Partial<DependenciasApp> = {}) {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const equipos = new EquiposEnMemoria(usuarios);
  const registro = new RegistroEnMemoria(equipos);
  const formularios = new FormulariosEnMemoria();
  const respuestas = new RespuestasEnMemoria();

  const servicioTokens = new ServicioTokensJwt(SECRETO_PRUEBAS, '1h');
  const servicioAuth = new ServicioAuth(usuarios, new HasheadorBcrypt(4), servicioTokens);
  const servicioFormularios = new ServicioFormularios(registro, formularios, respuestas, equipos, loggerSilencioso);
  const servicioPublico = new ServicioPublico(registro, formularios, respuestas);
  const servicioResultados = new ServicioResultados(registro, formularios, respuestas, loggerSilencioso);
  const servicioEquipos = new ServicioEquipos(equipos, usuarios);

  const app = crearApp({
    verificadoresSalud: [],
    servicioAuth,
    servicioTokens,
    servicioFormularios,
    servicioPublico,
    servicioResultados,
    servicioEquipos,
    ...reemplazos,
  });
  return { app, usuarios, equipos, registro, formularios, respuestas };
}

export function crearAppDePrueba(reemplazos: Partial<DependenciasApp> = {}) {
  return crearEntornoDePrueba(reemplazos).app;
}
