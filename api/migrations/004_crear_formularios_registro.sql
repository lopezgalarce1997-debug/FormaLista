-- Metadatos y permisos de cada formulario. El contenido (preguntas) vive en MongoDB;
-- id_mongo es el ObjectId del documento: 24 caracteres hexadecimales.
CREATE TABLE formularios_registro (
  id_mongo       CHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  propietario_id INT UNSIGNED NOT NULL,
  equipo_id      INT UNSIGNED NULL,
  estado         ENUM('borrador', 'publicado', 'cerrado') NOT NULL DEFAULT 'borrador',
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_mongo),
  KEY ix_formularios_registro_propietario (propietario_id),
  KEY ix_formularios_registro_equipo (equipo_id),
  -- RESTRICT: no se puede borrar un usuario que aún es dueño de formularios.
  CONSTRAINT fk_formularios_registro_propietario
    FOREIGN KEY (propietario_id) REFERENCES usuarios (id) ON DELETE RESTRICT,
  -- SET NULL: si se borra el equipo, el formulario sigue existiendo y vuelve a ser solo del propietario.
  CONSTRAINT fk_formularios_registro_equipo
    FOREIGN KEY (equipo_id) REFERENCES equipos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
