import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CuerpoActualizacion, Detalle } from '../src/api/formularios';
import { renderizarApp } from './renderizar';
import { conSesion, detalleDePrueba, servidor } from './servidor';

/**
 * API simulada del formulario f1 con memoria: GET devuelve el estado actual; PUT lo guarda
 * (asignando ids a las preguntas nuevas) y responde 409 si la versión enviada ya no es la vigente.
 */
function conFormulario(inicial: Detalle, opciones: { versionNueva?: boolean } = {}) {
  const estado = { actual: inicial, cuerpos: [] as CuerpoActualizacion[] };
  servidor.use(
    http.get('/api/formularios/f1', () => HttpResponse.json(estado.actual)),
    http.put('/api/formularios/f1', async ({ request }) => {
      const cuerpo = (await request.json()) as CuerpoActualizacion;
      estado.cuerpos.push(cuerpo);
      if (cuerpo.version !== estado.actual.version) {
        return HttpResponse.json({ error: 'El formulario fue modificado por otra persona' }, { status: 409 });
      }
      estado.actual = {
        ...estado.actual,
        titulo: cuerpo.titulo,
        descripcion: cuerpo.descripcion ?? '',
        version: estado.actual.version + (opciones.versionNueva ? 1 : 0),
        preguntas: (cuerpo.preguntas ?? []).map((p, i) => ({ obligatoria: false, ...p, id: p.id ?? `srv-${i}` })) as Detalle['preguntas'],
      };
      return HttpResponse.json(estado.actual);
    }),
  );
  return estado;
}

const pregunta = (n: number) => screen.getByRole('group', { name: `Pregunta ${n}` });
const guardar = () => screen.getByRole('button', { name: 'Guardar' });

describe('Editor: cargar y construir preguntas', () => {
  beforeEach(() => conSesion());

  it('muestra el formulario con cada pregunta según su tipo', async () => {
    conFormulario(
      detalleDePrueba({
        preguntas: [
          { id: 'a', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: true, opciones: ['Latte', 'Mocca'] },
          { id: 'b', tipo: 'escala', texto: 'Nota', obligatoria: false, minimo: 1, maximo: 7 },
        ],
      }),
    );
    renderizarApp('/formularios/f1/editar');

    expect(await screen.findByLabelText('Título')).toHaveValue('Encuesta de café');
    const p1 = pregunta(1);
    expect(within(p1).getByLabelText('Tipo')).toHaveValue('opcion_unica');
    expect(within(p1).getByLabelText('Pregunta')).toHaveValue('¿Favorito?');
    expect(within(p1).getByLabelText('Obligatoria')).toBeChecked();
    expect(within(p1).getByLabelText('Opción 2')).toHaveValue('Mocca');
    expect(within(pregunta(2)).getByLabelText('Máximo')).toHaveValue(7);
    expect(guardar()).toBeDisabled(); // sin cambios
  });

  it('agrega preguntas de cada tipo con sus valores por defecto y pone el foco en el texto', async () => {
    conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');

    await usuario.click(await screen.findByRole('button', { name: '+ Opción múltiple' }));
    expect(within(pregunta(1)).getByLabelText('Pregunta')).toHaveFocus();
    expect(within(pregunta(1)).getByLabelText('Opción 1')).toHaveValue('Opción 1');

    await usuario.click(screen.getByRole('button', { name: '+ Escala' }));
    expect(within(pregunta(2)).getByLabelText('Mínimo')).toHaveValue(1);
    expect(within(pregunta(2)).getByLabelText('Máximo')).toHaveValue(5);
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
  });

  it('al pasar a un tipo de opciones, propone dos opciones', async () => {
    conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');

    await usuario.click(await screen.findByRole('button', { name: '+ Texto corto' }));
    expect(within(pregunta(1)).queryByLabelText('Opción 1')).not.toBeInTheDocument();
    await usuario.selectOptions(within(pregunta(1)).getByLabelText('Tipo'), 'opcion_unica');

    expect(within(pregunta(1)).getByLabelText('Opción 1')).toBeInTheDocument();
    expect(within(pregunta(1)).getByLabelText('Opción 2')).toBeInTheDocument();
  });

  it('agrega y quita opciones', async () => {
    conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.click(await screen.findByRole('button', { name: '+ Opción única' }));

    await usuario.click(within(pregunta(1)).getByRole('button', { name: '+ Agregar opción' }));
    expect(within(pregunta(1)).getByLabelText('Opción 3')).toHaveFocus();
    await usuario.click(within(pregunta(1)).getByRole('button', { name: 'Quitar opción 1' }));

    const opciones = within(pregunta(1)).getAllByRole('textbox', { name: /^Opción/ }).map((e) => (e as HTMLInputElement).value);
    expect(opciones).toEqual(['Opción 2', 'Opción 3']);
  });

  it('reordena con ↑↓ y el foco sigue a la pregunta movida', async () => {
    conFormulario(
      detalleDePrueba({
        preguntas: [
          { id: 'a', tipo: 'texto_corto', texto: 'Primera', obligatoria: false },
          { id: 'b', tipo: 'texto_corto', texto: 'Segunda', obligatoria: false },
        ],
      }),
    );
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await screen.findByLabelText('Título');
    expect(screen.getByRole('button', { name: 'Subir pregunta 1' })).toBeDisabled();

    await usuario.click(screen.getByRole('button', { name: 'Bajar pregunta 1' }));

    expect(within(pregunta(1)).getByLabelText('Pregunta')).toHaveValue('Segunda');
    expect(within(pregunta(2)).getByLabelText('Pregunta')).toHaveValue('Primera');
    // Quedó última: "bajar" está desactivado, así que el foco va a "subir" de la misma pregunta.
    expect(screen.getByRole('button', { name: 'Subir pregunta 2' })).toHaveFocus();
  });
});

describe('Editor: validar y guardar', () => {
  beforeEach(() => conSesion());

  it('aplica las reglas del dominio en el cliente, bajo cada pregunta, sin llamar a la API', async () => {
    const api = conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.click(await screen.findByRole('button', { name: '+ Opción única' }));
    await usuario.click(screen.getByRole('button', { name: '+ Escala' }));
    await usuario.type(within(pregunta(1)).getByLabelText('Pregunta'), '¿Sí o no?');
    await usuario.click(within(pregunta(1)).getByRole('button', { name: 'Quitar opción 2' }));
    await usuario.clear(within(pregunta(2)).getByLabelText('Mínimo'));
    await usuario.type(within(pregunta(2)).getByLabelText('Mínimo'), '5');

    await usuario.click(guardar());

    expect(await within(pregunta(1)).findByText('Necesita al menos 2 opciones')).toBeInTheDocument();
    expect(within(pregunta(2)).getByText('Es obligatorio')).toBeInTheDocument(); // texto vacío (forma, Zod)
    expect(api.cuerpos).toHaveLength(0);
  });

  it('guarda con la versión y los ids, solo con los campos de cada tipo, y queda sin cambios', async () => {
    const api = conFormulario(detalleDePrueba({ preguntas: [{ id: 'p1', tipo: 'texto_corto', texto: 'Nombre', obligatoria: false }] }));
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.type(within(await screen.findByRole('group', { name: 'Pregunta 1' })).getByLabelText('Pregunta'), ' completo');
    await usuario.click(screen.getByRole('button', { name: '+ Escala' }));
    await usuario.type(within(pregunta(2)).getByLabelText('Pregunta'), 'Nota');

    await usuario.click(guardar());

    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(api.cuerpos[0]).toEqual({
      titulo: 'Encuesta de café',
      descripcion: '',
      version: 1,
      preguntas: [
        { id: 'p1', tipo: 'texto_corto', texto: 'Nombre completo', obligatoria: false },
        { tipo: 'escala', texto: 'Nota', obligatoria: false, minimo: 1, maximo: 5 },
      ],
    });
    expect(screen.queryByText('Cambios sin guardar')).not.toBeInTheDocument();
    expect(guardar()).toBeDisabled();
  });

  it('si se crea una versión nueva lo avisa, y el siguiente guardado envía esa versión', async () => {
    const api = conFormulario(
      detalleDePrueba({ estado: 'publicado', preguntas: [{ id: 'p1', tipo: 'texto_corto', texto: 'Nombre', obligatoria: false }] }),
      { versionNueva: true },
    );
    const { usuario } = renderizarApp('/formularios/f1/editar');
    expect(await screen.findByText(/ya fue publicado/)).toBeInTheDocument();

    await usuario.type(within(pregunta(1)).getByLabelText('Pregunta'), '!');
    await usuario.click(guardar());
    expect(await screen.findByText(/Se creó la versión 2/)).toBeInTheDocument();
    expect(screen.getByText('versión 2')).toBeInTheDocument();

    await usuario.type(screen.getByLabelText('Título'), '!');
    await usuario.click(guardar());
    await waitFor(() => expect(api.cuerpos).toHaveLength(2));
    expect(api.cuerpos[1]?.version).toBe(2);
  });

  it('en un formulario publicado, el tipo queda bloqueado en las preguntas ya guardadas, no en las nuevas', async () => {
    conFormulario(detalleDePrueba({ estado: 'publicado', preguntas: [{ id: 'p1', tipo: 'texto_corto', texto: 'Nombre', obligatoria: false }] }));
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await screen.findByLabelText('Título');

    await usuario.click(screen.getByRole('button', { name: '+ Fecha' }));

    expect(within(pregunta(1)).getByLabelText('Tipo')).toBeDisabled();
    expect(within(pregunta(1)).getByText(/no puede cambiar de tipo/)).toBeInTheDocument();
    expect(within(pregunta(2)).getByLabelText('Tipo')).toBeEnabled();
  });

  it('409: avisa; "Seguir editando" conserva los cambios y "Recargar" trae la versión de la otra persona', async () => {
    const api = conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.type(await screen.findByLabelText('Título'), ' (mío)');
    // Otra persona guardó mientras tanto:
    api.actual = { ...api.actual, titulo: 'Título de otra persona', version: 2 };

    await usuario.click(guardar());
    const dialogo = await screen.findByRole('dialog', { name: 'Otra persona modificó este formulario' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Título')).toHaveValue('Encuesta de café (mío)');

    await usuario.click(guardar());
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Recargar' }));

    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Título de otra persona'));
    expect(screen.getByText('versión 2')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un 400 con detalles del servidor se muestra bajo su campo', async () => {
    conFormulario(detalleDePrueba());
    servidor.use(
      http.put('/api/formularios/f1', () =>
        HttpResponse.json({ error: 'Datos inválidos', detalles: [{ campo: 'titulo', mensaje: 'Rechazado por el servidor' }] }, { status: 400 }),
      ),
    );
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.type(await screen.findByLabelText('Título'), '!');

    await usuario.click(guardar());

    expect(await screen.findByText('Rechazado por el servidor')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Editor: permisos, errores y salir con cambios', () => {
  beforeEach(() => conSesion());

  it('un lector ve "solo lectura" con un enlace a resultados, sin editor', async () => {
    conFormulario(detalleDePrueba({ rol: 'lector' }));
    renderizarApp('/formularios/f1/editar');

    expect(await screen.findByText(/Solo lectura: tu rol \(lector\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver resultados' })).toHaveAttribute('href', '/formularios/f1/resultados');
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('un formulario inexistente muestra "no encontrado"', async () => {
    servidor.use(http.get('/api/formularios/f1', () => HttpResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })));
    renderizarApp('/formularios/f1/editar');

    expect(await screen.findByRole('alert')).toHaveTextContent('Formulario no encontrado.');
  });

  it('salir con cambios sin guardar pide confirmación', async () => {
    conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.type(await screen.findByLabelText('Título'), '!');

    await usuario.click(screen.getByRole('link', { name: '← Mis formularios' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Tienes cambios sin guardar' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Quedarme' }));
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/formularios/f1/editar');

    await usuario.click(screen.getByRole('link', { name: '← Mis formularios' }));
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salir sin guardar' }));
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent(/^\/formularios$/));
  });

  it('sin cambios, sale sin preguntar', async () => {
    conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await screen.findByLabelText('Título');

    await usuario.click(screen.getByRole('link', { name: '← Mis formularios' }));

    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent(/^\/formularios$/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
