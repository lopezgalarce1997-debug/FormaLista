# FormaLista

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
- **Límite por IP.** Varias personas detrás de la misma IP (una oficina, una red universitaria) comparten el mismo contador. Si la API se publicara detrás de un proxy inverso, habría que configurar `app.set('trust proxy', ...)` para que Express lea la IP real del cliente.
