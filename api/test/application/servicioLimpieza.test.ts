import { describe, expect, it } from 'vitest';
import { ANTIGUEDAD_MINIMA_MS, ServicioLimpieza } from '../../src/application/servicioLimpieza.js';
import { FormulariosEnMemoria, RegistroEnMemoria, RespuestasEnMemoria } from '../dobles/formulariosEnMemoria.js';

const AHORA = new Date('2026-09-25T12:00:00Z');
const hace = (ms: number) => new Date(AHORA.getTime() - ms);
const contenido = { titulo: 'x', descripcion: '', preguntas: [], slug: 'x' };

function crearEscenario() {
  const registro = new RegistroEnMemoria();
  const formularios = new FormulariosEnMemoria();
  const respuestas = new RespuestasEnMemoria();
  const limpieza = new ServicioLimpieza(registro, formularios, respuestas);

  /** Crea un formulario en "Mongo" con la antigüedad indicada y, si se pide, su fila en "MySQL". */
  async function formulario(antiguedadMs: number, conRegistro: boolean) {
    const f = await formularios.crear(contenido, hace(antiguedadMs));
    if (conRegistro) await registro.crear({ idMongo: f.id, propietarioId: 1 });
    return f.id;
  }

  return { limpieza, formularios, respuestas, formulario };
}

describe('ServicioLimpieza.limpiarHuerfanos', () => {
  it('borra formularios sin registro en MySQL y con más de 10 minutos, junto con sus respuestas', async () => {
    const { limpieza, formularios, respuestas, formulario } = crearEscenario();
    const huerfano = await formulario(ANTIGUEDAD_MINIMA_MS + 1000, false);
    respuestas.agregar(huerfano, 2);

    const resultado = await limpieza.limpiarHuerfanos(AHORA);

    expect(resultado).toEqual({ formulariosEliminados: [huerfano], respuestasEliminadas: 2 });
    expect(formularios.documentos.has(huerfano)).toBe(false);
    expect(respuestas.contarDe(huerfano)).toBe(0);
  });

  it('NO borra un formulario sin registro si es reciente (puede estar creándose)', async () => {
    const { limpieza, formularios, formulario } = crearEscenario();
    const enCreacion = await formulario(ANTIGUEDAD_MINIMA_MS - 1000, false);

    const resultado = await limpieza.limpiarHuerfanos(AHORA);

    expect(resultado.formulariosEliminados).toEqual([]);
    expect(formularios.documentos.has(enCreacion)).toBe(true);
  });

  it('NO borra formularios con registro, ni sus respuestas, aunque sean antiguos', async () => {
    const { limpieza, formularios, respuestas, formulario } = crearEscenario();
    const vigente = await formulario(ANTIGUEDAD_MINIMA_MS * 100, true);
    respuestas.agregar(vigente, 5);

    const resultado = await limpieza.limpiarHuerfanos(AHORA);

    expect(resultado).toEqual({ formulariosEliminados: [], respuestasEliminadas: 0 });
    expect(formularios.documentos.has(vigente)).toBe(true);
    expect(respuestas.contarDe(vigente)).toBe(5);
  });

  it('borra respuestas huérfanas aunque su formulario ya no exista en MongoDB', async () => {
    // Caso real: al eliminar, se borró el registro y el formulario, pero falló el borrado de respuestas.
    const { limpieza, respuestas } = crearEscenario();
    const idBorrado = 'f'.repeat(24);
    respuestas.agregar(idBorrado, 4);

    const resultado = await limpieza.limpiarHuerfanos(AHORA);

    expect(resultado.respuestasEliminadas).toBe(4);
    expect(respuestas.contarDe(idBorrado)).toBe(0);
  });

  it('en un escenario mixto borra solo lo huérfano', async () => {
    const { limpieza, formularios, respuestas, formulario } = crearEscenario();
    const vigente = await formulario(ANTIGUEDAD_MINIMA_MS * 2, true);
    const huerfano = await formulario(ANTIGUEDAD_MINIMA_MS * 2, false);
    const reciente = await formulario(0, false);
    respuestas.agregar(vigente, 1);
    respuestas.agregar('e'.repeat(24), 3);

    const resultado = await limpieza.limpiarHuerfanos(AHORA);

    expect(resultado).toEqual({ formulariosEliminados: [huerfano], respuestasEliminadas: 3 });
    expect([...formularios.documentos.keys()].sort()).toEqual([vigente, reciente].sort());
    expect(respuestas.contarDe(vigente)).toBe(1);
  });

  it('no hace nada si no hay datos', async () => {
    const { limpieza } = crearEscenario();

    expect(await limpieza.limpiarHuerfanos(AHORA)).toEqual({ formulariosEliminados: [], respuestasEliminadas: 0 });
  });
});
