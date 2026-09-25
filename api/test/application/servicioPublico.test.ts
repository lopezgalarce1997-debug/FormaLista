import { describe, expect, it } from 'vitest';
import { ServicioFormularios, type DatosFormulario } from '../../src/application/servicioFormularios.js';
import { ServicioPublico } from '../../src/application/servicioPublico.js';
import { FormulariosEnMemoria, RegistroEnMemoria, RespuestasEnMemoria } from '../dobles/formulariosEnMemoria.js';
import { EquiposEnMemoria } from '../dobles/equiposEnMemoria.js';

const ANA = 1;

const datos: DatosFormulario = {
  titulo: 'Encuesta de café',
  descripcion: 'Breve',
  preguntas: [
    { id: 'nombre', tipo: 'texto_corto', texto: '¿Tu nombre?', obligatoria: true },
    { id: 'favorito', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: false, opciones: ['Latte', 'Espresso'] },
  ],
};

async function crearEscenario(estado: 'borrador' | 'publicado' | 'cerrado' = 'publicado') {
  const registro = new RegistroEnMemoria();
  const formularios = new FormulariosEnMemoria();
  const respuestas = new RespuestasEnMemoria();
  const privado = new ServicioFormularios(registro, formularios, respuestas, new EquiposEnMemoria(), { error: () => {} });
  const publico = new ServicioPublico(registro, formularios, respuestas);

  const formulario = await privado.crear(ANA, datos);
  if (estado !== 'borrador') await privado.publicar(ANA, formulario.id);
  if (estado === 'cerrado') await privado.cerrar(ANA, formulario.id);

  return { publico, formulario, registro, formularios, respuestas };
}

describe('ServicioPublico.obtener', () => {
  it('devuelve un formulario publicado sin datos internos', async () => {
    const { publico, formulario } = await crearEscenario();

    const visto = await publico.obtener(formulario.slug);

    expect(visto).toEqual({
      slug: formulario.slug,
      titulo: 'Encuesta de café',
      descripcion: 'Breve',
      version: 1,
      preguntas: formulario.preguntas,
    });
  });

  it('responde no_encontrado para un borrador (no es público todavía)', async () => {
    const { publico, formulario } = await crearEscenario('borrador');

    await expect(publico.obtener(formulario.slug)).rejects.toMatchObject({ tipo: 'no_encontrado' });
  });

  it('responde no_disponible para un formulario cerrado', async () => {
    const { publico, formulario } = await crearEscenario('cerrado');

    await expect(publico.obtener(formulario.slug)).rejects.toMatchObject({
      tipo: 'no_disponible',
      message: 'Este formulario ya no acepta respuestas',
    });
  });

  it('responde no_encontrado para un slug que no existe', async () => {
    const { publico } = await crearEscenario();

    await expect(publico.obtener('no-existe-12345678')).rejects.toMatchObject({ tipo: 'no_encontrado' });
  });

  it('responde no_encontrado si el documento existe en Mongo pero no tiene registro en MySQL (huérfano)', async () => {
    const { publico, formulario, registro } = await crearEscenario();
    registro.filas.delete(formulario.id);

    await expect(publico.obtener(formulario.slug)).rejects.toMatchObject({ tipo: 'no_encontrado' });
  });
});

describe('ServicioPublico.responder', () => {
  it('guarda la respuesta normalizada junto con la versión del formulario', async () => {
    const { publico, formulario, respuestas } = await crearEscenario();

    const confirmacion = await publico.responder(formulario.slug, { nombre: '  Ana ', favorito: 'latte' });

    expect(confirmacion).toEqual({ id: expect.any(String), enviadaEn: expect.any(Date) });
    expect(respuestas.guardadas).toEqual([
      expect.objectContaining({
        formularioId: formulario.id,
        version: 1,
        respuestas: [
          { preguntaId: 'nombre', valor: 'Ana' },
          { preguntaId: 'favorito', valor: 'Latte' },
        ],
      }),
    ]);
  });

  it('rechaza respuestas inválidas con el detalle por pregunta y no guarda nada', async () => {
    const { publico, formulario, respuestas } = await crearEscenario();

    await expect(publico.responder(formulario.slug, { favorito: 'Mocca', extra: 1 })).rejects.toMatchObject({
      tipo: 'validacion',
      message: 'Hay respuestas inválidas',
      detalles: expect.arrayContaining([
        { campo: 'respuestas.extra', mensaje: 'La pregunta no existe en este formulario' },
        { campo: 'respuestas.nombre', mensaje: 'Es obligatoria' },
        { campo: 'respuestas.favorito', mensaje: 'Opción no válida: "Mocca"' },
      ]),
    });
    expect(respuestas.guardadas).toHaveLength(0);
  });

  it.each([
    ['borrador', 'no_encontrado'],
    ['cerrado', 'no_disponible'],
  ] as const)('no acepta respuestas de un formulario en %s', async (estado, tipo) => {
    const { publico, formulario, respuestas } = await crearEscenario(estado);

    await expect(publico.responder(formulario.slug, { nombre: 'Ana' })).rejects.toMatchObject({ tipo });
    expect(respuestas.guardadas).toHaveLength(0);
  });
});
