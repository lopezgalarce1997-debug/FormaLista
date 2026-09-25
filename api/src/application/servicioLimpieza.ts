import type { RepositorioFormularios, RepositorioRegistroFormularios, RepositorioRespuestas } from './puertos.js';

/**
 * Margen para no borrar un formulario que se está creando justo ahora
 * (ya existe en Mongo, pero todavía no tiene fila en MySQL).
 */
export const ANTIGUEDAD_MINIMA_MS = 10 * 60 * 1000;

export interface ResultadoLimpieza {
  formulariosEliminados: string[];
  respuestasEliminadas: number;
}

/**
 * Red de seguridad para lo que la compensación no alcanza a cubrir (por ejemplo, el proceso murió
 * entre las dos escrituras). Borra de MongoDB:
 * 1. Formularios sin fila en MySQL con más de ANTIGUEDAD_MINIMA_MS.
 * 2. Respuestas cuyo formulario no tiene fila en MySQL. Aquí no hace falta margen: un formulario que se
 *    está creando todavía no está publicado, así que no puede tener respuestas.
 */
export class ServicioLimpieza {
  constructor(
    private readonly registro: RepositorioRegistroFormularios,
    private readonly formularios: RepositorioFormularios,
    private readonly respuestas: RepositorioRespuestas,
  ) {}

  async limpiarHuerfanos(ahora: Date = new Date()): Promise<ResultadoLimpieza> {
    const limite = new Date(ahora.getTime() - ANTIGUEDAD_MINIMA_MS);

    const formulariosHuerfanos = await this.sinRegistro(await this.formularios.listarIdsCreadosAntesDe(limite));
    for (const id of formulariosHuerfanos) {
      await this.formularios.eliminar(id);
    }

    // Se revisa después de borrar formularios: incluye las respuestas de los que se acaban de limpiar.
    const conRespuestasHuerfanas = await this.sinRegistro(await this.respuestas.listarIdsDeFormularios());
    let respuestasEliminadas = 0;
    for (const formularioId of conRespuestasHuerfanas) {
      respuestasEliminadas += await this.respuestas.eliminarPorFormulario(formularioId);
    }

    return { formulariosEliminados: formulariosHuerfanos, respuestasEliminadas };
  }

  private async sinRegistro(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const existentes = await this.registro.filtrarExistentes(ids);
    return ids.filter((id) => !existentes.has(id));
  }
}
