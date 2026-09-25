import { esquemaRegistro } from '@formalista/compartido';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { apiAuth } from '../../api/auth';
import { ErrorApi } from '../../api/cliente';
import { destinoSeguro } from '../../auth/rutas';
import { useSesion } from '../../auth/sesion';
import { aplicarErroresServidor } from '../../componentes/erroresServidor';
import { Alerta, Boton, Campo } from '../../componentes/ui';
import { PantallaAuth } from './PantallaAuth';

// Las reglas de la API (compartidas) + una regla solo de la interfaz: repetir la contraseña.
const esquema = esquemaRegistro
  .extend({ confirmar: z.string() })
  .refine((d) => d.password === d.confirmar, { path: ['confirmar'], message: 'Las contraseñas no coinciden' });

type DatosFormulario = z.input<typeof esquema>;

export function Registro() {
  const { establecerUsuario } = useSesion();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();

  const { register, handleSubmit, setError, formState } = useForm<DatosFormulario, unknown, z.output<typeof esquema>>({
    resolver: zodResolver(esquema),
  });
  const { errors } = formState;

  const registro = useMutation({
    mutationFn: apiAuth.registrar,
    onSuccess: (usuario) => {
      establecerUsuario(usuario);
      navegar(destinoSeguro(parametros.get('volver')), { replace: true });
    },
    onError: (error) => {
      // 409: el único conflicto posible es el email; se muestra junto a ese campo.
      if (error instanceof ErrorApi && error.status === 409) setError('email', { message: error.message });
      else aplicarErroresServidor(error, setError, ['nombre', 'email', 'password']);
    },
  });

  return (
    <PantallaAuth titulo="Crea tu cuenta" subtitulo="Es gratis y solo toma un minuto.">
      <form
        onSubmit={handleSubmit(({ confirmar: _confirmar, ...datos }) => registro.mutate(datos))}
        noValidate
        className="space-y-5"
      >
        {errors.root?.servidor && <Alerta>{errors.root.servidor.message}</Alerta>}
        <Campo id="nombre" etiqueta="Nombre" autoComplete="name" error={errors.nombre?.message} {...register('nombre')} />
        <Campo id="email" etiqueta="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Campo
          id="password"
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Campo
          id="confirmar"
          etiqueta="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.confirmar?.message}
          {...register('confirmar')}
        />
        <Boton type="submit" className="w-full" disabled={registro.isPending}>
          {registro.isPending ? 'Creando cuenta…' : 'Crear cuenta'}
        </Boton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Ya tienes cuenta?{' '}
        <Link to={`/login${parametros.size ? `?${parametros}` : ''}`} className="font-semibold text-indigo-600 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </PantallaAuth>
  );
}
