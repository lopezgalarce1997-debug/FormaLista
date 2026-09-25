import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Detalle } from '../src/api/formularios';
import { conFormulario } from './apiSimulada';
import { renderizarApp } from './renderizar';
import { conSesion, detalleDePrueba, servidor } from './servidor';

const conTodosLosTipos = (cambios: Partial<Detalle> = {}) =>
  detalleDePrueba({
    preguntas: [
      { id: 'nombre', tipo: 'texto_corto', texto: '¿Tu nombre?', obligatoria: true },
      { id: 'coment', tipo: 'texto_largo', texto: 'Comentarios', obligatoria: false },
      { id: 'fav', tipo: 'opcion_unica', texto: '¿Favorito?', obligatoria: false, opciones: ['Latte', 'Mocca'] },
      { id: 'extras', tipo: 'opcion_multiple', texto: 'Extras', obligatoria: false, opciones: ['Azúcar', 'Canela'] },
      { id: 'nota', tipo: 'escala', texto: 'Nota', obligatoria: false, minimo: 1, maximo: 5 },
      { id: 'visita', tipo: 'fecha', texto: 'Visita', obligatoria: false },
    ],
    ...cambios,
  });

const pestana = (nombre: string) => screen.getByRole('tab', { name: nombre });

describe('Vista previa', () => {
  beforeEach(() => conSesion());

  it('muestra cada pregunta como la verá quien responde', async () => {
    conFormulario(conTodosLosTipos());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.click(await screen.findByRole('tab', { name: 'Vista previa' }));

    expect(pestana('Vista previa')).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('heading', { name: 'Encuesta de café' })).toBeInTheDocument();
    expect(within(panel).getByRole('textbox', { name: /¿Tu nombre\?/ })).toHaveAttribute('aria-required', 'true');
    expect(within(panel).getByRole('textbox', { name: 'Comentarios' }).tagName).toBe('TEXTAREA');
    expect(within(within(panel).getByRole('radiogroup', { name: '¿Favorito?' })).getAllByRole('radio')).toHaveLength(2);
    expect(within(within(panel).getByRole('group', { name: 'Extras' })).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(within(panel).getByRole('radiogroup', { name: 'Nota' })).getAllByRole('radio')).toHaveLength(5);
    expect(within(panel).getByLabelText('Visita')).toHaveAttribute('type', 'date');
    // El editor se oculta, no se desmonta.
    expect(screen.getByLabelText('Título', { selector: 'input' })).not.toBeVisible();
  });

  it('"Probar validación" usa las reglas del dominio: marca la obligatoria vacía y luego acepta', async () => {
    const api = conFormulario(conTodosLosTipos());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.click(await screen.findByRole('tab', { name: 'Vista previa' }));

    await usuario.click(screen.getByRole('button', { name: 'Probar validación' }));
    expect(await screen.findByText('Es obligatoria')).toBeInTheDocument();

    await usuario.type(screen.getByRole('textbox', { name: /¿Tu nombre\?/ }), 'Ana{Enter}'); // Enter no guarda nada
    await usuario.click(screen.getByRole('radio', { name: '4' }));
    await usuario.click(screen.getByRole('button', { name: 'Probar validación' }));

    expect(await screen.findByText('Las respuestas son válidas: así se enviarían.')).toBeInTheDocument();
    expect(screen.queryByText('Es obligatoria')).not.toBeInTheDocument();
    expect(api.cuerpos).toHaveLength(0);
  });

  it('refleja los cambios sin guardar del editor', async () => {
    conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.click(await screen.findByRole('button', { name: '+ Opción única' }));
    await usuario.type(screen.getByLabelText('Pregunta'), '¿Té o café?');

    await usuario.click(pestana('Vista previa'));

    expect(screen.getByRole('radiogroup', { name: '¿Té o café?' })).toBeInTheDocument();
  });

  it('las flechas ← → cambian de pestaña', async () => {
    conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.click(await screen.findByRole('tab', { name: 'Editar' }));

    await usuario.keyboard('{ArrowRight}');

    expect(pestana('Vista previa')).toHaveAttribute('aria-selected', 'true');
    expect(pestana('Vista previa')).toHaveFocus();
  });

  it('guardar con errores desde la vista previa vuelve al editor para mostrarlos', async () => {
    conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');
    await usuario.click(await screen.findByRole('button', { name: '+ Texto corto' })); // pregunta sin texto
    await usuario.click(pestana('Vista previa'));

    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(pestana('Editar')).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByText('Es obligatorio')).toBeVisible();
  });
});

describe('Publicar y cerrar', () => {
  beforeEach(() => conSesion());

  it('Publicar se desactiva sin preguntas y con cambios sin guardar, explicando por qué', async () => {
    conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');

    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publicar' })).toHaveAccessibleDescription(/Agrega al menos una pregunta/);

    await usuario.click(screen.getByRole('button', { name: '+ Fecha' }));
    expect(screen.getByRole('button', { name: 'Publicar' })).toHaveAccessibleDescription('Guarda los cambios antes de publicar.');
  });

  it('publicar cambia el estado en pantalla y muestra el link; cerrar y volver a publicar', async () => {
    conFormulario(conTodosLosTipos());
    const { usuario } = renderizarApp('/formularios/f1/editar');

    await usuario.click(await screen.findByRole('button', { name: 'Publicar' }));

    expect(await screen.findByText('Publicado')).toBeInTheDocument();
    expect(screen.getByText(/ya fue publicado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
    // Ahora las preguntas guardadas no pueden cambiar de tipo.
    expect(within(screen.getByRole('group', { name: 'Pregunta 1' })).getByLabelText('Tipo')).toBeDisabled();

    await usuario.click(screen.getByRole('button', { name: 'Cerrar formulario' }));
    expect(await screen.findByText('Cerrado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar link' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar de nuevo' })).toBeEnabled();
  });

  it('si la API rechaza la publicación, muestra el motivo', async () => {
    conFormulario(conTodosLosTipos());
    servidor.use(
      http.post('/api/formularios/f1/publicar', () => HttpResponse.json({ error: 'El formulario ya está publicado' }, { status: 409 })),
    );
    const { usuario } = renderizarApp('/formularios/f1/editar');

    await usuario.click(await screen.findByRole('button', { name: 'Publicar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El formulario ya está publicado');
  });
});

describe('Compartir', () => {
  beforeEach(() => conSesion());

  it('el propietario elige un equipo; el formulario queda compartido', async () => {
    const api = conFormulario(detalleDePrueba());
    const { usuario } = renderizarApp('/formularios/f1/editar');

    await usuario.click(await screen.findByRole('button', { name: 'Compartir…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Compartir formulario' });
    expect(await within(dialogo).findByRole('radio', { name: /No compartir/ })).toBeChecked();
    expect(within(dialogo).getByText('1 miembro · tu rol: lector')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Guardar' })).toBeDisabled(); // sin cambios

    await usuario.click(within(dialogo).getByRole('radio', { name: /Ventas/ }));
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('· Compartido con Ventas')).toBeInTheDocument();
    expect(api.compartidoCon).toEqual([2]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dejar de compartir envía equipoId null', async () => {
    const api = conFormulario(detalleDePrueba({ equipo: { id: 1, nombre: 'Marketing' } }));
    const { usuario } = renderizarApp('/formularios/f1/editar');

    await usuario.click(await screen.findByRole('button', { name: 'Compartir…' }));
    expect(await screen.findByRole('radio', { name: /Marketing/ })).toBeChecked();
    await usuario.click(screen.getByRole('radio', { name: /No compartir/ }));
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.compartidoCon).toEqual([null]));
    expect(screen.queryByText(/Compartido con/)).not.toBeInTheDocument();
  });

  it('sin equipos lo explica', async () => {
    const api = conFormulario(detalleDePrueba());
    api.equipos = [];
    const { usuario } = renderizarApp('/formularios/f1/editar');

    await usuario.click(await screen.findByRole('button', { name: 'Compartir…' }));

    expect(await screen.findByText(/Aún no perteneces a ningún equipo/)).toBeInTheDocument();
  });

  it('un editor puede publicar pero no ve Compartir', async () => {
    conFormulario(conTodosLosTipos({ rol: 'editor', equipo: { id: 1, nombre: 'Marketing' } }));
    renderizarApp('/formularios/f1/editar');

    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Compartir…' })).not.toBeInTheDocument();
  });
});
