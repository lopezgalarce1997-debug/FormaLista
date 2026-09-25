import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FormularioParaResponder } from '../src/api/publico';
import { renderizarApp } from './renderizar';
import { servidor } from './servidor';

const formulario: FormularioParaResponder = {
  slug: 'cafe-abc',
  titulo: 'Encuesta de café',
  descripcion: 'Queremos conocer tus gustos.',
  version: 3,
  preguntas: [
    { id: 'nombre', tipo: 'texto_corto', texto: '¿Tu nombre?', obligatoria: true },
    { id: 'fav', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: true, opciones: ['Latte', 'Mocca'] },
    { id: 'extras', tipo: 'opcion_multiple', texto: 'Extras', obligatoria: false, opciones: ['Azúcar', 'Canela'] },
    { id: 'nota', tipo: 'escala', texto: 'Nota', obligatoria: false, minimo: 1, maximo: 5 },
    { id: 'coment', tipo: 'texto_largo', texto: 'Comentarios', obligatoria: false },
    { id: 'visita', tipo: 'fecha', texto: 'Visita', obligatoria: false },
  ],
};

/** API pública simulada: guarda los cuerpos enviados. */
function conPublico(respuestaEnvio?: () => Response) {
  const enviados: unknown[] = [];
  servidor.use(
    http.get('/api/publico/cafe-abc', () => HttpResponse.json(formulario)),
    http.post('/api/publico/cafe-abc/respuestas', async ({ request }) => {
      enviados.push(await request.json());
      return respuestaEnvio?.() ?? HttpResponse.json({ id: 'r1', enviadaEn: '2026-09-25T12:00:00.000Z' }, { status: 201 });
    }),
  );
  return enviados;
}

const responderLoObligatorio = async (usuario: ReturnType<typeof renderizarApp>['usuario']) => {
  await usuario.type(await screen.findByRole('textbox', { name: /¿Tu nombre\?/ }), 'Ana');
  await usuario.click(screen.getByRole('radio', { name: 'Mocca' }));
};

const enviar = () => screen.getByRole('button', { name: 'Enviar respuesta' });

describe('Formulario público: cargar', () => {
  beforeEach(() => sessionStorage.clear());

  it('se abre sin sesión, sin la barra de la app, con todas las preguntas y el título en la pestaña', async () => {
    conPublico();
    renderizarApp('/f/cafe-abc');

    expect(await screen.findByRole('heading', { name: 'Encuesta de café', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Queremos conocer tus gustos.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Nota' })).toBeInTheDocument();
    expect(screen.getByLabelText('Visita')).toHaveAttribute('type', 'date');
    expect(document.title).toBe('Encuesta de café · FormaLista');
  });

  it.each([
    [404, 'Formulario no encontrado', 'Este formulario no existe o todavía no está publicado.'],
    [410, 'Este formulario ya no acepta respuestas', 'Este formulario ya no acepta respuestas.'],
  ])('un %i muestra un aviso claro', async (status, error, texto) => {
    servidor.use(http.get('/api/publico/cafe-abc', () => HttpResponse.json({ error }, { status })));
    renderizarApp('/f/cafe-abc');

    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar respuesta' })).not.toBeInTheDocument();
  });

  it('sin conexión muestra el mensaje y permite reintentar', async () => {
    let intentos = 0;
    servidor.use(
      http.get('/api/publico/cafe-abc', () =>
        ++intentos === 1 ? new HttpResponse('Bad Gateway', { status: 502 }) : HttpResponse.json(formulario),
      ),
    );
    const { usuario } = renderizarApp('/f/cafe-abc');

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Encuesta de café' })).toBeInTheDocument();
  });
});

describe('Formulario público: validar y enviar', () => {
  beforeEach(() => sessionStorage.clear());

  it('con errores: resumen arriba con enlaces + error bajo cada pregunta, foco en el resumen, sin llamar a la API', async () => {
    const enviados = conPublico();
    const { usuario } = renderizarApp('/f/cafe-abc');
    await screen.findByRole('heading', { name: 'Encuesta de café' });

    await usuario.click(enviar());

    const resumen = await screen.findByRole('heading', { name: 'Hay 2 respuestas por corregir' });
    await waitFor(() => expect(resumen.parentElement).toHaveFocus());
    const enlaces = within(resumen.parentElement!).getAllByRole('link');
    expect(enlaces.map((e) => e.textContent)).toEqual(['¿Tu nombre? — Es obligatoria', '¿Favorito? — Es obligatoria']);
    // …y también bajo cada pregunta, asociado al campo (aria-describedby).
    expect(screen.getByRole('textbox', { name: /¿Tu nombre\?/ })).toHaveAccessibleDescription('Es obligatoria');
    expect(enviados).toHaveLength(0);
  });

  it('un enlace del resumen lleva el foco a la pregunta', async () => {
    conPublico();
    const { usuario } = renderizarApp('/f/cafe-abc');
    await screen.findByRole('heading', { name: 'Encuesta de café' });
    await usuario.click(enviar());

    await usuario.click(await screen.findByRole('link', { name: '¿Favorito? — Es obligatoria' }));

    expect(screen.getByRole('radio', { name: 'Latte' })).toHaveFocus();
  });

  it('envía las respuestas con la versión cargada y muestra el agradecimiento (sin "enviar otra")', async () => {
    const enviados = conPublico();
    const { usuario } = renderizarApp('/f/cafe-abc');
    await responderLoObligatorio(usuario);
    await usuario.click(screen.getByRole('checkbox', { name: 'Canela' }));
    await usuario.click(screen.getByRole('radio', { name: '4' }));

    await usuario.click(enviar());

    const gracias = await screen.findByRole('heading', { name: '¡Gracias!' });
    expect(gracias).toHaveFocus();
    expect(screen.getByText('Tu respuesta a «Encuesta de café» fue registrada.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(enviados).toEqual([{ version: 3, respuestas: { nombre: 'Ana', fav: 'Mocca', extras: ['Canela'], nota: 4 } }]);
  });

  it('errores del servidor (400 con detalles) van a su pregunta', async () => {
    conPublico(() =>
      HttpResponse.json(
        { error: 'Hay respuestas inválidas', detalles: [{ campo: 'respuestas.nombre', mensaje: 'Rechazado por el servidor' }] },
        { status: 400 },
      ),
    );
    const { usuario } = renderizarApp('/f/cafe-abc');
    await responderLoObligatorio(usuario);

    await usuario.click(enviar());

    expect(await screen.findByRole('link', { name: '¿Tu nombre? — Rechazado por el servidor' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /¿Tu nombre\?/ })).toHaveAccessibleDescription('Rechazado por el servidor');
  });

  it('un 400 que no es de una pregunta (p. ej. la versión) igual se muestra', async () => {
    conPublico(() =>
      HttpResponse.json(
        { error: 'La versión del formulario no existe', detalles: [{ campo: 'version', mensaje: 'No existe la versión 3' }] },
        { status: 400 },
      ),
    );
    const { usuario } = renderizarApp('/f/cafe-abc');
    await responderLoObligatorio(usuario);

    await usuario.click(enviar());

    expect(await screen.findByRole('alert')).toHaveTextContent('La versión del formulario no existe');
  });

  it('si se cerró mientras respondía (410), lo avisa', async () => {
    conPublico(() => HttpResponse.json({ error: 'Este formulario ya no acepta respuestas' }, { status: 410 }));
    const { usuario } = renderizarApp('/f/cafe-abc');
    await responderLoObligatorio(usuario);

    await usuario.click(enviar());

    expect(await screen.findByText(/se cerró mientras respondías/)).toBeInTheDocument();
  });

  it('429: explica el límite y conserva lo escrito', async () => {
    conPublico(() => HttpResponse.json({ error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }, { status: 429 }));
    const { usuario } = renderizarApp('/f/cafe-abc');
    await responderLoObligatorio(usuario);

    await usuario.click(enviar());

    expect(await screen.findByRole('alert')).toHaveTextContent('demasiadas respuestas desde tu red');
    expect(screen.getByRole('textbox', { name: /¿Tu nombre\?/ })).toHaveValue('Ana');
    expect(enviar()).toBeEnabled();
  });

  it('mientras envía, el botón se desactiva (evita un doble envío)', async () => {
    let liberar: () => void = () => {};
    const enviados = conPublico(() => new Response(null, { status: 500 }));
    servidor.use(
      http.post('/api/publico/cafe-abc/respuestas', async ({ request }) => {
        enviados.push(await request.json());
        await new Promise<void>((r) => (liberar = r));
        return HttpResponse.json({ id: 'r1', enviadaEn: '2026-09-25T12:00:00.000Z' }, { status: 201 });
      }),
    );
    const { usuario } = renderizarApp('/f/cafe-abc');
    await responderLoObligatorio(usuario);

    await usuario.click(enviar());
    const boton = await screen.findByRole('button', { name: 'Enviando…' });
    expect(boton).toBeDisabled();
    await usuario.click(boton);
    liberar();

    expect(await screen.findByRole('heading', { name: '¡Gracias!' })).toBeInTheDocument();
    expect(enviados).toHaveLength(1);
  });
});

describe('Formulario público: borrador en sessionStorage', () => {
  beforeEach(() => sessionStorage.clear());

  it('lo escrito sobrevive a una recarga y se borra al enviar', async () => {
    conPublico();
    const primera = renderizarApp('/f/cafe-abc');
    await responderLoObligatorio(primera.usuario);
    primera.unmount(); // "recarga"

    const segunda = renderizarApp('/f/cafe-abc');
    expect(await screen.findByRole('textbox', { name: /¿Tu nombre\?/ })).toHaveValue('Ana');
    expect(screen.getByRole('radio', { name: 'Mocca' })).toBeChecked();
    expect(sessionStorage.getItem('formalista:borrador:cafe-abc:v3')).toContain('Ana');

    await segunda.usuario.click(enviar());
    await screen.findByRole('heading', { name: '¡Gracias!' });
    expect(sessionStorage.getItem('formalista:borrador:cafe-abc:v3')).toBeNull();
  });

  it('un borrador de otra versión no se mezcla', async () => {
    sessionStorage.setItem('formalista:borrador:cafe-abc:v2', JSON.stringify({ nombre: 'De la versión 2' }));
    conPublico();
    renderizarApp('/f/cafe-abc');

    expect(await screen.findByRole('textbox', { name: /¿Tu nombre\?/ })).toHaveValue('');
  });

  it('si sessionStorage falla (modo privado), el formulario funciona igual', async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      conPublico();
      const { usuario } = renderizarApp('/f/cafe-abc');
      await responderLoObligatorio(usuario);
      await usuario.click(enviar());

      expect(await screen.findByRole('heading', { name: '¡Gracias!' })).toBeInTheDocument();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
