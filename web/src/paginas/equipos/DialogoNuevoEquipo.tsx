import { esquemaEquipo } from '@formalista/compartido';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type { z } from 'zod';
import { apiEquipos, clavesEquipos } from '../../api/equipos';
import { Dialogo } from '../../componentes/Dialogo';
import { aplicarErroresServidor } from '../../componentes/erroresServidor';
import { Alerta, Boton, Campo } from '../../componentes/ui';

export function DialogoNuevoEquipo({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const { register, handleSubmit, setError, reset, formState } = useForm<
    z.input<typeof esquemaEquipo>,
    unknown,
    z.output<typeof esquemaEquipo>
  >({ resolver: zodResolver(esquemaEquipo) });

  const crear = useMutation({
    mutationFn: apiEquipos.crear,
    onSuccess: async (equipo) => {
      // La API devuelve el equipo completo: se deja en caché y el detalle se dibuja al instante
      // (sin "Cargando…"; TanStack Query igual lo revalida en segundo plano al montar la página).
      queryClient.setQueryData(clavesEquipos.detalle(String(equipo.id)), equipo);
      await queryClient.invalidateQueries({ queryKey: clavesEquipos.lista, exact: true });
      navegar(`/equipos/${equipo.id}`);
    },
    onError: (error) => aplicarErroresServidor(error, setError, ['nombre']),
  });

  const cerrar = () => {
    reset();
    alCerrar();
  };

  return (
    <Dialogo abierto={abierto} alCerrar={cerrar} titulo="Nuevo equipo">
      <form onSubmit={handleSubmit(({ nombre }) => crear.mutate(nombre))} noValidate className="space-y-4">
        {formState.errors.root?.servidor && <Alerta>{formState.errors.root.servidor.message}</Alerta>}
        <Campo
          id="nombre-equipo"
          etiqueta="Nombre"
          placeholder="Ej.: Marketing"
          autoFocus
          error={formState.errors.nombre?.message}
          {...register('nombre')}
        />
        <p className="text-sm text-slate-500">Serás su propietario y podrás agregar miembros a continuación.</p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={crear.isPending}>
            {crear.isPending ? 'Creando…' : 'Crear equipo'}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
