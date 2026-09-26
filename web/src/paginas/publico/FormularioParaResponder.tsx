import { validarRespuestas, type Pregunta } from '@formalista/compartido';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ErrorApi } from '../../api/cliente';
import { apiPublico, type FormularioParaResponder as Formulario } from '../../api/publico';
import { CampoPregunta } from '../../componentes/CampoPregunta';
import { Alerta, Boton } from '../../componentes/ui';
import { claveBorrador, useBorrador } from './borrador';
import { Aviso } from './marco';

type Errores = Record<string, string>;

const idPregunta = (preguntaId: string) => `pregunta-${preguntaId}`;

/**
 * Responder un formulario. Antes de enviar se valida con validarRespuestas (la misma función del
 * dominio que usa la API): si hay errores, no se llama al servidor.
 * Errores al estilo GOV.UK: un resumen arriba (recibe el foco y enlaza a cada pregunta) y,
 * además, el mensaje bajo cada pregunta.
 */
export function FormularioParaResponder({ formulario }: { formulario: Formulario }) {
  const { slug, version, preguntas } = formulario;
  const { respuestas, cambiar, borrar } = useBorrador(claveBorrador(slug, version));
  const [errores, setErrores] = useState<Errores>({});
  const [estadoFinal, setEstadoFinal] = useState<'enviado' | 'cerrado' | null>(null);
  const resumen = useRef<HTMLDivElement>(null);
  // Cuenta los intentos fallidos: cada uno debe llevar el foco al resumen, aunque los errores se repitan.
  const [intentosConErrores, setIntentosConErrores] = useState(0);

  const enviar = useMutation({
    mutationFn: () => apiPublico.responder(slug, { respuestas, version }),
    onSuccess: () => {
      borrar();
      setEstadoFinal('enviado');
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.status === 410) return setEstadoFinal('cerrado');
      // El servidor valida igual (nunca confía en el cliente): sus errores van a cada pregunta.
      if (esErrorDePreguntas(error)) {
        mostrarErrores(
          Object.fromEntries(
            error.detalles.filter((d) => d.campo.startsWith('respuestas.')).map((d) => [d.campo.slice('respuestas.'.length), d.mensaje]),
          ),
        );
      }
    },
  });

  const mostrarErrores = (nuevos: Errores) => {
    setErrores(nuevos);
    setIntentosConErrores((n) => n + 1);
  };

  // El foco va al resumen para que el lector de pantalla lo anuncie completo. useLayoutEffect corre en
  // el mismo render que lo muestra, antes de cualquier otro clic. (Con requestAnimationFrame el foco
  // llegaba un cuadro después y podía quitárselo a la pregunta si alguien ya había usado un enlace.)
  useLayoutEffect(() => {
    if (intentosConErrores > 0) resumen.current?.focus();
  }, [intentosConErrores]);

  const alEnviar = (evento: React.FormEvent) => {
    evento.preventDefault();
    const resultado = validarRespuestas(preguntas, respuestas);
    if (!resultado.valida) {
      return mostrarErrores(Object.fromEntries(resultado.errores.map((e) => [e.preguntaId, e.mensaje])));
    }
    setErrores({});
    enviar.mutate();
  };

  if (estadoFinal === 'enviado') return <Gracias titulo={formulario.titulo} />;
  if (estadoFinal === 'cerrado') return <Aviso titulo="Formulario cerrado">Este formulario se cerró mientras respondías: ya no acepta respuestas.</Aviso>;

  const conError = preguntas.filter((p) => errores[p.id]);

  return (
    <form onSubmit={alEnviar} noValidate className="space-y-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{formulario.titulo}</h1>
        {formulario.descripcion && <p className="mt-2 text-slate-600">{formulario.descripcion}</p>}
        {preguntas.some((p) => p.obligatoria) && (
          <p className="mt-3 text-xs text-slate-500">
            <span className="text-red-600">*</span> Obligatoria
          </p>
        )}
      </header>

      {conError.length > 0 && <ResumenErrores ref={resumen} preguntas={conError} errores={errores} />}

      {preguntas.map((pregunta) => (
        <div key={pregunta.id} id={idPregunta(pregunta.id)}>
          <CampoPregunta
            pregunta={pregunta}
            valor={respuestas[pregunta.id]}
            alCambiar={(valor) => cambiar(pregunta.id, valor)}
            error={errores[pregunta.id]}
          />
        </div>
      ))}

      {/* Todo error que no quedó bajo una pregunta (429, versión inexistente, sin conexión…) se muestra aquí. */}
      {enviar.isError && !esErrorDePreguntas(enviar.error) && <Alerta>{mensajeDeEnvio(enviar.error)}</Alerta>}

      <div className="flex justify-end">
        {/* Desactivado mientras envía: un doble clic no crea dos respuestas. */}
        <Boton type="submit" disabled={enviar.isPending}>
          {enviar.isPending ? 'Enviando…' : 'Enviar respuesta'}
        </Boton>
      </div>
    </form>
  );
}

function ResumenErrores({ ref, preguntas, errores }: { ref: React.Ref<HTMLDivElement>; preguntas: Pregunta[]; errores: Errores }) {
  // Clic en un enlace: además de desplazarse, el foco entra al primer campo de esa pregunta.
  const irA = (evento: React.MouseEvent, preguntaId: string) => {
    evento.preventDefault();
    const contenedor = document.getElementById(idPregunta(preguntaId));
    contenedor?.scrollIntoView({ block: 'center' });
    contenedor?.querySelector<HTMLElement>('input, textarea, select')?.focus();
  };

  return (
    <div ref={ref} tabIndex={-1} aria-labelledby="resumen-errores-titulo" className="rounded-md border-2 border-red-600 p-4 focus:outline-3 focus:outline-red-300">
      <h2 id="resumen-errores-titulo" className="font-semibold text-red-800">
        {preguntas.length === 1 ? 'Hay 1 respuesta por corregir' : `Hay ${preguntas.length} respuestas por corregir`}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {preguntas.map((p) => (
          <li key={p.id}>
            <a href={`#${idPregunta(p.id)}`} onClick={(e) => irA(e, p.id)} className="text-red-700 underline hover:text-red-900">
              {p.texto} — {errores[p.id]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Gracias({ titulo }: { titulo: string }) {
  const encabezado = useRef<HTMLHeadingElement>(null);
  // El foco va al mensaje: quien usa lector de pantalla se entera de que se envió.
  useEffect(() => encabezado.current?.focus(), []);
  return (
    <div className="rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
      <h1 ref={encabezado} tabIndex={-1} className="text-2xl font-semibold text-slate-900 focus:outline-none">
        ¡Gracias!
      </h1>
      <p className="mt-2 text-slate-600">Tu respuesta a «{titulo}» fue registrada.</p>
    </div>
  );
}

/** Error del servidor con detalles de preguntas (respuestas.<id>): se muestran bajo cada una. */
function esErrorDePreguntas(error: Error): error is ErrorApi {
  return error instanceof ErrorApi && error.detalles.some((d) => d.campo.startsWith('respuestas.'));
}

function mensajeDeEnvio(error: Error): string {
  if (error instanceof ErrorApi && error.status === 429) {
    return 'Se enviaron demasiadas respuestas desde tu red. Espera unos minutos y vuelve a intentarlo: tus respuestas siguen aquí.';
  }
  return error.message;
}
