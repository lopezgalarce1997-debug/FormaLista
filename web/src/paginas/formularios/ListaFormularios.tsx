import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFormularios, clavesFormularios, type Resumen } from '../../api/formularios';
import { Alerta, Boton } from '../../componentes/ui';
import { DialogoEliminar } from './DialogoEliminar';
import { DialogoNuevoFormulario } from './DialogoNuevoFormulario';
import { FilaFormulario } from './FilaFormulario';

type Filtro = 'todos' | 'mios' | 'compartidos';

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'mios', texto: 'Míos' },
  { valor: 'compartidos', texto: 'Compartidos conmigo' },
];

/** Para buscar sin importar mayúsculas ni tildes: "Encuesta Café" encuentra "cafe". */
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function ListaFormularios() {
  const consulta = useQuery({ queryKey: clavesFormularios.lista, queryFn: apiFormularios.listar });
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Resumen | null>(null);

  // Filtrado en el cliente: la lista de un usuario es chica y ya está en caché.
  const visibles = useMemo(() => {
    const texto = normalizar(busqueda);
    return (consulta.data ?? []).filter(
      (f) =>
        (filtro === 'todos' || (filtro === 'mios') === (f.rol === 'propietario')) &&
        (!texto || normalizar(f.titulo).includes(texto)),
    );
  }, [consulta.data, filtro, busqueda]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mis formularios</h1>
        <Boton onClick={() => setCreando(true)}>+ Nuevo formulario</Boton>
      </div>

      {consulta.isPending && <Esqueleto />}

      {consulta.isError && (
        <div className="space-y-3">
          <Alerta>No se pudieron cargar los formularios: {consulta.error.message}</Alerta>
          <Boton variante="secundario" onClick={() => consulta.refetch()}>
            Reintentar
          </Boton>
        </div>
      )}

      {consulta.isSuccess && consulta.data.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="font-medium text-slate-900">Aún no tienes formularios</p>
          <p className="mt-1 text-sm text-slate-500">Crea el primero y compártelo con un link.</p>
          <Boton className="mt-4" onClick={() => setCreando(true)}>
            Crear mi primer formulario
          </Boton>
        </div>
      )}

      {consulta.isSuccess && consulta.data.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Filtrar formularios">
              {FILTROS.map(({ valor, texto }) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={filtro === valor}
                  onClick={() => setFiltro(valor)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    filtro === valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
            <input
              type="search"
              aria-label="Buscar por título"
              placeholder="Buscar por título…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-2 focus:outline-indigo-500 sm:w-64"
            />
          </div>

          {visibles.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Ningún formulario coincide con el filtro.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              {visibles.map((formulario) => (
                <FilaFormulario key={formulario.id} formulario={formulario} alEliminar={() => setAEliminar(formulario)} />
              ))}
            </ul>
          )}
        </>
      )}

      <DialogoNuevoFormulario abierto={creando} alCerrar={() => setCreando(false)} />
      <DialogoEliminar formulario={aEliminar} alCerrar={() => setAEliminar(null)} />
    </section>
  );
}

function Esqueleto() {
  return (
    <div role="status" aria-label="Cargando formularios" className="space-y-3">
      {[1, 2, 3].map((n) => (
        <div key={n} className="h-20 animate-pulse rounded-xl bg-slate-200" />
      ))}
    </div>
  );
}
