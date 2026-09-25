# FormaLista

[![CI](https://github.com/lopezgalarce1997-debug/FormaLista/actions/workflows/ci.yml/badge.svg)](https://github.com/lopezgalarce1997-debug/FormaLista/actions/workflows/ci.yml)

Creador de formularios y encuestas: los usuarios crean formularios, los publican con un link público y ven los resultados con gráficos.

**Stack:** Node.js · Express · TypeScript · MySQL · MongoDB · React · Vite

> 🚧 En construcción. Este README se completará al final del proyecto con instrucciones de ejecución local, arquitectura y decisiones de diseño.

## Estructura

```
/api    → backend (Node.js + Express + TypeScript)
/web    → frontend (React + Vite + TypeScript)
```

## Limitaciones conocidas

- **Límite de envíos en memoria.** Los contadores de `express-rate-limit` (login, registro, lectura pública y envío de respuestas) viven en la memoria del proceso. Con una sola instancia es suficiente, pero con varias instancias detrás de un balanceador cada una contaría por separado, y reiniciar la API los pone en cero. En ese escenario se usaría un store compartido como **Redis** (`rate-limit-redis`), sin cambiar el resto del código.
- **Varias personas pueden compartir una IP.** Los límites se cuentan por IP, y quienes responden desde una misma red (una oficina, una sala de clases, una red universitaria o móvil con NAT) salen a internet con la misma IP y comparten el contador. Por eso el límite de respuestas públicas es holgado (**60 cada 15 minutos**) y se puede ajustar con `LIMITE_RESPUESTAS_MAXIMO` y `LIMITE_RESPUESTAS_VENTANA_MINUTOS` en `api/.env`. Una alternativa más precisa sería combinar la IP con un identificador del navegador o exigir un CAPTCHA. El límite del login (10 intentos fallidos cada 15 minutos) se mantiene estricto porque protege contra fuerza bruta.
- **Proxy inverso.** Si la API se publicara detrás de un proxy, habría que configurar `app.set('trust proxy', ...)` para que Express lea la IP real del cliente y no la del proxy.
