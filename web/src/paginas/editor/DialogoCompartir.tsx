import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiEquipos, clavesEquipos } from '../../api/equipos';
import { apiFormularios, type Detalle } from '../../api/formularios';
import { Cargando } from '../../componentes/Cargando';
import { Dialogo } from '../../componentes/Dialogo';
import { Alerta, Boton } from '../../componentes/ui';

interface Props {
  detalle: Detalle;
  abierto: boolean;
  alCerrar: () => void;
  alCompartir: (nuevo: Detalle) => Promise<void>;
}

/** Elegir con qué equipo (de los míos) se comparte el formulario, o dejar de compartirlo. */
export function DialogoCompartir({ detalle, abierto, alCerrar, alCompartir }: Props) {
  // Los equipos solo se piden al abrir el diálogo.
  const equipos = useQuery({ queryKey: clavesEquipos.lista, queryFn: apiEquipos.listar, enabled: abierto });
  const [elegido, setElegido] = useState<number | null>(detalle.equipo?.id ?? null);

  // Cada vez que se abre, parte desde lo que está guardado.
  useEffect(() => {
    if (abierto) setElegido(detalle.equipo?.id ?? null);
  }, [abierto, detalle.equipo]);

  const compartir = useMutation({
    mutationFn: (equipoId: number | null) => apiFormularios.compartir(detalle.id, equipoId),
    onSuccess: async (nuevo) => {
      await alCompartir(nuevo);
      alCerrar();
    },
  });

  const cerrar = () => {
    compartir.reset();
    alCerrar();
  };

  const opcion = (valor: number | null, texto: string, detalleTexto?: string) => (
    <label className="flex items-start gap-3 rounded-md p-2 hover:bg-slate-50">
      <input
        type="radio"
        name="equipo"
        className="mt-0.5 size-4"
        checked={elegido === valor}
        onChange={() => setElegido(valor)}
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{texto}</span>
        {detalleTexto && <span className="block text-xs text-slate-500">{detalleTexto}</span>}
      </span>
    </label>
  );

  return (
    <Dialogo abierto={abierto} alCerrar={cerrar} titulo="Compartir formulario">
      <p className="text-sm text-slate-600">
        Los miembros del equipo verán el formulario según su rol: los editores podrán editarlo y publicarlo; los lectores, solo
        ver sus resultados. Eliminar y compartir siguen siendo solo tuyos.
      </p>

      <div className="mt-4" role="radiogroup" aria-label="Equipo">
        {equipos.isPending && <Cargando texto="Cargando equipos…" />}
        {equipos.isError && <Alerta>No se pudieron cargar tus equipos: {equipos.error.message}</Alerta>}
        {equipos.isSuccess && (
          <div className="space-y-1">
            {opcion(null, 'No compartir', 'Solo tú tendrás acceso.')}
            {equipos.data.map((e) =>
              opcion(e.id, e.nombre, `${e.cantidadMiembros} ${e.cantidadMiembros === 1 ? 'miembro' : 'miembros'} · tu rol: ${e.rol}`),
            )}
            {equipos.data.length === 0 && (
              <p className="p-2 text-sm text-slate-500">Aún no perteneces a ningún equipo. Podrás crearlos en la sección Equipos.</p>
            )}
          </div>
        )}
      </div>

      {compartir.isError && (
        <div className="mt-3">
          <Alerta>{compartir.error.message}</Alerta>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={cerrar}>
          Cancelar
        </Boton>
        <Boton
          disabled={!equipos.isSuccess || compartir.isPending || elegido === (detalle.equipo?.id ?? null)}
          onClick={() => compartir.mutate(elegido)}
        >
          {compartir.isPending ? 'Guardando…' : 'Guardar'}
        </Boton>
      </div>
    </Dialogo>
  );
}
