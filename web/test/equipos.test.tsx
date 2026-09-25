import { validarCambioDeMiembro, type RolEquipo } from '@formalista/compartido';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Equipo } from '../src/api/equipos';
import { renderizarApp } from './renderizar';
import { ana, conSesion, servidor } from './servidor';

type Miembro = Equipo['miembros'][number];

const luis: Miembro = { usuarioId: 2, nombre: 'Luis Soto', email: 'luis@correo.cl', rol: 'editor' };
const eva: Miembro = { usuarioId: 3, nombre: 'Eva Díaz', email: 'eva@correo.cl', rol: 'lector' };
function anaComo(rol: RolEquipo): Miembro {
  return { usuarioId: ana.id, nombre: ana.nombre, email: ana.email, rol };
}
const pepe = { usuarioId: 4, nombre: 'Pepe Rojas', email: 'pepe@correo.cl' };

/**
 * API de equipos simulada con estado, del lado de Ana: aplica las mismas reglas que la real
 * (404 si no es miembro, solo propietarios gestionan, nunca sin propietario).
 */
function conEquipos(miembrosIniciales: Miembro[] = [anaComo('propietario'), luis, eva]) {
  const estado = {
    equipos: [{ id: 7, nombre: 'Marketing', creadoEn: '2026-09-20T12:00:00.000Z', miembros: [...miembrosIniciales] }],
    registrados: [pepe, luis, eva],
    fallarCambioDeRol: false,
    pedidos: [] as { metodo: string; ruta: string; cuerpo?: unknown }[],
  };
  const rolDeAna = (e: (typeof estado.equipos)[number]) => e.miembros.find((m) => m.usuarioId === ana.id)?.rol;
  const detalle = (e: (typeof estado.equipos)[number]): Equipo => ({ id: e.id, nombre: e.nombre, creadoEn: e.creadoEn, rol: rolDeAna(e)!, miembros: e.miembros });
  const buscar = (id: unknown) => estado.equipos.find((e) => e.id === Number(id) && rolDeAna(e));
  const noEncontrado = () => HttpResponse.json({ error: 'Equipo no encontrado' }, { status: 404 });

  servidor.use(
    http.get('/api/equipos', () =>
      HttpResponse.json({
        equipos: estado.equipos
          .filter((e) => rolDeAna(e))
          .map((e) => ({ id: e.id, nombre: e.nombre, creadoEn: e.creadoEn, rol: rolDeAna(e), cantidadMiembros: e.miembros.length })),
      }),
    ),
    http.post('/api/equipos', async ({ request }) => {
      const { nombre } = (await request.json()) as { nombre: string };
      const nuevo = { id: 8, nombre, creadoEn: '2026-09-25T12:00:00.000Z', miembros: [{ usuarioId: ana.id, nombre: ana.nombre, email: ana.email, rol: 'propietario' as RolEquipo }] };
      estado.equipos.push(nuevo);
      return HttpResponse.json(detalle(nuevo), { status: 201 });
    }),
    http.get('/api/equipos/:id', ({ params }) => {
      estado.pedidos.push({ metodo: 'GET', ruta: `/equipos/${params.id}` });
      const e = buscar(params.id);
      return e ? HttpResponse.json(detalle(e)) : noEncontrado();
    }),
    http.post('/api/equipos/:id/miembros', async ({ params, request }) => {
      const cuerpo = (await request.json()) as { email: string; rol: RolEquipo };
      estado.pedidos.push({ metodo: 'POST', ruta: `/equipos/${params.id}/miembros`, cuerpo });
      const e = buscar(params.id)!;
      const usuario = estado.registrados.find((u) => u.email === cuerpo.email);
      if (!usuario) return HttpResponse.json({ error: 'No existe un usuario con ese email' }, { status: 404 });
      if (e.miembros.some((m) => m.usuarioId === usuario.usuarioId)) {
        return HttpResponse.json({ error: 'El usuario ya es miembro del equipo' }, { status: 409 });
      }
      e.miembros.push({ ...usuario, rol: cuerpo.rol });
      return HttpResponse.json(detalle(e), { status: 201 });
    }),
    http.patch('/api/equipos/:id/miembros/:usuarioId', async ({ params, request }) => {
      const cuerpo = (await request.json()) as { rol: RolEquipo };
      estado.pedidos.push({ metodo: 'PATCH', ruta: `/equipos/${params.id}/miembros/${params.usuarioId}`, cuerpo });
      if (estado.fallarCambioDeRol) return HttpResponse.json({ error: 'Ocurrió un error inesperado' }, { status: 500 });
      const e = buscar(params.id)!;
      const invalido = validarCambioDeMiembro(e.miembros, Number(params.usuarioId), cuerpo.rol);
      if (invalido) return HttpResponse.json({ error: invalido.mensaje }, { status: 409 });
      e.miembros = e.miembros.map((m) => (m.usuarioId === Number(params.usuarioId) ? { ...m, rol: cuerpo.rol } : m));
      return HttpResponse.json(detalle(e));
    }),
    http.delete('/api/equipos/:id/miembros/:usuarioId', ({ params }) => {
      estado.pedidos.push({ metodo: 'DELETE', ruta: `/equipos/${params.id}/miembros/${params.usuarioId}` });
      const e = buscar(params.id)!;
      e.miembros = e.miembros.filter((m) => m.usuarioId !== Number(params.usuarioId));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return estado;
}

const filaDe = (nombre: string) => screen.getByText(nombre).closest('li')!;
const selectRol = (nombre: string) => screen.getByRole('combobox', { name: `Rol de ${nombre}` });

describe('Equipos: lista', () => {
  beforeEach(() => conSesion());

  it('muestra mis equipos con mi rol y la cantidad de miembros; el menú marca la sección', async () => {
    conEquipos();
    renderizarApp('/equipos');

    const enlace = await screen.findByRole('link', { name: /Marketing/ });
    expect(enlace).toHaveTextContent('Tu rol: Propietario · 3 miembros');
    expect(enlace).toHaveAttribute('href', '/equipos/7');
    expect(screen.getByRole('link', { name: 'Equipos' })).toHaveAttribute('aria-current', 'page');
  });

  it('sin equipos invita a crear uno; al crearlo abre su página', async () => {
    conEquipos([]);
    const { usuario } = renderizarApp('/equipos');

    await usuario.click(await screen.findByRole('button', { name: 'Crear mi primer equipo' }));
    await usuario.type(screen.getByLabelText('Nombre'), 'Ventas');
    await usuario.click(screen.getByRole('button', { name: 'Crear equipo' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Ventas' })).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/equipos/8');
  });

  it('el nombre es obligatorio (mismo esquema que la API)', async () => {
    conEquipos();
    const { usuario } = renderizarApp('/equipos');
    await usuario.click(await screen.findByRole('button', { name: '+ Nuevo equipo' }));
    await usuario.click(screen.getByRole('button', { name: 'Crear equipo' }));

    expect(screen.getByLabelText('Nombre')).toHaveAccessibleDescription('Es obligatorio');
  });
});

describe('Equipos: miembros (como propietaria)', () => {
  beforeEach(() => conSesion());

  it('agrega un miembro como Lector por defecto, lo anuncia y deja el foco en el email', async () => {
    const api = conEquipos();
    const { usuario } = renderizarApp('/equipos/7');

    await usuario.type(await screen.findByLabelText('Email'), 'pepe@correo.cl');
    await usuario.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByText('Pepe Rojas agregado como Lector.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('heading', { name: 'Miembros (4)' })).toBeInTheDocument();
    expect(api.pedidos.at(-1)?.cuerpo).toEqual({ email: 'pepe@correo.cl', rol: 'lector' });
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it.each([
    ['nadie@correo.cl', 'No existe un usuario con ese email'],
    ['luis@correo.cl', 'El usuario ya es miembro del equipo'],
  ])('el error de la API para %s aparece bajo el email', async (email, mensaje) => {
    conEquipos();
    const { usuario } = renderizarApp('/equipos/7');

    await usuario.type(await screen.findByLabelText('Email'), email);
    await usuario.click(screen.getByRole('button', { name: 'Agregar' }));

    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(mensaje));
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('cambiar el rol guarda al elegir y lo anuncia', async () => {
    const api = conEquipos();
    const { usuario } = renderizarApp('/equipos/7');

    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Rol de Eva Díaz' }), 'editor');

    expect(await screen.findByText('Rol de Eva Díaz cambiado a Editor.')).toBeInTheDocument();
    expect(api.pedidos.at(-1)).toEqual({ metodo: 'PATCH', ruta: '/equipos/7/miembros/3', cuerpo: { rol: 'editor' } });
    expect(selectRol('Eva Díaz')).toHaveValue('editor');
    // El PATCH devolvió el equipo actualizado: no hace falta volver a pedirlo.
    expect(api.pedidos.filter((p) => p.metodo === 'GET')).toHaveLength(1);
  });

  it('si el cambio de rol falla, el select vuelve al valor guardado y se muestra el error', async () => {
    const api = conEquipos();
    api.fallarCambioDeRol = true;
    const { usuario } = renderizarApp('/equipos/7');

    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Rol de Eva Díaz' }), 'editor');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado');
    await waitFor(() => expect(selectRol('Eva Díaz')).toHaveValue('lector'));
  });

  it('quitar a alguien pide confirmación; al confirmar desaparece y el foco va a la lista', async () => {
    const api = conEquipos();
    const { usuario } = renderizarApp('/equipos/7');

    await usuario.click(await screen.findByRole('button', { name: 'Quitar a Eva Díaz' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Quitar a Eva Díaz?' });
    expect(api.pedidos.some((p) => p.metodo === 'DELETE')).toBe(false);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Quitar' }));

    expect(await screen.findByText('Eva Díaz ya no es miembro del equipo.')).toBeInTheDocument();
    expect(screen.queryByText('eva@correo.cl')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Miembros (2)' })).toHaveFocus();
    expect(api.pedidos.at(-1)).toEqual({ metodo: 'DELETE', ruta: '/equipos/7/miembros/3' });
  });

  it('siendo la única propietaria no puede salir ni bajarse el rol, y se explica por qué', async () => {
    conEquipos();
    renderizarApp('/equipos/7');

    const salir = await screen.findByRole('button', { name: 'Salir del equipo' });
    expect(salir).toBeDisabled();
    expect(salir).toHaveAccessibleDescription(/Eres el único propietario/);
    expect(within(selectRol('Ana')).getByRole('option', { name: 'Editor' })).toBeDisabled();
    expect(within(selectRol('Ana')).getByRole('option', { name: 'Propietario' })).toBeEnabled();
    expect(within(selectRol('Luis Soto')).getByRole('option', { name: 'Lector' })).toBeEnabled();
  });

  it('bajarse el propio rol pide confirmación; al cancelar no cambia nada', async () => {
    const api = conEquipos([anaComo('propietario'), { ...luis, rol: 'propietario' }]);
    const { usuario } = renderizarApp('/equipos/7');

    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Rol de Ana' }), 'editor');
    const dialogo = screen.getByRole('dialog', { name: '¿Dejar de ser propietario?' });
    expect(dialogo).toHaveTextContent('Pasarás a ser Editor');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(selectRol('Ana')).toHaveValue('propietario');
    expect(api.pedidos.some((p) => p.metodo === 'PATCH')).toBe(false);
  });

  it('al confirmar que se baja el rol, deja de ver la gestión y se invalidan sus formularios', async () => {
    conEquipos([anaComo('propietario'), { ...luis, rol: 'propietario' }]);
    const { usuario, queryClient } = renderizarApp('/equipos/7');
    queryClient.setQueryData(['formularios'], []);

    await usuario.selectOptions(await screen.findByRole('combobox', { name: 'Rol de Ana' }), 'editor');
    await usuario.click(screen.getByRole('button', { name: 'Cambiar mi rol' }));

    expect(await screen.findByText('Tu rol: Editor')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Agregar miembro' })).not.toBeInTheDocument();
    expect(queryClient.getQueryState(['formularios'])?.isInvalidated).toBe(true);
  });
});

describe('Equipos: como editor o lector', () => {
  beforeEach(() => conSesion());

  it('ve los miembros y sus roles, pero no puede gestionarlos', async () => {
    conEquipos([{ ...luis, rol: 'propietario' }, anaComo('lector'), eva]);
    renderizarApp('/equipos/7');

    expect(await screen.findByText('Tu rol: Lector')).toBeInTheDocument();
    expect(within(filaDe('Luis Soto')).getByText('Propietario')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument();
  });

  it('salir del equipo pide confirmación, vuelve a la lista con un aviso e invalida sus formularios', async () => {
    const api = conEquipos([{ ...luis, rol: 'propietario' }, anaComo('editor')]);
    const { usuario, queryClient } = renderizarApp('/equipos/7');
    queryClient.setQueryData(['formularios'], []);

    await usuario.click(await screen.findByRole('button', { name: 'Salir del equipo' }));
    await usuario.click(within(screen.getByRole('dialog', { name: '¿Salir del equipo?' })).getByRole('button', { name: 'Salir del equipo' }));

    expect(await screen.findByText('Saliste del equipo «Marketing».')).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion')).toHaveTextContent(/^\/equipos$/);
    expect(api.pedidos.at(-1)).toEqual({ metodo: 'DELETE', ruta: '/equipos/7/miembros/1' });
    expect(await screen.findByText('Aún no perteneces a ningún equipo')).toBeInTheDocument();
    expect(queryClient.getQueryState(['formularios'])?.isInvalidated).toBe(true);
  });

  it('un equipo del que no soy miembro (o inexistente) muestra "no encontrado"', async () => {
    conEquipos();
    renderizarApp('/equipos/99');

    expect(await screen.findByRole('alert')).toHaveTextContent('Equipo no encontrado.');
    expect(screen.getByRole('link', { name: 'Volver a equipos' })).toBeInTheDocument();
  });
});
