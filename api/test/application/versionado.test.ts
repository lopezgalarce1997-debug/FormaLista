import { describe, expect, it } from 'vitest';
import { ServicioFormularios, type DatosFormulario } from '../../src/application/servicioFormularios.js';
import { ServicioPublico } from '../../src/application/servicioPublico.js';
import { FormulariosEnMemoria, RegistroEnMemoria, RespuestasEnMemoria } from '../dobles/formulariosEnMemoria.js';
import { EquiposEnMemoria } from '../dobles/equiposEnMemoria.js';

const ANA = 1;

/** Versión 1: nombre (texto) + favorito (opción única). */
const v1: DatosFormulario = {
  titulo: 'Encuesta de café',
  descripcion: '',
  preguntas: [
    { id: 'nombre', tipo: 'texto_corto', texto: '¿Tu nombre?', obligatoria: true },
    { id: 'favorito', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: true, opciones: ['Latte', 'Espresso'] },
  ],
};

/** Versión 2: se quita "favorito" y se agrega "nota" (escala). */
const v2: DatosFormulario = {
  ...v1,
  preguntas: [
    { id: 'nombre', tipo: 'texto_corto', texto: '¿Cómo te llamas?', obligatoria: true },
    { id: 'nota', tipo: 'escala', texto: 'Nota', obligatoria: true, minimo: 1, maximo: 5 },
  ],
};

async function crearEscenario(publicar = true) {
  const registro = new RegistroEnMemoria();
  const formularios = new FormulariosEnMemoria();
  const respuestas = new RespuestasEnMemoria();
  const servicio = new ServicioFormularios(registro, formularios, respuestas, new EquiposEnMemoria(), { error: () => {} });
  const publico = new ServicioPublico(registro, formularios, respuestas);

  const formulario = await servicio.crear(ANA, v1);
  if (publicar) await servicio.publicar(ANA, formulario.id);
  return { servicio, publico, formularios, respuestas, id: formulario.id, slug: formulario.slug };
}

describe('Versionado al editar', () => {
  it('en un formulario publicado, cambiar preguntas crea la versión 2 y archiva la 1', async () => {
    const { servicio, formularios, id } = await crearEscenario();

    const editado = await servicio.actualizar(ANA, id, { ...v2, version: 1 });

    expect(editado.version).toBe(2);
    expect(editado.preguntas.map((p) => p.id)).toEqual(['nombre', 'nota']);
    expect(await formularios.obtenerVersiones(id)).toEqual([
      { version: 1, preguntas: expect.arrayContaining([expect.objectContaining({ id: 'favorito' })]), reemplazadaEn: expect.any(Date) },
      { version: 2, preguntas: editado.preguntas, reemplazadaEn: null },
    ]);
  });

  it('dos ediciones seguidas dejan las versiones 1 y 2 en el historial', async () => {
    const { servicio, formularios, id } = await crearEscenario();
    await servicio.actualizar(ANA, id, { ...v2, version: 1 });

    const tercera = await servicio.actualizar(ANA, id, { ...v1, version: 2 });

    expect(tercera.version).toBe(3);
    expect((await formularios.obtenerVersiones(id))?.map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it('cambiar solo el título no crea versión', async () => {
    const { servicio, formularios, id } = await crearEscenario();

    const editado = await servicio.actualizar(ANA, id, { ...v1, titulo: 'Otro título', version: 1 });

    expect(editado).toMatchObject({ titulo: 'Otro título', version: 1 });
    expect(formularios.historial.get(id)).toBeUndefined();
  });

  it('en borrador, cambiar preguntas no crea versión', async () => {
    const { servicio, formularios, id } = await crearEscenario(false);

    const editado = await servicio.actualizar(ANA, id, { ...v2, version: 1 });

    expect(editado.version).toBe(1);
    expect(formularios.historial.get(id)).toBeUndefined();
  });

  it('rechaza (409) si el cliente editaba una versión que ya no es la vigente', async () => {
    const { servicio, formularios, id } = await crearEscenario();
    await servicio.actualizar(ANA, id, { ...v2, version: 1 }); // otra persona ya creó la v2

    await expect(servicio.actualizar(ANA, id, { ...v1, titulo: 'Pisado', version: 1 })).rejects.toMatchObject({
      tipo: 'conflicto',
      message: 'El formulario fue modificado por otra persona; recarga para ver la última versión',
    });
    expect(formularios.documentos.get(id)?.titulo).toBe('Encuesta de café');
  });

  it('rechaza (409) si la versión cambió entre la lectura y la escritura', async () => {
    const { servicio, formularios, id } = await crearEscenario();
    formularios.actualizar = async () => null; // simula que el filtro { _id, version } no coincidió

    await expect(servicio.actualizar(ANA, id, { ...v2, version: 1 })).rejects.toMatchObject({ tipo: 'conflicto' });
  });

  it('en un formulario publicado, rechaza cambiar el tipo de una pregunta existente', async () => {
    const { servicio, id } = await crearEscenario();
    const cambiaTipo: DatosFormulario = {
      ...v1,
      preguntas: [
        v1.preguntas[0]!,
        { id: 'favorito', tipo: 'opcion_multiple', texto: '¿Favoritos?', obligatoria: true, opciones: ['Latte', 'Espresso'] },
      ],
    };

    await expect(servicio.actualizar(ANA, id, { ...cambiaTipo, version: 1 })).rejects.toMatchObject({
      tipo: 'validacion',
      message: expect.stringContaining('no se puede cambiar el tipo'),
    });
  });

  it('en borrador sí permite cambiar el tipo (todavía no hay respuestas)', async () => {
    const { servicio, id } = await crearEscenario(false);
    const cambiaTipo: DatosFormulario = {
      ...v1,
      preguntas: [{ id: 'favorito', tipo: 'texto_corto', texto: 'x', obligatoria: false }],
    };

    await expect(servicio.actualizar(ANA, id, { ...cambiaTipo, version: 1 })).resolves.toMatchObject({ version: 1 });
  });
});

describe('Responder con versiones', () => {
  it('sin indicar versión, se valida contra la vigente y se guarda con ella', async () => {
    const { servicio, publico, respuestas, id, slug } = await crearEscenario();
    await servicio.actualizar(ANA, id, { ...v2, version: 1 });

    await publico.responder(slug, { nombre: 'Ana', nota: 4 });

    expect(respuestas.guardadas[0]).toMatchObject({ version: 2 });
  });

  it('con una versión antigua, se acepta y se valida contra ESA versión', async () => {
    // Quien responde cargó la v1; mientras respondía, el formulario pasó a la v2.
    const { servicio, publico, respuestas, id, slug } = await crearEscenario();
    await servicio.actualizar(ANA, id, { ...v2, version: 1 });

    await publico.responder(slug, { nombre: 'Beto', favorito: 'espresso' }, 1);

    expect(respuestas.guardadas[0]).toMatchObject({
      version: 1,
      respuestas: [
        { preguntaId: 'nombre', valor: 'Beto' },
        { preguntaId: 'favorito', valor: 'Espresso' },
      ],
    });
  });

  it('con una versión antigua, rechaza respuestas que solo calzan con la vigente', async () => {
    const { servicio, publico, id, slug } = await crearEscenario();
    await servicio.actualizar(ANA, id, { ...v2, version: 1 });

    await expect(publico.responder(slug, { nombre: 'Beto', nota: 4 }, 1)).rejects.toMatchObject({
      tipo: 'validacion',
      detalles: expect.arrayContaining([
        { campo: 'respuestas.nota', mensaje: 'La pregunta no existe en este formulario' },
        { campo: 'respuestas.favorito', mensaje: 'Es obligatoria' },
      ]),
    });
  });

  it('rechaza una versión que no existe', async () => {
    const { publico, respuestas, slug } = await crearEscenario();

    await expect(publico.responder(slug, { nombre: 'x', favorito: 'Latte' }, 7)).rejects.toMatchObject({
      tipo: 'validacion',
      detalles: [{ campo: 'version', mensaje: 'No existe la versión 7' }],
    });
    expect(respuestas.guardadas).toHaveLength(0);
  });

  it('si el formulario está cerrado responde no_disponible (410), aunque indique una versión', async () => {
    const { servicio, publico, id, slug } = await crearEscenario();
    await servicio.cerrar(ANA, id);

    await expect(publico.responder(slug, { nombre: 'x', favorito: 'Latte' }, 1)).rejects.toMatchObject({
      tipo: 'no_disponible',
    });
  });

  it('las respuestas antiguas se siguen interpretando con sus preguntas originales', async () => {
    const { servicio, publico, formularios, respuestas, id, slug } = await crearEscenario();
    await publico.responder(slug, { nombre: 'Ana', favorito: 'Latte' }); // v1
    await servicio.actualizar(ANA, id, { ...v2, version: 1 });
    await publico.responder(slug, { nombre: 'Beto', nota: 5 }); // v2

    const versiones = (await formularios.obtenerVersiones(id))!;
    const interpretadas = respuestas.guardadas.map((r) => {
      const preguntas = versiones.find((v) => v.version === r.version)!.preguntas;
      return r.respuestas.map((x) => `${preguntas.find((p) => p.id === x.preguntaId)!.texto} ${String(x.valor)}`);
    });

    expect(interpretadas).toEqual([
      ['¿Tu nombre? Ana', '¿Favorito? Latte'],
      ['¿Cómo te llamas? Beto', 'Nota 5'],
    ]);
  });
});
