import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFormularios, clavesFormularios, type Resumen } from '../../api/formularios';
import { Dialogo } from '../../componentes/Dialogo';
import { Alerta, Boton } from '../../componentes/ui';

/** Confirma antes de eliminar: borra el formulario Y sus respuestas, sin vuelta atrás. */
export function DialogoEliminar({ formulario, alCerrar }: { formulario: Resumen | null; alCerrar: () => void }) {
  const queryClient = useQueryClient();

  const eliminar = useMutation({
    mutationFn: apiFormularios.eliminar,
    onSuccess: async () => {
      // La lista se vuelve a pedir: TanStack Query la actualiza sola en pantalla.
      await queryClient.invalidateQueries({ queryKey: clavesFormularios.lista });
      alCerrar();
    },
  });

  const cerrar = () => {
    eliminar.reset();
    alCerrar();
  };

  return (
    <Dialogo abierto={formulario !== null} alCerrar={cerrar} titulo="¿Eliminar formulario?">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Se eliminará <strong className="text-slate-900">«{formulario?.titulo}»</strong> junto con todas sus respuestas.
          Esta acción no se puede deshacer.
        </p>
        {eliminar.isError && <Alerta>{eliminar.error.message}</Alerta>}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={cerrar} autoFocus>
            Cancelar
          </Boton>
          <Boton variante="peligro" disabled={eliminar.isPending} onClick={() => formulario && eliminar.mutate(formulario.id)}>
            {eliminar.isPending ? 'Eliminando…' : 'Eliminar'}
          </Boton>
        </div>
      </div>
    </Dialogo>
  );
}
