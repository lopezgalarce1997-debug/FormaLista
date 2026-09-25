import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { apiAuth, type Usuario } from '../api/auth';
import { alRecibirNoAutorizado, ErrorApi } from '../api/cliente';

const CLAVE_SESION = ['sesion'] as const;

interface Sesion {
  usuario: Usuario | null;
  /** true mientras se consulta /auth/yo al abrir la app (¿hay una cookie de sesión válida?). */
  cargando: boolean;
  establecerUsuario: (usuario: Usuario) => void;
  cerrarSesion: () => Promise<void>;
}

const ContextoSesion = createContext<Sesion | null>(null);

/**
 * La sesión vive en la caché de TanStack Query (clave ['sesion']): no hay un estado global aparte.
 * Al abrir la app se pregunta a /auth/yo; como el token está en una cookie httpOnly, esta es la
 * única forma de saber si hay sesión.
 */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: CLAVE_SESION,
    queryFn: async () => {
      try {
        return await apiAuth.yo();
      } catch (error) {
        if (error instanceof ErrorApi && error.status === 401) return null; // sin sesión: no es un error
        throw error;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // Si cualquier llamada recibe un 401, la sesión expiró: se limpia y las rutas protegidas redirigen.
  useEffect(() => {
    alRecibirNoAutorizado(() => queryClient.setQueryData(CLAVE_SESION, null));
    return () => alRecibirNoAutorizado(null);
  }, [queryClient]);

  const valor = useMemo<Sesion>(
    () => ({
      usuario: consulta.data ?? null,
      cargando: consulta.isPending,
      establecerUsuario: (usuario) => queryClient.setQueryData(CLAVE_SESION, usuario),
      cerrarSesion: async () => {
        await apiAuth.logout();
        queryClient.setQueryData(CLAVE_SESION, null);
        // Borra los datos cacheados del usuario anterior, pero NO la sesión: si se borrara, useQuery
        // volvería a pedir /auth/yo al instante (una llamada innecesaria y una carrera con el null).
        queryClient.removeQueries({ predicate: (consulta) => consulta.queryKey[0] !== CLAVE_SESION[0] });
      },
    }),
    [consulta.data, consulta.isPending, queryClient],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): Sesion {
  const sesion = useContext(ContextoSesion);
  if (!sesion) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  return sesion;
}
