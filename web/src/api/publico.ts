import type { ConfirmacionRespuesta, DatosEnvio, FormularioPublico, Serializado } from '@formalista/compartido';
import { pedir } from './cliente';

export type FormularioParaResponder = Serializado<FormularioPublico>;

export const clavesPublico = {
  formulario: (slug: string) => ['publico', slug] as const,
};

/** Endpoints sin sesión: cualquiera con el link. */
export const apiPublico = {
  obtener: (slug: string) => pedir<FormularioParaResponder>(`/publico/${encodeURIComponent(slug)}`),
  /** `version`: la que se cargó; si el formulario cambió mientras se respondía, la API valida contra ella. */
  responder: (slug: string, envio: DatosEnvio) =>
    pedir<Serializado<ConfirmacionRespuesta>>(`/publico/${encodeURIComponent(slug)}/respuestas`, { metodo: 'POST', cuerpo: envio }),
};
