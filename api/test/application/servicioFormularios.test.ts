import { describe, expect, it, vi } from 'vitest';
import { ServicioFormularios, type DatosFormulario } from '../../src/application/servicioFormularios.js';
import { FormulariosEnMemoria, RegistroEnMemoria, RespuestasEnMemoria } from '../dobles/formulariosEnMemoria.js';
import { EquiposEnMemoria } from '../dobles/equiposEnMemoria.js';

const ANA = 1;
const BETO = 2;

function crearEscenario() {
  const registro = new RegistroEnMemoria();
  const formularios = new FormulariosEnMemoria();
  const respuestas = new RespuestasEnMemoria();
  const logger = { error: vi.fn() };
  const servicio = new ServicioFormularios(registro, formularios, respuestas, new EquiposEnMemoria(), logger, () => 'sufijo01');
  return { servicio, registro, formularios, respuestas, logger };
}

const datos: DatosFormulario = {
  titulo: 'Encuesta de café',
  descripcion: '',
  preguntas: [
    { tipo: 'texto_corto', texto: '¿Tu nombre?', obligatoria: true },
    { id: 'favorito', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: false, opciones: ['Latte', 'Espresso'] },
  ],
};

describe('ServicioFormularios.crear', () => {
  it('escribe en ambas bases y devuelve el formulario en borrador', async () => {
    const { servicio, registro, formularios } = crearEscenario();

    const creado = await servicio.crear(ANA, datos);

    expect(creado).toMatchObject({ titulo: 'Encuesta de café', slug: 'encuesta-de-cafe-sufijo01', estado: 'borrador' });
    expect(formularios.documentos.has(creado.id)).toBe(true);
    expect(registro.filas.get(creado.id)).toMatchObject({ propietarioId: ANA, estado: 'borrador' });
  });

  it('genera ids para las preguntas que no traen uno y respeta los existentes', async () => {
    const { servicio } = crearEscenario();

    const { preguntas } = await servicio.crear(ANA, datos);

    expect(preguntas[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(preguntas[1]?.id).toBe('favorito');
  });

  it('rechaza una definición inválida sin escribir en ninguna base', async () => {
    const { servicio, registro, formularios } = crearEscenario();
    const invalido: DatosFormulario = {
      ...datos,
      preguntas: [{ tipo: 'escala', texto: 'x', obligatoria: false, minimo: 5, maximo: 1 }],
    };

    await expect(servicio.crear(ANA, invalido)).rejects.toMatchObject({ tipo: 'validacion' });
    expect(formularios.documentos.size).toBe(0);
    expect(registro.filas.size).toBe(0);
  });

  describe('consistencia entre bases cuando una escritura falla', () => {
    it('si falla MongoDB, no se escribe nada en MySQL', async () => {
      const { servicio, registro, formularios } = crearEscenario();
      formularios.fallarEn('crear');

      await expect(servicio.crear(ANA, datos)).rejects.toThrow('Falla simulada');
      expect(registro.filas.size).toBe(0);
    });

    it('si falla MySQL, se compensa borrando el documento de MongoDB', async () => {
      const { servicio, registro, formularios, logger } = crearEscenario();
      registro.fallarEn('crear');

      await expect(servicio.crear(ANA, datos)).rejects.toThrow('RegistroEnMemoria.crear');
      expect(formularios.documentos.size).toBe(0);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('si también falla la compensación, propaga el error ORIGINAL y registra el huérfano', async () => {
      const { servicio, registro, formularios, logger } = crearEscenario();
      registro.fallarEn('crear');
      formularios.fallarEn('eliminar');

      await expect(servicio.crear(ANA, datos)).rejects.toThrow('RegistroEnMemoria.crear');
      const [huerfanoId] = [...formularios.documentos.keys()];
      expect(huerfanoId).toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Compensación fallida'),
        expect.objectContaining({ formularioId: huerfanoId }),
      );
    });
  });
});

describe('ServicioFormularios: lectura y edición', () => {
  it('lista solo los formularios del usuario, con su estado y cantidad de preguntas', async () => {
    const { servicio } = crearEscenario();
    const deAna = await servicio.crear(ANA, datos);
    await servicio.crear(BETO, { ...datos, titulo: 'De Beto' });

    const lista = await servicio.listar(ANA);

    expect(lista).toEqual([
      expect.objectContaining({ id: deAna.id, titulo: 'Encuesta de café', estado: 'borrador', cantidadPreguntas: 2 }),
    ]);
  });

  it('omite de la lista (y registra) un registro de MySQL sin contenido en MongoDB', async () => {
    const { servicio, formularios, logger } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);
    formularios.documentos.delete(creado.id);

    expect(await servicio.listar(ANA)).toEqual([]);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('responde no_encontrado al pedir o editar un formulario ajeno', async () => {
    const { servicio } = crearEscenario();
    const deAna = await servicio.crear(ANA, datos);

    await expect(servicio.obtener(BETO, deAna.id)).rejects.toMatchObject({ tipo: 'no_encontrado' });
    await expect(servicio.actualizar(BETO, deAna.id, { ...datos, version: 1 })).rejects.toMatchObject({
      tipo: 'no_encontrado',
    });
  });

  it('actualiza título y preguntas conservando el slug', async () => {
    const { servicio } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);

    const editado = await servicio.actualizar(ANA, creado.id, {
      ...datos,
      titulo: 'Nuevo título',
      preguntas: [],
      version: 1,
    });

    // En borrador se edita en el lugar: la versión no sube.
    expect(editado).toMatchObject({ titulo: 'Nuevo título', preguntas: [], slug: creado.slug, estado: 'borrador', version: 1 });
  });
});

describe('ServicioFormularios.eliminar', () => {
  it('borra el registro en MySQL, el formulario y sus respuestas en MongoDB', async () => {
    const { servicio, registro, formularios, respuestas } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);
    const otro = await servicio.crear(ANA, datos);
    respuestas.agregar(creado.id, 3);
    respuestas.agregar(otro.id, 2);

    await servicio.eliminar(ANA, creado.id);

    expect(registro.filas.has(creado.id)).toBe(false);
    expect(formularios.documentos.has(creado.id)).toBe(false);
    expect(respuestas.contarDe(creado.id)).toBe(0);
    expect(respuestas.contarDe(otro.id)).toBe(2); // no toca las de otros formularios
  });

  it('si MongoDB falla, termina sin error, el formulario deja de existir y se registran los huérfanos', async () => {
    const { servicio, registro, formularios, respuestas, logger } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);
    respuestas.agregar(creado.id, 3);
    formularios.fallarEn('eliminar');
    respuestas.fallarEn('eliminarPorFormulario');

    await expect(servicio.eliminar(ANA, creado.id)).resolves.toBeUndefined();

    expect(registro.filas.has(creado.id)).toBe(false);
    await expect(servicio.obtener(ANA, creado.id)).rejects.toMatchObject({ tipo: 'no_encontrado' });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('si falla solo el borrado de respuestas, igual borra el formulario', async () => {
    const { servicio, formularios, respuestas } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);
    respuestas.agregar(creado.id);
    respuestas.fallarEn('eliminarPorFormulario');

    await servicio.eliminar(ANA, creado.id);

    expect(formularios.documentos.has(creado.id)).toBe(false);
    expect(respuestas.contarDe(creado.id)).toBe(1); // huérfana: la limpiará ServicioLimpieza
  });

  it('si falla MySQL, no borra nada en MongoDB y propaga el error', async () => {
    const { servicio, registro, formularios } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);
    registro.fallarEn('eliminar');

    await expect(servicio.eliminar(ANA, creado.id)).rejects.toThrow('Falla simulada');
    expect(formularios.documentos.has(creado.id)).toBe(true);
  });

  it('no permite borrar un formulario ajeno', async () => {
    const { servicio, registro } = crearEscenario();
    const deAna = await servicio.crear(ANA, datos);

    await expect(servicio.eliminar(BETO, deAna.id)).rejects.toMatchObject({ tipo: 'no_encontrado' });
    expect(registro.filas.has(deAna.id)).toBe(true);
  });
});

describe('ServicioFormularios: publicar y cerrar', () => {
  it('publica un borrador y lo cierra', async () => {
    const { servicio, registro } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);

    expect(await servicio.publicar(ANA, creado.id)).toMatchObject({ id: creado.id, estado: 'publicado' });
    expect(registro.filas.get(creado.id)?.estado).toBe('publicado');

    expect(await servicio.cerrar(ANA, creado.id)).toMatchObject({ estado: 'cerrado' });
    expect(registro.filas.get(creado.id)?.estado).toBe('cerrado');
  });

  it('permite reabrir (publicar) un formulario cerrado', async () => {
    const { servicio } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);
    await servicio.publicar(ANA, creado.id);
    await servicio.cerrar(ANA, creado.id);

    expect(await servicio.publicar(ANA, creado.id)).toMatchObject({ estado: 'publicado' });
  });

  it('responde conflicto si la transición no aplica al estado actual', async () => {
    const { servicio } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);

    await expect(servicio.cerrar(ANA, creado.id)).rejects.toMatchObject({
      tipo: 'conflicto',
      message: 'Solo se puede cerrar un formulario publicado',
    });
    await servicio.publicar(ANA, creado.id);
    await expect(servicio.publicar(ANA, creado.id)).rejects.toMatchObject({ tipo: 'conflicto' });
  });

  it('responde validación al publicar un formulario sin preguntas', async () => {
    const { servicio, registro } = crearEscenario();
    const vacio = await servicio.crear(ANA, { ...datos, preguntas: [] });

    await expect(servicio.publicar(ANA, vacio.id)).rejects.toMatchObject({ tipo: 'validacion' });
    expect(registro.filas.get(vacio.id)?.estado).toBe('borrador');
  });

  it('responde conflicto si otra petición cambió el estado entre la lectura y el UPDATE', async () => {
    const { servicio, registro } = crearEscenario();
    const creado = await servicio.crear(ANA, datos);
    // Simula la carrera: la lectura ve "borrador", pero el UPDATE condicionado ya no aplica.
    registro.cambiarEstado = async () => false;

    await expect(servicio.publicar(ANA, creado.id)).rejects.toMatchObject({
      tipo: 'conflicto',
      message: 'El estado del formulario cambió; vuelve a intentarlo',
    });
  });

  it('no permite publicar ni cerrar un formulario ajeno', async () => {
    const { servicio } = crearEscenario();
    const deAna = await servicio.crear(ANA, datos);

    await expect(servicio.publicar(BETO, deAna.id)).rejects.toMatchObject({ tipo: 'no_encontrado' });
    await expect(servicio.cerrar(BETO, deAna.id)).rejects.toMatchObject({ tipo: 'no_encontrado' });
  });
});
