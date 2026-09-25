import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PaginaDeRespuestas, ResultadosDeFormulario } from '../src/api/resultados';
import { renderizarApp } from './renderizar';
import { conSesion, detalleDePrueba, servidor } from './servidor';

const resultados = (cambios: Partial<ResultadosDeFormulario> = {}): ResultadosDeFormulario => ({
  version: 'todas',
  total: 5,
  porVersion: [
    { version: 1, cantidad: 3 },
    { version: 2, cantidad: 2 },
  ],
  porDia: [
    { dia: '2026-09-24', cantidad: 3 },
    { dia: '2026-09-25', cantidad: 2 },
  ],
  preguntas: [
    {
      id: 'fav',
      tipo: 'opcion_unica',
      texto: '¿Cuál prefieres?',
      versiones: [1, 2],
      textoCambio: true,
      respondieron: 5,
      posibles: 5,
      opciones: [
        { valor: 'Latte', cantidad: 2 },
        { valor: 'Espresso', cantidad: 1 },
        { valor: 'Mocca', cantidad: 2, yaNoExiste: true },
      ],
    },
    {
      id: 'extras',
      tipo: 'opcion_multiple',
      texto: 'Extras',
      versiones: [1, 2],
      textoCambio: false,
      respondieron: 3,
      posibles: 5,
      opciones: [
        { valor: 'Azúcar', cantidad: 2 },
        { valor: 'Canela', cantidad: 2 },
      ],
    },
    {
      id: 'nota',
      tipo: 'escala',
      texto: 'Nota',
      versiones: [1, 2],
      textoCambio: false,
      respondieron: 5,
      posibles: 5,
      minimo: 1,
      maximo: 10,
      promedio: 9,
      distribucion: Array.from({ length: 10 }, (_, i) => ({ valor: i + 1, cantidad: i + 1 === 10 ? 1 : i + 1 === 8 ? 1 : 0 })),
      advertencia: 'El rango cambió entre versiones: solo se combinan las versiones con rango 1–10; quedaron fuera 3 respuestas',
    },
    { id: 'visita', tipo: 'fecha', texto: 'Visita', versiones: [2], textoCambio: false, respondieron: 1, posibles: 2, primera: '2026-03-01', ultima: '2026-05-10' },
    {
      id: 'coment',
      tipo: 'texto_largo',
      texto: 'Comentarios',
      versiones: [1, 2],
      textoCambio: false,
      respondieron: 2,
      posibles: 5,
      ultimos: [
        { valor: 'Nuevo formato', enviadaEn: '2026-09-25T15:00:00.000Z' },
        { valor: 'Excelente', enviadaEn: '2026-09-24T15:00:00.000Z' },
      ],
    },
  ],
  preguntasAnteriores: [
    { id: 'vieja', tipo: 'texto_corto', texto: 'Pregunta eliminada', versiones: [1], textoCambio: false, respondieron: 1, posibles: 3, ultimos: [] },
  ],
  ...cambios,
});

const pagina = (n: number, totalPaginas = 2): PaginaDeRespuestas => ({
  pagina: n,
  tamano: 20,
  total: 25,
  totalPaginas,
  respuestas: [
    {
      id: `r-${n}`,
      enviadaEn: '2026-09-25T15:00:00.000Z',
      version: n === 1 ? 2 : 1,
      respuestas: [
        { preguntaId: 'fav', pregunta: n === 1 ? '¿Cuál prefieres?' : '¿Favorito?', tipo: 'opcion_unica', valor: 'Latte' },
        { preguntaId: 'extras', pregunta: 'Extras', tipo: 'opcion_multiple', valor: ['Azúcar', 'Canela'] },
        { preguntaId: 'visita', pregunta: 'Visita', tipo: 'fecha', valor: '2026-03-01' },
      ],
    },
  ],
});

/** API de resultados simulada: registra los query strings recibidos. */
function conResultados(r = resultados(), detalle = detalleDePrueba({ version: 2, estado: 'publicado' })) {
  const consultas: URLSearchParams[] = [];
  servidor.use(
    http.get('/api/formularios/f1', () => HttpResponse.json(detalle)),
    http.get('/api/formularios/f1/resultados', ({ request }) => {
      const qs = new URL(request.url).searchParams;
      consultas.push(qs);
      return HttpResponse.json({ ...r, version: qs.get('version') === 'todas' ? 'todas' : Number(qs.get('version')) });
    }),
    http.get('/api/formularios/f1/respuestas', ({ request }) => {
      const qs = new URL(request.url).searchParams;
      consultas.push(qs);
      return HttpResponse.json(pagina(Number(qs.get('pagina'))));
    }),
  );
  return consultas;
}

const estadistica = (texto: string) => screen.getByRole('article', { name: texto });

describe('Resultados: resumen', () => {
  beforeEach(() => conSesion());

  it('muestra los indicadores y el gráfico por día con su tabla accesible', async () => {
    conResultados();
    renderizarApp('/formularios/f1/resultados');

    expect(await screen.findByText('respuestas')).toBeInTheDocument();
    const indicadores = screen.getAllByRole('definition').map((d) => d.textContent);
    expect(indicadores.slice(0, 3)).toEqual(['5', '2', '25-09-2026']);

    const tabla = screen.getByRole('table', { name: 'Respuestas por día' });
    expect(within(tabla).getAllByRole('row')).toHaveLength(3); // encabezado + 2 días
    expect(within(tabla).getByRole('rowheader', { name: '24-09-2026' }).nextElementSibling).toHaveTextContent('3');
  });

  it('"Ver como tabla" muestra la tabla oculta', async () => {
    conResultados();
    const { usuario } = renderizarApp('/formularios/f1/resultados');
    const boton = (await screen.findAllByRole('button', { name: 'Ver como tabla' }))[0]!;
    expect(screen.getByRole('table', { name: 'Respuestas por día' })).toHaveClass('sr-only');

    await usuario.click(boton);

    expect(screen.getByRole('table', { name: 'Respuestas por día' })).not.toHaveClass('sr-only');
    expect(screen.getAllByRole('button', { name: 'Ocultar tabla' })[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('opciones: cantidad y % sobre quienes respondieron, y las eliminadas marcadas', async () => {
    conResultados();
    renderizarApp('/formularios/f1/resultados');

    const fav = await screen.findByRole('article', { name: '¿Cuál prefieres?' });
    expect(within(fav).getByText(/respondieron 5 de 5 \(100 %\) · versiones 1, 2 · el texto de la pregunta cambió/)).toBeInTheDocument();
    expect(within(fav).getByText('Latte').parentElement).toHaveTextContent('2 (40 %)');
    expect(within(fav).getByText('ya no existe').parentElement).toHaveTextContent('Mocca');
    expect(within(estadistica('Extras')).getByText(/los porcentajes no suman 100/)).toBeInTheDocument();
  });

  it('escala: promedio, advertencia de rango y distribución en tabla', async () => {
    conResultados();
    renderizarApp('/formularios/f1/resultados');

    const nota = await screen.findByRole('article', { name: 'Nota' });
    expect(within(nota).getByText(/promedio \(escala 1 a 10\)/).parentElement).toHaveTextContent(/^9\s*promedio/);
    expect(within(nota).getByText(/quedaron fuera 3 respuestas/)).toBeInTheDocument();
    expect(within(within(nota).getByRole('table')).getAllByRole('row')).toHaveLength(11);
  });

  it('fecha, textos recientes y preguntas de versiones anteriores', async () => {
    conResultados();
    const { usuario } = renderizarApp('/formularios/f1/resultados');

    const visita = await screen.findByRole('article', { name: 'Visita' });
    expect(within(visita).getByText('Primera fecha respondida').nextElementSibling).toHaveTextContent('01-03-2026');
    expect(within(visita).getByText('Última fecha respondida').nextElementSibling).toHaveTextContent('10-05-2026');
    expect(within(estadistica('Comentarios')).getByText('Nuevo formato')).toBeInTheDocument();
    expect(screen.getByText('Preguntas de versiones anteriores (1)')).toBeInTheDocument();

    await usuario.click(within(estadistica('Comentarios')).getByRole('button', { name: 'Ver todas en Respuestas →' }));
    expect(screen.getByRole('tab', { name: /Respuestas/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('pide los resultados con la zona del navegador y, al elegir una versión, con esa versión', async () => {
    const consultas = conResultados();
    const { usuario } = renderizarApp('/formularios/f1/resultados');
    await screen.findByRole('article', { name: 'Nota' });
    expect(consultas[0]?.get('version')).toBe('todas');
    expect(consultas[0]?.get('zona')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);

    await usuario.selectOptions(screen.getByLabelText('Versión'), '2');

    await waitFor(() => expect(consultas.at(-1)?.get('version')).toBe('2'));
    expect(screen.getByRole('option', { name: 'Versión 2 (vigente)' })).toBeInTheDocument();
  });

  it('"Actualizar" vuelve a pedir los resultados', async () => {
    const consultas = conResultados();
    const { usuario } = renderizarApp('/formularios/f1/resultados');
    await screen.findByRole('article', { name: 'Nota' });

    await usuario.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(consultas).toHaveLength(2));
  });

  it('sin respuestas, con el formulario publicado, invita a compartir el link', async () => {
    conResultados(resultados({ total: 0, porVersion: [], porDia: [], preguntas: [], preguntasAnteriores: [] }));
    renderizarApp('/formularios/f1/resultados');

    expect(await screen.findByText('Aún no hay respuestas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
  });

  it('un lector también ve los resultados, pero no el botón Editar', async () => {
    conResultados(resultados(), detalleDePrueba({ rol: 'lector', estado: 'publicado' }));
    renderizarApp('/formularios/f1/resultados');

    expect(await screen.findByRole('article', { name: 'Nota' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('un formulario inexistente muestra "no encontrado"', async () => {
    servidor.use(http.get('/api/formularios/f1', () => HttpResponse.json({ error: 'Formulario no encontrado' }, { status: 404 })));
    renderizarApp('/formularios/f1/resultados');

    expect(await screen.findByRole('alert')).toHaveTextContent('Formulario no encontrado.');
  });
});

describe('Resultados: respuestas individuales', () => {
  beforeEach(() => conSesion());

  it('pagina en el servidor y muestra cada respuesta con el texto de SU versión', async () => {
    const consultas = conResultados();
    const { usuario } = renderizarApp('/formularios/f1/resultados');
    await usuario.click(await screen.findByRole('tab', { name: 'Respuestas (5)' }));

    expect(await screen.findByText('¿Cuál prefieres?', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.getByText('Azúcar, Canela')).toBeInTheDocument();
    expect(screen.getByText('01-03-2026', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2 · 25 respuestas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Anterior' })).toBeDisabled();

    await usuario.click(screen.getByRole('button', { name: 'Siguiente →' }));

    expect(await screen.findByText('¿Favorito?', { selector: 'dt' })).toBeInTheDocument(); // versión 1: su texto original
    expect(screen.getByText(/versión 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
    expect(consultas.filter((q) => q.has('pagina')).map((q) => q.get('pagina'))).toEqual(['1', '2']);
  });
});
