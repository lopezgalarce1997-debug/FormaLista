CREATE TABLE equipo_miembros (
  equipo_id  INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  rol        ENUM('propietario', 'editor', 'lector') NOT NULL,
  -- Clave compuesta: un usuario tiene un solo rol por equipo.
  -- Sirve además para buscar los miembros de un equipo.
  PRIMARY KEY (equipo_id, usuario_id),
  -- Para buscar los equipos de un usuario (la PK empieza por equipo_id y no ayuda aquí).
  KEY ix_equipo_miembros_usuario (usuario_id),
  CONSTRAINT fk_equipo_miembros_equipo
    FOREIGN KEY (equipo_id) REFERENCES equipos (id) ON DELETE CASCADE,
  CONSTRAINT fk_equipo_miembros_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
