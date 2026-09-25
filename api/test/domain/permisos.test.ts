import { describe, expect, it } from 'vitest';
import {
  puede,
  rolEnFormulario,
  validarCambioDeMiembro,
  type AccionFormulario,
  type RolFormulario,
} from '../../src/domain/permisos.js';

describe('rolEnFormulario', () => {
  it.each([
    [true, null, 'propietario'],
    [true, 'lector', 'propietario'], // quien lo creó es propietario aunque en el equipo sea lector
    [false, 'propietario', 'editor'], // el propietario del EQUIPO actúa como editor
    [false, 'editor', 'editor'],
    [false, 'lector', 'lector'],
    [false, null, null], // sin acceso
  ] as const)('esPropietario=%s, rol en el equipo=%s → %s', (esPropietario, rolEquipo, esperado) => {
    expect(rolEnFormulario(esPropietario, rolEquipo)).toBe(esperado);
  });
});

describe('puede: matriz completa de rol × acción', () => {
  const matriz: [AccionFormulario, propietario: boolean, editor: boolean, lector: boolean][] = [
    ['ver', true, true, true],
    ['verResultados', true, true, true],
    ['editar', true, true, false],
    ['cambiarEstado', true, true, false],
    ['eliminar', true, false, false],
    ['compartir', true, false, false],
  ];

  it.each(matriz.flatMap(([accion, ...permitido]) =>
    (['propietario', 'editor', 'lector'] as RolFormulario[]).map((rol, i) => [rol, accion, permitido[i]] as const),
  ))('%s → %s: %s', (rol, accion, esperado) => {
    expect(puede(rol, accion)).toBe(esperado);
  });
});

describe('validarCambioDeMiembro', () => {
  const miembros = [
    { usuarioId: 1, rol: 'propietario' as const },
    { usuarioId: 2, rol: 'editor' as const },
    { usuarioId: 3, rol: 'lector' as const },
  ];

  it('permite cambiar el rol o quitar a un miembro que no es el último propietario', () => {
    expect(validarCambioDeMiembro(miembros, 2, 'lector')).toBeNull();
    expect(validarCambioDeMiembro(miembros, 3, null)).toBeNull();
    expect(validarCambioDeMiembro(miembros, 2, 'propietario')).toBeNull();
  });

  it.each([
    ['degradar', 'editor'],
    ['quitar', null],
  ] as const)('no permite %s al último propietario', (_caso, nuevoRol) => {
    expect(validarCambioDeMiembro(miembros, 1, nuevoRol)).toMatchObject({ motivo: 'ultimo_propietario' });
  });

  it('sí permite degradar a un propietario si queda otro', () => {
    const dosPropietarios = [...miembros, { usuarioId: 4, rol: 'propietario' as const }];

    expect(validarCambioDeMiembro(dosPropietarios, 1, 'editor')).toBeNull();
  });

  it('mantener a un propietario como propietario no cuenta como degradarlo', () => {
    expect(validarCambioDeMiembro(miembros, 1, 'propietario')).toBeNull();
  });

  it('responde no_miembro si el usuario no está en el equipo', () => {
    expect(validarCambioDeMiembro(miembros, 99, 'lector')).toMatchObject({ motivo: 'no_miembro' });
  });
});
