import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Resumen } from '../src/api/formularios';
import { haceTiempo } from '../src/componentes/tiempo';
import { renderizarApp } from './renderizar';
import { conSesion, detalleDePrueba, servidor } from './servidor';

const hace2Horas = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const resumen = (cambios: Partial<Resumen>): Resumen => ({
  id: 'f1',
  titulo: 'Encuesta de café',
  slug: 'encuesta-de-cafe-abc12345',
  estado: 'publicado',
  rol: 'propietario',
  equipo: null,
  cantidadPreguntas: 6,
  creadoEn: hace2Horas,
  actualizadoEn: hace2Horas,
  ...cambios,
});

const propio = resumen({});
const comoEditor = resumen({
  id: 'f2',
  titulo: 'Evaluación del taller',
  slug: 'evaluacion-xyz',
  estado: 'borrador',
  rol: 'editor',
  equipo: { id: 1, nombre: 'Marketing' },
  cantidadPreguntas: 1,
});
const comoLector = resumen({ id: 'f3', titulo: 'Clima laboral', estado: 'cerrado', rol: 'lector', equipo: { id: 1, nombre: 'RR.HH.' } });

/** La API simulada guarda la lista en memoria: DELETE la modifica y el siguiente GET lo refleja. */
function conFormularios(lista: Resumen[]) {
  let actuales = [...lista];
  servidor.use(
    http.get('/api/formularios', () => HttpResponse.json({ formularios: actuales })),
    http.delete('/api/formularios/:id', ({ params }) => {
      actuales = actuales.filter((f) => f.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

/** El <li> de un formulario, para buscar dentro de él. */
const fila = async (titulo: string) => (await screen.findByRole('heading', { name: titulo })).closest('li')!;

describe('Mis formularios: lista', () => {
  beforeEach(() => conSesion());

  it('muestra cada formulario con su estado, preguntas y fecha; los ajenos, con equipo y rol', async () => {
    conFormularios([propio, comoEditor]);
    renderizarApp('/formularios');

    const filaPropia = await fila('Encuesta de café');
    expect(within(filaPropia).getByText('Publicado')).toBeInTheDocument();
    expect(within(filaPropia).getByText(/6 preguntas · Actualizado hace 2 horas/)).toBeInTheDocument();
    expect(within(filaPropia).queryByText(/Compartido/)).not.toBeInTheDocument();

    const filaAjena = await fila('Evaluación del taller');
    expect(within(filaAjena).getByText('Borrador')).toBeInTheDocument();
    const enlaceEquipo = within(filaAjena).getByRole('link', { name: 'Marketing' });
    expect(enlaceEquipo).toHaveAttribute('href', '/equipos/1');
    expect(enlaceEquipo.parentElement).toHaveTextContent('Compartido · Marketing · editor');
    expect(within(filaAjena).getByText(/^1 pregunta ·/)).toBeInTheDocument();
  });

  it('los botones dependen del rol: propietario todo, editor sin Eliminar, lector solo Resultados', async () => {
    conFormularios([propio, comoEditor, comoLector]);
    renderizarApp('/formularios');

    // Enlaces y botones de acciones, en el orden en que aparecen.
    const botones = async (titulo: string) =>
      [...(await fila(titulo)).querySelectorAll('[aria-label^="Acciones"] :is(a, button)')].map((b) => b.textContent);

    expect(await botones('Encuesta de café')).toEqual(['Editar', 'Resultados', 'Copiar link', 'Eliminar']);
    expect(await botones('Evaluación del taller')).toEqual(['Editar', 'Resultados']); // borrador: sin link
    expect(await botones('Clima laboral')).toEqual(['Resultados']);
  });

  it('los enlaces llevan al editor y a los resultados del formulario', async () => {
    conFormularios([propio]);
    servidor.use(http.get('/api/formularios/f1', () => HttpResponse.json(detalleDePrueba())));
    const { usuario } = renderizarApp('/formularios');

    await usuario.click(within(await fila('Encuesta de café')).getByRole('link', { name: 'Editar' }));

    // La navegación es una transición de React: la URL cambia cuando termina de descargarse el editor.
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/formularios/f1/editar'));
    expect(await screen.findByLabelText('Título')).toHaveValue('Encuesta de café'); // el editor cargó (archivo aparte)
  });

  it('Copiar link copia la URL pública y avisa', async () => {
    conFormularios([propio]);
    const { usuario } = renderizarApp('/formularios');

    await usuario.click(within(await fila('Encuesta de café')).getByRole('button', { name: 'Copiar link' }));

    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/f/encuesta-de-cafe-abc12345`);
    expect(screen.getByRole('button', { name: '¡Link copiado!' })).toBeInTheDocument();
  });

  it('pestañas y búsqueda filtran en el cliente (sin tildes ni mayúsculas)', async () => {
    conFormularios([propio, comoEditor, comoLector]);
    const { usuario } = renderizarApp('/formularios');
    await fila('Encuesta de café');
    const titulos = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

    await usuario.click(screen.getByRole('button', { name: 'Compartidos conmigo' }));
    expect(titulos()).toEqual(['Evaluación del taller', 'Clima laboral']);
    expect(screen.getByRole('button', { name: 'Compartidos conmigo' })).toHaveAttribute('aria-pressed', 'true');

    await usuario.click(screen.getByRole('button', { name: 'Míos' }));
    expect(titulos()).toEqual(['Encuesta de café']);

    await usuario.click(screen.getByRole('button', { name: 'Todos' }));
    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar por título' }), 'EVALUACION');
    expect(titulos()).toEqual(['Evaluación del taller']);

    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar por título' }), ' inexistente');
    expect(screen.getByText('Ningún formulario coincide con el filtro.')).toBeInTheDocument();
  });

  it('sin formularios muestra el estado vacío', async () => {
    renderizarApp('/formularios');

    expect(await screen.findByText('Aún no tienes formularios')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear mi primer formulario' })).toBeInTheDocument();
  });

  it('si falla la carga muestra el error y permite reintentar', async () => {
    let intentos = 0;
    servidor.use(
      http.get('/api/formularios', () =>
        ++intentos === 1
          ? HttpResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
          : HttpResponse.json({ formularios: [propio] }),
      ),
    );
    const { usuario } = renderizarApp('/formularios');

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno del servidor');
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Encuesta de café' })).toBeInTheDocument();
  });

  it('si la API está apagada (502 del proxy) dice que no hay conexión', async () => {
    servidor.use(http.get('/api/formularios', () => new HttpResponse('Bad Gateway', { status: 502 })));
    renderizarApp('/formularios');

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
  });
});

describe('Mis formularios: crear', () => {
  beforeEach(() => conSesion());

  it('el diálogo valida el título con el esquema compartido', async () => {
    const { usuario } = renderizarApp('/formularios');

    await usuario.click(await screen.findByRole('button', { name: '+ Nuevo formulario' }));
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo formulario' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Crear y editar' }));

    expect(await within(dialogo).findByText('Es obligatorio')).toBeInTheDocument();
  });

  it('crea con el título y abre el editor del formulario nuevo', async () => {
    let cuerpo: unknown;
    servidor.use(
      http.post('/api/formularios', async ({ request }) => {
        cuerpo = await request.json();
        return HttpResponse.json(resumen({ id: 'nuevo-1', titulo: 'Clima 2026' }), { status: 201 });
      }),
    );
    const { usuario } = renderizarApp('/formularios');

    await usuario.click(await screen.findByRole('button', { name: '+ Nuevo formulario' }));
    await usuario.type(screen.getByLabelText('Título'), '  Clima 2026  ');
    await usuario.click(screen.getByRole('button', { name: 'Crear y editar' }));

    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/formularios/nuevo-1/editar'));
    expect(cuerpo).toEqual({ titulo: 'Clima 2026' });
  });

  it('Cancelar cierra el diálogo sin crear nada', async () => {
    const { usuario } = renderizarApp('/formularios');

    await usuario.click(await screen.findByRole('button', { name: '+ Nuevo formulario' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Mis formularios: eliminar', () => {
  beforeEach(() => conSesion());

  it('pide confirmación: Cancelar no borra nada', async () => {
    conFormularios([propio]);
    const { usuario } = renderizarApp('/formularios');

    await usuario.click(within(await fila('Encuesta de café')).getByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Eliminar formulario?' });
    expect(dialogo).toHaveTextContent('«Encuesta de café» junto con todas sus respuestas');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Encuesta de café' })).toBeInTheDocument();
  });

  it('al confirmar, elimina y la lista se actualiza sola', async () => {
    conFormularios([propio, comoEditor]);
    const { usuario } = renderizarApp('/formularios');

    await usuario.click(within(await fila('Encuesta de café')).getByRole('button', { name: 'Eliminar' }));
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Encuesta de café' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Evaluación del taller' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('si la API rechaza (403), muestra el motivo dentro del diálogo', async () => {
    conFormularios([propio]);
    servidor.use(
      http.delete('/api/formularios/:id', () =>
        HttpResponse.json({ error: 'Tu rol (editor) no permite eliminar este formulario' }, { status: 403 }),
      ),
    );
    const { usuario } = renderizarApp('/formularios');

    await usuario.click(within(await fila('Encuesta de café')).getByRole('button', { name: 'Eliminar' }));
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('no permite eliminar');
  });
});

describe('haceTiempo', () => {
  const ahora = new Date('2026-09-25T12:00:00Z');

  it.each([
    ['2026-09-25T11:59:30Z', 'hace un momento'],
    ['2026-09-25T11:55:00Z', 'hace 5 minutos'],
    ['2026-09-25T10:00:00Z', 'hace 2 horas'],
    ['2026-09-24T12:00:00Z', 'ayer'],
    ['2026-09-11T12:00:00Z', 'hace 2 semanas'],
  ])('%s → %s', (fecha, esperado) => {
    expect(haceTiempo(fecha, ahora)).toBe(esperado);
  });
});
