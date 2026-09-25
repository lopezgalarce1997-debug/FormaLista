import { beforeEach, describe, expect, it } from 'vitest';
import { ServicioEquipos } from '../../src/application/servicioEquipos.js';
import { ServicioFormularios, type DatosFormulario } from '../../src/application/servicioFormularios.js';
import { ServicioResultados } from '../../src/application/servicioResultados.js';
import { EquiposEnMemoria } from '../dobles/equiposEnMemoria.js';
import { FormulariosEnMemoria, RegistroEnMemoria, RespuestasEnMemoria } from '../dobles/formulariosEnMemoria.js';
import { RepositorioUsuariosEnMemoria } from '../dobles/repositorioUsuariosEnMemoria.js';

const datos: DatosFormulario = {
  titulo: 'Café',
  descripcion: '',
  preguntas: [{ id: 'fav', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: true, opciones: ['A', 'B'] }],
};

/**
 * Escenario: Ana crea el equipo "Marketing" y un formulario que comparte con él.
 * Beto es editor del equipo, Carla lectora, Diego no es miembro, y Eva es la otra propietaria del equipo.
 */
async function crearEscenario() {
  const usuarios = new RepositorioUsuariosEnMemoria();
  const [ana, beto, carla, diego, eva] = await Promise.all(
    ['ana', 'beto', 'carla', 'diego', 'eva'].map((n) => usuarios.crear({ nombre: n, email: `${n}@x.cl`, passwordHash: 'h' })),
  );
  const equiposRepo = new EquiposEnMemoria(usuarios);
  const registro = new RegistroEnMemoria(equiposRepo);
  const formularios = new FormulariosEnMemoria();
  const respuestas = new RespuestasEnMemoria();
  const servicio = new ServicioFormularios(registro, formularios, respuestas, equiposRepo, { error: () => {} });
  const resultados = new ServicioResultados(registro, formularios, respuestas, { error: () => {} });
  const equipos = new ServicioEquipos(equiposRepo, usuarios);

  const equipo = await equipos.crear(ana!.id, 'Marketing');
  await equipos.agregarMiembro(ana!.id, equipo.id, 'beto@x.cl', 'editor');
  await equipos.agregarMiembro(ana!.id, equipo.id, 'carla@x.cl', 'lector');
  await equipos.agregarMiembro(ana!.id, equipo.id, 'eva@x.cl', 'propietario');
  const formulario = await servicio.crear(ana!.id, datos);
  await servicio.compartir(ana!.id, formulario.id, equipo.id);

  return {
    servicio,
    resultados,
    equipos,
    equiposRepo,
    registro,
    id: formulario.id,
    equipoId: equipo.id,
    ANA: ana!.id,
    BETO: beto!.id,
    CARLA: carla!.id,
    DIEGO: diego!.id,
    EVA: eva!.id,
  };
}

describe('Permisos sobre formularios compartidos', () => {
  let e: Awaited<ReturnType<typeof crearEscenario>>;
  beforeEach(async () => {
    e = await crearEscenario();
  });

  it('cada usuario ve su rol y el equipo en el detalle', async () => {
    expect(await e.servicio.obtener(e.ANA, e.id)).toMatchObject({ rol: 'propietario', equipo: { nombre: 'Marketing' } });
    expect((await e.servicio.obtener(e.BETO, e.id)).rol).toBe('editor');
    expect((await e.servicio.obtener(e.CARLA, e.id)).rol).toBe('lector');
    expect((await e.servicio.obtener(e.EVA, e.id)).rol).toBe('editor'); // propietaria del EQUIPO → editora
  });

  it('el listado incluye los formularios compartidos con mis equipos, con mi rol', async () => {
    const deCarla = await e.servicio.listar(e.CARLA);
    const deDiego = await e.servicio.listar(e.DIEGO);

    expect(deCarla).toEqual([expect.objectContaining({ id: e.id, rol: 'lector', equipo: { id: e.equipoId, nombre: 'Marketing' } })]);
    expect(deDiego).toEqual([]);
  });

  it('sin ningún acceso → 404 en todas las operaciones', async () => {
    const operaciones = [
      () => e.servicio.obtener(e.DIEGO, e.id),
      () => e.servicio.actualizar(e.DIEGO, e.id, { ...datos, version: 1 }),
      () => e.servicio.publicar(e.DIEGO, e.id),
      () => e.servicio.eliminar(e.DIEGO, e.id),
      () => e.servicio.compartir(e.DIEGO, e.id, null),
      () => e.resultados.obtenerResultados(e.DIEGO, e.id, { version: 'todas', zona: 'UTC' }),
    ];

    for (const operacion of operaciones) {
      await expect(operacion()).rejects.toMatchObject({ tipo: 'no_encontrado' });
    }
  });

  it('lector: ve el formulario y sus resultados, pero no edita, publica, borra ni comparte (403)', async () => {
    await expect(e.servicio.obtener(e.CARLA, e.id)).resolves.toBeDefined();
    await expect(e.resultados.obtenerResultados(e.CARLA, e.id, { version: 'todas', zona: 'UTC' })).resolves.toBeDefined();

    await expect(e.servicio.actualizar(e.CARLA, e.id, { ...datos, version: 1 })).rejects.toMatchObject({
      tipo: 'prohibido',
      message: 'Tu rol (lector) no permite editar este formulario',
    });
    await expect(e.servicio.publicar(e.CARLA, e.id)).rejects.toMatchObject({ tipo: 'prohibido' });
    await expect(e.servicio.eliminar(e.CARLA, e.id)).rejects.toMatchObject({ tipo: 'prohibido' });
    await expect(e.servicio.compartir(e.CARLA, e.id, null)).rejects.toMatchObject({ tipo: 'prohibido' });
  });

  it('editor: edita y publica, pero no borra ni comparte (403)', async () => {
    await expect(e.servicio.actualizar(e.BETO, e.id, { ...datos, titulo: 'Editado', version: 1 })).resolves.toMatchObject({
      titulo: 'Editado',
      rol: 'editor',
    });
    await expect(e.servicio.publicar(e.BETO, e.id)).resolves.toMatchObject({ estado: 'publicado' });

    await expect(e.servicio.eliminar(e.BETO, e.id)).rejects.toMatchObject({
      tipo: 'prohibido',
      message: 'Tu rol (editor) no permite eliminar este formulario',
    });
    await expect(e.servicio.compartir(e.BETO, e.id, null)).rejects.toMatchObject({ tipo: 'prohibido' });
  });

  it('la propietaria del EQUIPO no puede borrar un formulario ajeno del equipo', async () => {
    await expect(e.servicio.eliminar(e.EVA, e.id)).rejects.toMatchObject({ tipo: 'prohibido' });
  });

  it('dejar de compartir quita el acceso a los miembros del equipo', async () => {
    await e.servicio.compartir(e.ANA, e.id, null);

    await expect(e.servicio.obtener(e.BETO, e.id)).rejects.toMatchObject({ tipo: 'no_encontrado' });
    expect((await e.servicio.obtener(e.ANA, e.id)).equipo).toBeNull();
  });

  it('quitar a un miembro del equipo le quita el acceso a sus formularios', async () => {
    await e.equipos.quitarMiembro(e.ANA, e.equipoId, e.BETO);

    await expect(e.servicio.obtener(e.BETO, e.id)).rejects.toMatchObject({ tipo: 'no_encontrado' });
  });

  it('no se puede compartir con un equipo del que no se es miembro (404, no se revela que existe)', async () => {
    const otroEquipo = await e.equipos.crear(e.DIEGO, 'De Diego');

    await expect(e.servicio.compartir(e.ANA, e.id, otroEquipo.id)).rejects.toMatchObject({
      tipo: 'no_encontrado',
      message: 'Equipo no encontrado',
    });
  });
});

describe('ServicioEquipos', () => {
  let e: Awaited<ReturnType<typeof crearEscenario>>;
  beforeEach(async () => {
    e = await crearEscenario();
  });

  it('crear deja al creador como propietario', async () => {
    const equipo = await e.equipos.crear(e.DIEGO, '  Ventas  ');

    expect(equipo).toMatchObject({ nombre: 'Ventas', rol: 'propietario', miembros: [{ usuarioId: e.DIEGO, rol: 'propietario' }] });
  });

  it('lista mis equipos con mi rol y la cantidad de miembros', async () => {
    expect(await e.equipos.listar(e.CARLA)).toEqual([
      expect.objectContaining({ nombre: 'Marketing', rol: 'lector', cantidadMiembros: 4 }),
    ]);
  });

  it('muestra los miembros, propietarios primero', async () => {
    const equipo = await e.equipos.obtener(e.BETO, e.equipoId);

    expect(equipo.miembros.map((m) => `${m.nombre}:${m.rol}`)).toEqual([
      'ana:propietario',
      'eva:propietario',
      'beto:editor',
      'carla:lector',
    ]);
  });

  it('un no miembro recibe 404; un miembro no propietario no gestiona (403)', async () => {
    await expect(e.equipos.obtener(e.DIEGO, e.equipoId)).rejects.toMatchObject({ tipo: 'no_encontrado' });
    await expect(e.equipos.agregarMiembro(e.BETO, e.equipoId, 'diego@x.cl', 'lector')).rejects.toMatchObject({
      tipo: 'prohibido',
      message: 'Solo un propietario del equipo puede gestionar sus miembros',
    });
    await expect(e.equipos.cambiarRol(e.BETO, e.equipoId, e.CARLA, 'editor')).rejects.toMatchObject({ tipo: 'prohibido' });
    await expect(e.equipos.quitarMiembro(e.BETO, e.equipoId, e.CARLA)).rejects.toMatchObject({ tipo: 'prohibido' });
  });

  it('agregar un email no registrado → 404; agregar a alguien que ya es miembro → 409', async () => {
    await expect(e.equipos.agregarMiembro(e.ANA, e.equipoId, 'nadie@x.cl', 'lector')).rejects.toMatchObject({
      tipo: 'no_encontrado',
      message: 'No existe un usuario con ese email',
    });
    await expect(e.equipos.agregarMiembro(e.ANA, e.equipoId, ' BETO@x.cl ', 'lector')).rejects.toMatchObject({
      tipo: 'conflicto',
    });
  });

  it('cambia el rol de un miembro', async () => {
    const equipo = await e.equipos.cambiarRol(e.ANA, e.equipoId, e.CARLA, 'editor');

    expect(equipo.miembros.find((m) => m.usuarioId === e.CARLA)?.rol).toBe('editor');
  });

  it('un miembro puede salir del equipo por su cuenta', async () => {
    await e.equipos.quitarMiembro(e.CARLA, e.equipoId, e.CARLA);

    expect(await e.equiposRepo.rolDe(e.equipoId, e.CARLA)).toBeNull();
  });

  it('el equipo conserva al menos un propietario', async () => {
    await e.equipos.cambiarRol(e.ANA, e.equipoId, e.EVA, 'editor'); // queda solo Ana

    await expect(e.equipos.cambiarRol(e.ANA, e.equipoId, e.ANA, 'lector')).rejects.toMatchObject({
      tipo: 'conflicto',
      message: 'El equipo debe conservar al menos un propietario: asigna otro propietario antes',
    });
    await expect(e.equipos.quitarMiembro(e.ANA, e.equipoId, e.ANA)).rejects.toMatchObject({ tipo: 'conflicto' });
  });

  it('cambiar el rol de alguien que no es miembro → 404', async () => {
    await expect(e.equipos.cambiarRol(e.ANA, e.equipoId, e.DIEGO, 'lector')).rejects.toMatchObject({
      tipo: 'no_encontrado',
      message: 'El usuario no es miembro del equipo',
    });
  });
});
