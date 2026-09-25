import { useCallback, useEffect, useState } from 'react';

/**
 * Borrador de las respuestas en sessionStorage: sobrevive a una recarga (F5) pero se borra al
 * cerrar la pestaña. En un computador compartido no quedan respuestas (quizás sensibles) guardadas.
 * La clave incluye la versión: un borrador de otra versión no se mezcla con preguntas distintas.
 */
export function useBorrador(clave: string) {
  const [respuestas, setRespuestas] = useState<Record<string, unknown>>(() => leer(clave));

  // La escritura va en un efecto: la función que actualiza el estado debe ser pura
  // (React puede ejecutarla dos veces en modo estricto).
  const [modificado, setModificado] = useState(false);
  useEffect(() => {
    if (modificado) escribir(clave, respuestas);
  }, [clave, respuestas, modificado]);

  const cambiar = useCallback((preguntaId: string, valor: unknown) => {
    setModificado(true);
    setRespuestas((actuales) => ({ ...actuales, [preguntaId]: valor }));
  }, []);

  const borrar = useCallback(() => {
    try {
      sessionStorage.removeItem(clave);
    } catch {
      // sin almacenamiento disponible: no hay nada que borrar
    }
  }, [clave]);

  return { respuestas, cambiar, borrar };
}

export const claveBorrador = (slug: string, version: number) => `formalista:borrador:${slug}:v${version}`;

// sessionStorage puede lanzar (modo privado de algunos navegadores, cuota llena, bloqueado por el
// usuario). Si falla, el borrador simplemente no se guarda: el formulario funciona igual.
function leer(clave: string): Record<string, unknown> {
  try {
    const guardado = sessionStorage.getItem(clave);
    const datos: unknown = guardado ? JSON.parse(guardado) : null;
    return datos && typeof datos === 'object' && !Array.isArray(datos) ? (datos as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function escribir(clave: string, respuestas: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(clave, JSON.stringify(respuestas));
  } catch {
    // sin almacenamiento: se sigue sin borrador
  }
}
