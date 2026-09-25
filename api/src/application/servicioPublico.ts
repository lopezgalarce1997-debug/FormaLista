import {
  type ConfirmacionRespuesta,
  type EntradaRespuestas,
  type Formulario,
  type FormularioPublico,
  type Pregunta,
  preguntasDeVersion,
  validarRespuestas,
} from '@formalista/compartido';
import { ErrorAplicacion } from './errores.js';
import type { RepositorioFormularios, RepositorioRegistroFormularios, RepositorioRespuestas } from './puertos.js';

// Contratos de respuesta: definidos en el paquete compartido (los usa también la web).
export type { ConfirmacionRespuesta, FormularioPublico } from '@formalista/compartido';

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

  /**
   * @param version versión que vio quien responde. Si el formulario se editó mientras respondía,
   * se acepta igual y se valida contra ESA versión (sus preguntas siguen en el historial).
   * Si no se indica, se usa la vigente.
   */
  async responder(slug: string, entrada: EntradaRespuestas, version?: number): Promise<ConfirmacionRespuesta> {
    const formulario = await this.buscarPublicado(slug);
    const versionRespondida = version ?? formulario.version;
    const preguntas = await this.preguntasDeVersion(formulario, versionRespondida);

    const resultado = validarRespuestas(preguntas, entrada);
    if (!resultado.valida) {
      throw new ErrorAplicacion(
        'validacion',
        'Hay respuestas inválidas',
        resultado.errores.map((e) => ({ campo: `respuestas.${e.preguntaId}`, mensaje: e.mensaje })),
      );
    }

    // Se guarda la versión respondida: si el formulario se edita después, esta respuesta
    // se sigue interpretando con sus preguntas originales.
    const { id, enviadaEn } = await this.respuestas.crear({
      formularioId: formulario.id,
      version: versionRespondida,
      respuestas: resultado.respuestas,
    });
    return { id, enviadaEn };
  }

  private async preguntasDeVersion(formulario: Formulario, version: number): Promise<Pregunta[]> {
    // Caso común: la vigente ya viene en el documento, sin leer el historial.
    if (version === formulario.version) return formulario.preguntas;

    const preguntas = preguntasDeVersion((await this.formularios.obtenerVersiones(formulario.id)) ?? [], version);
    if (!preguntas) {
      throw new ErrorAplicacion('validacion', 'La versión del formulario no existe', [
        { campo: 'version', mensaje: `No existe la versión ${version}` },
      ]);
    }
    return preguntas;
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
