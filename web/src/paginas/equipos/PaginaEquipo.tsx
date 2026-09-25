import { ROLES_EQUIPO, validarCambioDeMiembro, type RolEquipo } from '@formalista/compartido';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { apiEquipos, clavesEquipos, type Equipo } from '../../api/equipos';
import { clavesFormularios } from '../../api/formularios';
import { useSesion } from '../../auth/sesion';
import { Cargando } from '../../componentes/Cargando';
import { Dialogo } from '../../componentes/Dialogo';
import { Alerta, Boton, clasesBoton } from '../../componentes/ui';
import { FilaMiembro } from './FilaMiembro';
import { FormularioAgregarMiembro } from './FormularioAgregarMiembro';
import { DESCRIPCION_ROL, TEXTO_ROL } from './roles';

type Miembro = Equipo['miembros'][number];

/** Acciones que se confirman antes de ejecutarse. */
type Confirmacion =
  | { tipo: 'quitar'; miembro: Miembro }
  | { tipo: 'salir'; miembro: Miembro }
  | { tipo: 'bajarse'; miembro: Miembro; rol: RolEquipo };

/** /equipos/:id — los miembros del equipo. Solo un propietario los gestiona. */
export function PaginaEquipo() {
  const { id = '' } = useParams();
  const consulta = useQuery({ queryKey: clavesEquipos.detalle(id), queryFn: () => apiEquipos.obtener(id) });

  if (consulta.isPending) return <Cargando texto="Cargando equipo…" />;
  if (consulta.isError) {
    // 404 también si existe pero no soy miembro: la API no revela equipos ajenos.
    const noExiste = consulta.error instanceof ErrorApi && consulta.error.status === 404;
    return (
      <section className="space-y-4">
        <Alerta>{noExiste ? 'Equipo no encontrado.' : `No se pudo cargar el equipo: ${consulta.error.message}`}</Alerta>
        <div className="flex gap-2">
          <Link to="/equipos" className={clasesBoton('secundario')}>
            Volver a equipos
          </Link>
          {!noExiste && (
            <Boton variante="secundario" onClick={() => consulta.refetch()}>
              Reintentar
            </Boton>
          )}
        </div>
      </section>
    );
  }
  return <DetalleDeEquipo equipo={consulta.data} />;
}

function DetalleDeEquipo({ equipo }: { equipo: Equipo }) {
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const { usuario } = useSesion();
  const yo = usuario?.id;
  const id = String(equipo.id);
  const clave = clavesEquipos.detalle(id);
  const gestiona = equipo.rol === 'propietario';

  const [aviso, setAviso] = useState('');
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const tituloMiembros = useRef<HTMLHeadingElement>(null);

  const anunciar = (texto: string) => {
    setErrorAccion(null);
    setAviso(texto);
  };
  const fallar = (error: Error) => {
    setAviso('');
    setErrorAccion(error.message);
    // Quizá otro propietario cambió algo mientras tanto (p. ej. me quitó el rol): se vuelve a pedir.
    void queryClient.invalidateQueries({ queryKey: clave, exact: true });
  };
  /** Mi rol en el equipo decide mi rol en sus formularios: si cambia, la lista de formularios también. */
  const invalidarDependientes = async (cambioMio: boolean) => {
    await queryClient.invalidateQueries({ queryKey: clavesEquipos.lista, exact: true });
    if (cambioMio) await queryClient.invalidateQueries({ queryKey: clavesFormularios.lista });
  };

  const cambiarRol = useMutation({
    mutationFn: ({ miembro, rol }: { miembro: Miembro; rol: RolEquipo }) => apiEquipos.cambiarRol(id, miembro.usuarioId, rol),
    onSuccess: async (nuevo, { miembro, rol }) => {
      // La API devolvió el equipo actualizado: se guarda en caché sin otro GET.
      queryClient.setQueryData(clave, nuevo);
      anunciar(`Rol de ${miembro.nombre} cambiado a ${TEXTO_ROL[rol]}.`);
      await invalidarDependientes(miembro.usuarioId === yo);
    },
    onError: fallar,
    onSettled: () => setConfirmacion(null),
  });

  const quitar = useMutation({
    mutationFn: (miembro: Miembro) => apiEquipos.quitarMiembro(id, miembro.usuarioId),
    onSuccess: async (_, miembro) => {
      if (miembro.usuarioId === yo) {
        // Ya no soy miembro: el detalle dejaría de existir para mí.
        queryClient.removeQueries({ queryKey: clave, exact: true });
        await invalidarDependientes(true);
        navegar('/equipos', { state: { aviso: `Saliste del equipo «${equipo.nombre}».` } });
        return;
      }
      // DELETE responde 204 sin cuerpo: se actualiza la caché a mano.
      queryClient.setQueryData<Equipo>(clave, (actual) =>
        actual && { ...actual, miembros: actual.miembros.filter((m) => m.usuarioId !== miembro.usuarioId) },
      );
      anunciar(`${miembro.nombre} ya no es miembro del equipo.`);
      setConfirmacion(null);
      // Su fila desapareció (y con ella el botón que tenía el foco): el foco va al título de la lista.
      tituloMiembros.current?.focus();
      await invalidarDependientes(false);
    },
    onError: (error) => {
      fallar(error);
      setConfirmacion(null);
    },
  });

  const ocupado = cambiarRol.isPending || quitar.isPending;
  // La misma regla que aplica la API: un equipo nunca se queda sin propietario.
  const soyUltimoPropietario = yo !== undefined && validarCambioDeMiembro(equipo.miembros, yo, null)?.motivo === 'ultimo_propietario';

  const alCambiarRol = (miembro: Miembro, rol: RolEquipo) => {
    if (miembro.usuarioId === yo && miembro.rol === 'propietario' && rol !== 'propietario') {
      setConfirmacion({ tipo: 'bajarse', miembro, rol }); // no podría deshacerlo yo mismo
    } else {
      cambiarRol.mutate({ miembro, rol });
    }
  };

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Link to="/equipos" className="text-sm text-indigo-600 hover:underline">
          ← Equipos
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold">{equipo.nombre}</h1>
          <p className="text-sm text-slate-600">Tu rol: {TEXTO_ROL[equipo.rol]}</p>
        </div>
      </div>

      {/* Siempre presente (aunque vacío) para que los lectores de pantalla anuncien cada cambio. */}
      <p role="status" className={aviso ? 'rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800' : 'sr-only'}>
        {aviso}
      </p>
      {errorAccion && <Alerta>{errorAccion}</Alerta>}

      {gestiona && (
        <FormularioAgregarMiembro
          equipoId={id}
          alAgregar={(nuevo, agregado) => {
            queryClient.setQueryData(clave, nuevo);
            anunciar(agregado ? `${agregado.nombre} agregado como ${TEXTO_ROL[agregado.rol]}.` : 'Miembro agregado.');
            void invalidarDependientes(false);
          }}
        />
      )}

      <div className="space-y-3">
        <h2 ref={tituloMiembros} tabIndex={-1} className="font-semibold text-slate-900 focus:outline-none">
          Miembros ({equipo.miembros.length})
        </h2>
        <ul className="divide-y divide-slate-200 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          {equipo.miembros.map((miembro) => {
            const esYo = miembro.usuarioId === yo;
            const guardandoEste = cambiarRol.isPending && cambiarRol.variables.miembro.usuarioId === miembro.usuarioId;
            return (
              <FilaMiembro
                key={miembro.usuarioId}
                miembro={miembro}
                esYo={esYo}
                gestiona={gestiona}
                rolMostrado={guardandoEste ? cambiarRol.variables.rol : miembro.rol}
                ocupado={ocupado}
                idBloqueoUltimoPropietario={esYo && soyUltimoPropietario ? 'ultimo-propietario' : null}
                alCambiarRol={(rol) => alCambiarRol(miembro, rol)}
                alQuitar={() => setConfirmacion({ tipo: esYo ? 'salir' : 'quitar', miembro })}
              />
            );
          })}
        </ul>
        {soyUltimoPropietario && (
          <p id="ultimo-propietario" className="text-sm text-slate-500">
            Eres el único propietario: nombra a otro propietario antes de cambiar tu rol o salir del equipo.
          </p>
        )}
      </div>

      <details className="rounded-xl bg-white p-5 text-sm shadow-sm ring-1 ring-slate-200">
        <summary className="cursor-pointer font-medium text-slate-900">¿Qué puede hacer cada rol?</summary>
        <dl className="mt-3 space-y-2">
          {ROLES_EQUIPO.map((rol) => (
            <div key={rol}>
              <dt className="font-medium text-slate-900">{TEXTO_ROL[rol]}</dt>
              <dd className="text-slate-600">{DESCRIPCION_ROL[rol]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-slate-500">
          Eliminar un formulario y elegir con quién se comparte siguen siendo solo de quien lo creó.
        </p>
      </details>

      <DialogoConfirmacion
        confirmacion={confirmacion}
        nombreEquipo={equipo.nombre}
        pendiente={ocupado}
        alCancelar={() => setConfirmacion(null)}
        alConfirmar={(c) => (c.tipo === 'bajarse' ? cambiarRol.mutate({ miembro: c.miembro, rol: c.rol }) : quitar.mutate(c.miembro))}
      />
    </section>
  );
}

function DialogoConfirmacion({
  confirmacion,
  nombreEquipo,
  pendiente,
  alCancelar,
  alConfirmar,
}: {
  confirmacion: Confirmacion | null;
  nombreEquipo: string;
  pendiente: boolean;
  alCancelar: () => void;
  alConfirmar: (c: Confirmacion) => void;
}) {
  const textos = confirmacion && {
    quitar: {
      titulo: `¿Quitar a ${confirmacion.miembro.nombre}?`,
      cuerpo: `Perderá el acceso a los formularios compartidos con «${nombreEquipo}».`,
      boton: 'Quitar',
    },
    salir: {
      titulo: '¿Salir del equipo?',
      cuerpo: `Perderás el acceso a los formularios compartidos con «${nombreEquipo}». Para volver, un propietario tendrá que agregarte.`,
      boton: 'Salir del equipo',
    },
    bajarse: {
      titulo: '¿Dejar de ser propietario?',
      cuerpo: `Pasarás a ser ${confirmacion.tipo === 'bajarse' ? TEXTO_ROL[confirmacion.rol] : ''} y ya no podrás gestionar los miembros. Solo otro propietario podrá devolverte el rol.`,
      boton: 'Cambiar mi rol',
    },
  }[confirmacion.tipo];

  return (
    <Dialogo abierto={confirmacion !== null} alCerrar={alCancelar} titulo={textos?.titulo ?? ''}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{textos?.cuerpo}</p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={alCancelar} autoFocus>
            Cancelar
          </Boton>
          <Boton variante="peligro" disabled={pendiente} onClick={() => confirmacion && alConfirmar(confirmacion)}>
            {pendiente ? 'Guardando…' : textos?.boton}
          </Boton>
        </div>
      </div>
    </Dialogo>
  );
}
