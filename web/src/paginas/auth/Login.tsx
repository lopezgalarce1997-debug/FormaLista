import { esquemaLogin, type DatosLogin } from '@formalista/compartido';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { apiAuth } from '../../api/auth';
import { destinoSeguro } from '../../auth/rutas';
import { useSesion } from '../../auth/sesion';
import { aplicarErroresServidor } from '../../componentes/erroresServidor';
import { Alerta, Boton, Campo } from '../../componentes/ui';
import { PantallaAuth } from './PantallaAuth';

export function Login() {
  const { establecerUsuario } = useSesion();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const destino = destinoSeguro(parametros.get('volver'));

  // Mismo esquema Zod que usa la API para validar el login (paquete compartido).
  const { register, handleSubmit, setError, formState } = useForm<DatosLogin>({ resolver: zodResolver(esquemaLogin) });
  const { errors } = formState;

  const login = useMutation({
    mutationFn: apiAuth.login,
    onSuccess: (usuario) => {
      establecerUsuario(usuario);
      navegar(destino, { replace: true });
    },
    onError: (error) => aplicarErroresServidor(error, setError, ['email', 'password']),
  });

  return (
    <PantallaAuth titulo="Inicia sesión" subtitulo="Crea formularios y revisa sus resultados.">
      <form onSubmit={handleSubmit((datos) => login.mutate(datos))} noValidate className="space-y-5">
        {errors.root?.servidor && <Alerta>{errors.root.servidor.message}</Alerta>}
        <Campo id="email" etiqueta="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Campo
          id="password"
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Boton type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </Boton>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        ¿No tienes cuenta?{' '}
        <Link to={`/registro${parametros.size ? `?${parametros}` : ''}`} className="font-semibold text-indigo-600 hover:underline">
          Regístrate
        </Link>
      </p>
    </PantallaAuth>
  );
}
