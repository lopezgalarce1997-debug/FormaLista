import type { DatosLogin, DatosRegistro, Serializado, UsuarioPublico } from '@formalista/compartido';
import { pedir } from './cliente';

/** Usuario tal como llega por JSON (creadoEn es texto ISO). */
export type Usuario = Serializado<UsuarioPublico>;

// La API también devuelve el token en el cuerpo (para clientes sin cookies); la web lo ignora a propósito.
interface RespuestaSesion {
  usuario: Usuario;
}

export const apiAuth = {
  yo: () => pedir<RespuestaSesion>('/auth/yo').then((r) => r.usuario),
  login: (datos: DatosLogin) =>
    pedir<RespuestaSesion>('/auth/login', { metodo: 'POST', cuerpo: datos }).then((r) => r.usuario),
  registrar: (datos: DatosRegistro) =>
    pedir<RespuestaSesion>('/auth/registro', { metodo: 'POST', cuerpo: datos }).then((r) => r.usuario),
  logout: () => pedir<void>('/auth/logout', { metodo: 'POST' }),
};
