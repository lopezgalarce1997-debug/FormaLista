import type { RowDataPacket } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { ErrorAplicacion } from '../../src/application/errores.js';
import { validarCambioDeMiembro } from '../../src/domain/permisos.js';
import { RepositorioEquiposMySql } from '../../src/infrastructure/mysql/repositorioEquiposMySql.js';
import {
  CONSULTA_ACCESIBLES,
  RepositorioRegistroFormulariosMySql,
} from '../../src/infrastructure/mysql/repositorioRegistroFormulariosMySql.js';
import { RepositorioUsuariosMySql } from '../../src/infrastructure/mysql/repositorioUsuariosMySql.js';
import { usarMySqlDePruebas } from './mysql.js';

const mysql = usarMySqlDePruebas();

const idMongo = (n: number) => n.toString(16).padStart(24, '0');

/** Ana crea "Marketing" (Beto editor, Carla lectora) y 2 formularios (f1 compartido); Beto tiene f3 propio. */
async function escenario() {
  const usuarios = new RepositorioUsuariosMySql(mysql.pool);
  const equipos = new RepositorioEquiposMySql(mysql.pool);
  const registro = new RepositorioRegistroFormulariosMySql(mysql.pool);

  const [ana, beto, carla, diego] = await Promise.all(
    ['ana', 'beto', 'carla', 'diego'].map((n) => usuarios.crear({ nombre: n, email: `${n}@x.cl`, passwordHash: 'h' })),
  );
  const equipo = await equipos.crearConPropietario('Marketing', ana!.id);
  await equipos.agregarMiembro(equipo.id, beto!.id, 'editor');
  await equipos.agregarMiembro(equipo.id, carla!.id, 'lector');

  await registro.crear({ idMongo: idMongo(1), propietarioId: ana!.id });
  await registro.crear({ idMongo: idMongo(2), propietarioId: ana!.id });
  await registro.crear({ idMongo: idMongo(3), propietarioId: beto!.id });
  await registro.asignarEquipo(idMongo(1), equipo.id);

  return { usuarios, equipos, registro, equipo, ana: ana!, beto: beto!, carla: carla!, diego: diego! };
}

describe('Permisos con JOIN (MySQL real)', () => {
  it('buscarAcceso: propietario, miembro del equipo, ajeno e inexistente', async () => {
    const { registro, ana, beto, carla, diego } = await escenario();

    expect(await registro.buscarAcceso(idMongo(1), ana.id)).toMatchObject({
      esPropietario: true,
      rolEquipo: 'propietario', // también es miembro del equipo, pero el dominio le da 'propietario' por ser dueña
      equipoNombre: 'Marketing',
    });
    expect(await registro.buscarAcceso(idMongo(1), beto.id)).toMatchObject({ esPropietario: false, rolEquipo: 'editor' });
    expect(await registro.buscarAcceso(idMongo(1), carla.id)).toMatchObject({ esPropietario: false, rolEquipo: 'lector' });
    expect(await registro.buscarAcceso(idMongo(1), diego.id)).toMatchObject({ esPropietario: false, rolEquipo: null });
    // f2 no está compartido: Beto no tiene relación con él
    expect(await registro.buscarAcceso(idMongo(2), beto.id)).toMatchObject({ esPropietario: false, rolEquipo: null, equipoNombre: null });
    expect(await registro.buscarAcceso(idMongo(99), ana.id)).toBeNull();
  });

  it('listarAccesibles: propios + compartidos, sin duplicar el propio compartido con mi equipo', async () => {
    const { registro, ana, beto, carla, diego } = await escenario();

    const ids = async (usuarioId: number) =>
      (await registro.listarAccesibles(usuarioId)).map((a) => `${a.registro.idMongo.slice(-1)}:${a.esPropietario ? 'dueño' : a.rolEquipo}`);

    expect(await ids(ana.id)).toEqual(['2:dueño', '1:dueño']);
    expect(await ids(beto.id)).toEqual(['3:dueño', '1:editor']);
    expect(await ids(carla.id)).toEqual(['1:lector']);
    expect(await ids(diego.id)).toEqual([]);
  });

  it('cada rama del UNION puede usar un índice (EXPLAIN)', async () => {
    const { ana } = await escenario();

    const [plan] = await mysql.pool.query<RowDataPacket[]>(`EXPLAIN ${CONSULTA_ACCESIBLES}`, [ana.id, ana.id, ana.id]);
    const posibles = plan.map((fila) => `${fila.table}:${fila.possible_keys ?? ''}`);

    expect(posibles).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^fr:.*ix_formularios_registro_propietario/),
        expect.stringMatching(/^em:.*ix_equipo_miembros_usuario/),
        expect.stringMatching(/^fr:.*ix_formularios_registro_equipo/),
      ]),
    );
  });

  it('asignarEquipo(null) deja de compartir', async () => {
    const { registro, beto } = await escenario();

    await registro.asignarEquipo(idMongo(1), null);

    expect(await registro.buscarAcceso(idMongo(1), beto.id)).toMatchObject({ rolEquipo: null, equipoNombre: null });
  });
});

describe('Equipos (MySQL real)', () => {
  it('crearConPropietario es atómico: si falla la membresía, no queda el equipo', async () => {
    const { equipos } = await escenario();
    const [[antes]] = await mysql.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM equipos');

    // Usuario inexistente → la FK de equipo_miembros falla en el segundo INSERT → ROLLBACK del primero.
    await expect(equipos.crearConPropietario('Fantasma', 999_999)).rejects.toThrow();

    const [[despues]] = await mysql.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM equipos');
    expect(despues!.n).toBe(antes!.n);
  });

  it('listarDeUsuario (JOIN + GROUP BY) y listarMiembros (JOIN con usuarios, propietarios primero)', async () => {
    const { equipos, equipo, carla } = await escenario();

    expect(await equipos.listarDeUsuario(carla.id)).toEqual([
      expect.objectContaining({ nombre: 'Marketing', rol: 'lector', cantidadMiembros: 3 }),
    ]);
    expect((await equipos.listarMiembros(equipo.id)).map((m) => `${m.nombre}:${m.rol}`)).toEqual([
      'ana:propietario',
      'beto:editor',
      'carla:lector',
    ]);
  });

  it('agregarMiembro duplicado → conflicto (PK compuesta)', async () => {
    const { equipos, equipo, beto } = await escenario();

    await expect(equipos.agregarMiembro(equipo.id, beto.id, 'lector')).rejects.toMatchObject({ tipo: 'conflicto' });
  });

  it('modificarMiembro: si la validación falla, hace ROLLBACK y no cambia nada', async () => {
    const { equipos, equipo, beto } = await escenario();

    await expect(
      equipos.modificarMiembro(equipo.id, beto.id, 'lector', () => {
        throw new ErrorAplicacion('conflicto', 'rechazado');
      }),
    ).rejects.toThrow('rechazado');

    expect(await equipos.rolDe(equipo.id, beto.id)).toBe('editor');
  });

  it('FOR UPDATE: dos propietarios que se degradan a la vez → exactamente uno lo logra', async () => {
    const { equipos, equipo, beto, ana } = await escenario();
    await equipos.modificarMiembro(equipo.id, beto.id, 'propietario', () => {}); // ahora hay 2 propietarios

    const degradar = (usuarioId: number) =>
      equipos.modificarMiembro(equipo.id, usuarioId, 'editor', (miembros) => {
        const invalido = validarCambioDeMiembro(miembros, usuarioId, 'editor');
        if (invalido) throw new ErrorAplicacion('conflicto', invalido.mensaje);
      });

    const resultados = await Promise.allSettled([degradar(ana.id), degradar(beto.id)]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const miembros = await equipos.listarMiembros(equipo.id);
    expect(miembros.filter((m) => m.rol === 'propietario')).toHaveLength(1);
  });
});
