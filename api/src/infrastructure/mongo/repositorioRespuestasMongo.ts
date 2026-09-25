import type { RepositorioRespuestas } from '../../application/puertos.js';
import { ModeloRespuesta } from './modelos.js';

export class RepositorioRespuestasMongo implements RepositorioRespuestas {
  async eliminarPorFormulario(formularioId: string): Promise<number> {
    const resultado = await ModeloRespuesta.deleteMany({ formularioId });
    return resultado.deletedCount;
  }

  async listarIdsDeFormularios(): Promise<string[]> {
    const ids = await ModeloRespuesta.distinct('formularioId');
    return ids.map(String);
  }
}
