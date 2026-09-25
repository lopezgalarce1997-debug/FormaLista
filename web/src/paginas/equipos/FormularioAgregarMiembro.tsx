import { esquemaNuevoMiembro, normalizarEmail, ROLES_EQUIPO } from '@formalista/compartido';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ErrorApi } from '../../api/cliente';
import { apiEquipos, type Equipo } from '../../api/equipos';
import { aplicarErroresServidor } from '../../componentes/erroresServidor';
import { Alerta, Boton, Campo } from '../../componentes/ui';
import { TEXTO_ROL } from './roles';

type Entrada = z.input<typeof esquemaNuevoMiembro>;
type Datos = z.output<typeof esquemaNuevoMiembro>;

/** Solo lo ve un propietario. Mismo esquema que valida la API (paquete compartido). */
export function FormularioAgregarMiembro({
  equipoId,
  alAgregar,
}: {
  equipoId: string;
  alAgregar: (equipo: Equipo, agregado: Equipo['miembros'][number] | undefined) => void;
}) {
  const { register, handleSubmit, setError, reset, setFocus, formState } = useForm<Entrada, unknown, Datos>({
    resolver: zodResolver(esquemaNuevoMiembro),
    // Menor privilegio: si no se elige otro, el nuevo miembro solo puede ver.
    defaultValues: { email: '', rol: 'lector' },
  });

  const agregar = useMutation({
    mutationFn: ({ email, rol }: Datos) => apiEquipos.agregarMiembro(equipoId, email, rol),
    onSuccess: (equipo, { email, rol }) => {
      alAgregar(equipo, equipo.miembros.find((m) => m.email === normalizarEmail(email)));
      reset({ email: '', rol }); // se conserva el rol elegido
    },
    onError: (error) => {
      // 404 (email no registrado) y 409 (ya es miembro) son problemas DEL EMAIL: van bajo ese campo.
      if (error instanceof ErrorApi && (error.status === 404 || error.status === 409)) {
        setError('email', { message: error.message }, { shouldFocus: true });
      } else {
        aplicarErroresServidor(error, setError, ['email', 'rol']);
      }
    },
  });

  // Tras agregar, el foco vuelve al email: agregar varios seguidos es rápido. En un efecto y no en
  // onSuccess: la documentación de RHF advierte no llamar setFocus justo después de reset().
  useEffect(() => {
    if (agregar.isSuccess) setFocus('email');
  }, [agregar.isSuccess, agregar.data, setFocus]);

  return (
    <form
      onSubmit={handleSubmit((datos) => agregar.mutate(datos))}
      noValidate
      aria-labelledby="titulo-agregar"
      className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h2 id="titulo-agregar" className="font-semibold text-slate-900">
        Agregar miembro
      </h2>
      {formState.errors.root?.servidor && <Alerta>{formState.errors.root.servidor.message}</Alerta>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Campo
            id="email-miembro"
            etiqueta="Email"
            type="email"
            autoComplete="off"
            placeholder="persona@correo.cl"
            error={formState.errors.email?.message}
            {...register('email')}
          />
        </div>
        <div>
          <label htmlFor="rol-miembro" className="block text-sm font-medium text-slate-700">
            Rol
          </label>
          <select
            id="rol-miembro"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm sm:w-auto"
            {...register('rol')}
          >
            {ROLES_EQUIPO.map((rol) => (
              <option key={rol} value={rol}>
                {TEXTO_ROL[rol]}
              </option>
            ))}
          </select>
        </div>
        <Boton type="submit" className="sm:mt-6" disabled={agregar.isPending}>
          {agregar.isPending ? 'Agregando…' : 'Agregar'}
        </Boton>
      </div>
      <p className="text-xs text-slate-500">La persona debe tener una cuenta en FormaLista con ese email.</p>
    </form>
  );
}
