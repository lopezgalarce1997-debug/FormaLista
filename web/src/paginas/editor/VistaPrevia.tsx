import { validarRespuestas, type Pregunta } from '@formalista/compartido';
import { useState } from 'react';
import { CampoPregunta } from '../../componentes/CampoPregunta';
import { Alerta, Boton } from '../../componentes/ui';

/**
 * El formulario como lo verá quien responde. No envía nada: "Probar validación" ejecuta la MISMA
 * función del dominio que valida los envíos en la API (validarRespuestas), sin llamar al servidor.
 */
export function VistaPrevia({ titulo, descripcion, preguntas }: { titulo: string; descripcion: string; preguntas: Pregunta[] }) {
  const [respuestas, setRespuestas] = useState<Record<string, unknown>>({});
  const [resultado, setResultado] = useState<{ errores: Record<string, string>; valida: boolean } | null>(null);

  const probar = () => {
    const r = validarRespuestas(preguntas, respuestas);
    setResultado(
      r.valida
        ? { valida: true, errores: {} }
        : { valida: false, errores: Object.fromEntries(r.errores.map((e) => [e.preguntaId, e.mensaje])) },
    );
  };

  const limpiar = () => {
    setRespuestas({});
    setResultado(null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Alerta tipo="info">Vista previa: así lo verá quien responda. Nada de lo que escribas aquí se guarda ni se envía.</Alerta>
      <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{titulo || 'Sin título'}</h2>
          {descripcion && <p className="mt-1 text-sm text-slate-600">{descripcion}</p>}
          {preguntas.some((p) => p.obligatoria) && (
            <p className="mt-2 text-xs text-slate-500">
              <span className="text-red-600">*</span> Obligatoria
            </p>
          )}
        </div>

        {preguntas.length === 0 && <p className="text-sm text-slate-500">Este formulario aún no tiene preguntas.</p>}
        {preguntas.map((pregunta) => (
          <CampoPregunta
            key={pregunta.id}
            pregunta={pregunta}
            valor={respuestas[pregunta.id]}
            alCambiar={(valor) => setRespuestas((actuales) => ({ ...actuales, [pregunta.id]: valor }))}
            error={resultado?.errores[pregunta.id]}
          />
        ))}

        {resultado?.valida && <Alerta tipo="info">Las respuestas son válidas: así se enviarían.</Alerta>}
        {resultado && !resultado.valida && <Alerta>Hay respuestas por corregir (marcadas arriba).</Alerta>}

        <div className="flex gap-2">
          <Boton onClick={probar} disabled={preguntas.length === 0}>
            Probar validación
          </Boton>
          <Boton variante="secundario" onClick={limpiar}>
            Limpiar
          </Boton>
        </div>
      </div>
    </div>
  );
}
