import type { Formulario, Pregunta } from '../domain/formulario.js';
import { validarRespuestas, type EntradaRespuestas } from '../domain/respuesta.js';
import { ErrorAplicacion } from './errores.js';
import type { RepositorioFormularios, RepositorioRegistroFormularios, RepositorioRespuestas } from './puertos.js';

/** Lo que ve quien responde: sin ids internos, propietario ni fechas de edición. */
export interface FormularioPublico {
  slug: string;
  titulo: string;
  descripcion: string;
  version: number;
  preguntas: Pregunta[];
}

export interface ConfirmacionRespuesta {
  id: string;
  enviadaEn: Date;
}

/** Casos de uso sin autenticación: ver un formulario publicado y responderlo. */
export class ServicioPublico {
  constructor(
    private readonly registro: RepositorioRegistroFormularios,
    private readonly formularios: RepositorioFormularios,
    private readonly respuestas: RepositorioRespuestas,
  ) {}

  async obtener(slug: string): Promise<FormularioPublico> {
    const { slug: s, titulo, descripcion, version, preguntas } = await this.buscarPublicado(slug);
    return { slug: s, titulo, descripcion, version, preguntas };
  }

  async responder(slug: string, entrada: EntradaRespuestas): Promise<ConfirmacionRespuesta> {
    const formulario = await this.buscarPublicado(slug);

    const resultado = validarRespuestas(formulario.preguntas, entrada);
    if (!resultado.valida) {
      throw new ErrorAplicacion(
        'validacion',
        'Hay respuestas inválidas',
        resultado.errores.map((e) => ({ campo: `respuestas.${e.preguntaId}`, mensaje: e.mensaje })),
      );
    }

    // Se guarda la versión respondida: si el formulario se edita después, esta respuesta
    // se sigue interpretando con sus preguntas originales (paso 8).
    const { id, enviadaEn } = await this.respuestas.crear({
      formularioId: formulario.id,
      version: formulario.version,
      respuestas: resultado.respuestas,
    });
    return { id, enviadaEn };
  }

  /**
   * El slug se busca en Mongo, pero quien decide si el formulario es público es MySQL:
   * sin registro (huérfano) o en borrador → 404, igual que si no existiera.
   */
  private async buscarPublicado(slug: string): Promise<Formulario> {
    const formulario = await this.formularios.buscarPorSlug(slug);
    const registro = formulario ? await this.registro.buscar(formulario.id) : null;

    if (!formulario || !registro || registro.estado === 'borrador') {
      throw new ErrorAplicacion('no_encontrado', 'Formulario no encontrado');
    }
    if (registro.estado === 'cerrado') {
      throw new ErrorAplicacion('no_disponible', 'Este formulario ya no acepta respuestas');
    }
    return formulario;
  }
}
