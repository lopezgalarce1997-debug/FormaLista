// Agrega a Request el id del usuario autenticado (lo asigna el middleware autenticar).
declare global {
  namespace Express {
    interface Request {
      usuarioId?: number;
    }
  }
}

export {};
