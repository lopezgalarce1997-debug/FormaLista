import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { destinoSeguro } from '../src/auth/rutas';
import { renderizarApp } from './renderizar';
import { ana, conSesion, servidor } from './servidor';

const ubicacion = () => screen.getByTestId('ubicacion').textContent;

describe('Rutas protegidas', () => {
  it('sin sesión, una ruta protegida lleva al login recordando el destino', async () => {
    renderizarApp('/formularios');

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(ubicacion()).toBe('/login?volver=%2Fformularios');
  });

  it('con sesión (cookie válida), /login redirige a los formularios', async () => {
    conSesion();
    renderizarApp('/login');

    expect(await screen.findByRole('heading', { name: 'Mis formularios' })).toBeInTheDocument();
  });
});

describe('Login', () => {
  it('valida en el cliente con el esquema compartido, sin llamar a la API', async () => {
    let llamadas = 0;
    servidor.use(http.post('/api/auth/login', () => ((llamadas++), HttpResponse.json({}))));
    const { usuario } = renderizarApp('/login');

    await usuario.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findAllByText('Es obligatorio')).toHaveLength(2);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(llamadas).toBe(0);
  });

  it('con credenciales correctas entra y vuelve a la página que pedía', async () => {
    servidor.use(http.post('/api/auth/login', () => HttpResponse.json({ usuario: ana, token: 'ignorado' })));
    const { usuario } = renderizarApp('/formularios');

    await usuario.type(await screen.findByLabelText('Email'), 'ana@correo.cl');
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Mis formularios' })).toBeInTheDocument();
    expect(ubicacion()).toBe('/formularios');
    expect(screen.getByText('Ana')).toBeInTheDocument(); // nombre en la barra superior
  });

  it('con credenciales incorrectas muestra el mensaje de la API', async () => {
    servidor.use(
      http.post('/api/auth/login', () => HttpResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })),
    );
    const { usuario } = renderizarApp('/login');

    await usuario.type(await screen.findByLabelText('Email'), 'ana@correo.cl');
    await usuario.type(screen.getByLabelText('Contraseña'), 'mala');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
  });

  it('muestra el aviso de demasiados intentos (429)', async () => {
    servidor.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 }),
      ),
    );
    const { usuario } = renderizarApp('/login');

    await usuario.type(await screen.findByLabelText('Email'), 'ana@correo.cl');
    await usuario.type(screen.getByLabelText('Contraseña'), 'x');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiadas solicitudes');
  });
});

describe('Registro', () => {
  it('exige que las contraseñas coincidan y aplica las reglas compartidas', async () => {
    const { usuario } = renderizarApp('/registro');

    await usuario.type(await screen.findByLabelText('Nombre'), 'Ana');
    await usuario.type(screen.getByLabelText('Email'), 'no-es-email');
    await usuario.type(screen.getByLabelText('Contraseña'), 'corta');
    await usuario.type(screen.getByLabelText('Repite la contraseña'), 'otra');
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Email inválido')).toBeInTheDocument();
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument();
    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument();
  });

  it('un email ya registrado (409) se marca en el campo email', async () => {
    servidor.use(
      http.post('/api/auth/registro', () => HttpResponse.json({ error: 'El email ya está registrado' }, { status: 409 })),
    );
    const { usuario } = renderizarApp('/registro');

    await usuario.type(await screen.findByLabelText('Nombre'), 'Ana');
    await usuario.type(screen.getByLabelText('Email'), 'ana@correo.cl');
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await usuario.type(screen.getByLabelText('Repite la contraseña'), 'secreta123');
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('El email ya está registrado')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('un registro correcto entra directo (no envía el campo "confirmar")', async () => {
    let cuerpo: unknown;
    servidor.use(
      http.post('/api/auth/registro', async ({ request }) => {
        cuerpo = await request.json();
        return HttpResponse.json({ usuario: ana, token: 'ignorado' }, { status: 201 });
      }),
    );
    const { usuario } = renderizarApp('/registro');

    await usuario.type(await screen.findByLabelText('Nombre'), '  Ana  ');
    await usuario.type(screen.getByLabelText('Email'), 'ana@correo.cl');
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await usuario.type(screen.getByLabelText('Repite la contraseña'), 'secreta123');
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Mis formularios' })).toBeInTheDocument();
    expect(cuerpo).toEqual({ nombre: 'Ana', email: 'ana@correo.cl', password: 'secreta123' }); // con trim
  });
});

describe('Cerrar sesión y sesión expirada', () => {
  it('cerrar sesión llama a /auth/logout y vuelve al login', async () => {
    conSesion();
    let cerro = false;
    servidor.use(
      http.post('/api/auth/logout', () => {
        cerro = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { usuario } = renderizarApp('/formularios');

    await usuario.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    await waitFor(() => expect(cerro).toBe(true));
  });
});

describe('destinoSeguro (evita open redirect)', () => {
  it.each([
    ['/formularios/abc', '/formularios/abc'],
    ['//sitio-malicioso.com', '/formularios'],
    ['https://sitio-malicioso.com', '/formularios'],
    ['/\\sitio-malicioso.com', '/formularios'],
    [null, '/formularios'],
  ])('%s → %s', (volver, esperado) => {
    expect(destinoSeguro(volver)).toBe(esperado);
  });
});
