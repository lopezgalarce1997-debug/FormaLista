import { esquemaFormulario } from '@formalista/compartido';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type { z } from 'zod';
import { apiFormularios, clavesFormularios } from '../../api/formularios';
import { Dialogo } from '../../componentes/Dialogo';
import { aplicarErroresServidor } from '../../componentes/erroresServidor';
import { Alerta, Boton, Campo } from '../../componentes/ui';

// Solo el título, con la misma regla que la API (1 a 200 caracteres, con trim).
const esquema = esquemaFormulario.pick({ titulo: true });

export function DialogoNuevoFormulario({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const { register, handleSubmit, setError, reset, formState } = useForm<z.input<typeof esquema>, unknown, z.output<typeof esquema>>({
    resolver: zodResolver(esquema),
  });

  const crear = useMutation({
    mutationFn: apiFormularios.crear,
    onSuccess: async (formulario) => {
      await queryClient.invalidateQueries({ queryKey: clavesFormularios.lista });
      navegar(`/formularios/${formulario.id}/editar`);
    },
    onError: (error) => aplicarErroresServidor(error, setError, ['titulo']),
  });

  const cerrar = () => {
    reset();
    alCerrar();
  };

  return (
    <Dialogo abierto={abierto} alCerrar={cerrar} titulo="Nuevo formulario">
      <form onSubmit={handleSubmit(({ titulo }) => crear.mutate(titulo))} noValidate className="space-y-4">
        {formState.errors.root?.servidor && <Alerta>{formState.errors.root.servidor.message}</Alerta>}
        <Campo
          id="titulo-nuevo"
          etiqueta="Título"
          placeholder="Ej.: Encuesta de satisfacción"
          autoFocus
          error={formState.errors.titulo?.message}
          {...register('titulo')}
        />
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={crear.isPending}>
            {crear.isPending ? 'Creando…' : 'Crear y editar'}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
