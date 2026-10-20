-- Fuentes del conocimiento de NOVA: normas de la matriz, preguntas de referencia y archivos subidos por el admin.
CREATE TABLE sources (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NULL UNIQUE,            -- N01..., QA-..., NULL para archivos subidos
  kind VARCHAR(20) NOT NULL,               -- norma | preguntas | archivo
  title VARCHAR(400) NOT NULL,
  category VARCHAR(100) NOT NULL,
  status_legal VARCHAR(200) NULL,          -- vigente, no vigente, histórica...
  url VARCHAR(1000) NULL,                  -- enlace que se muestra al citar
  meta JSON NULL,                          -- datos completos de la matriz o las preguntas
  ingest_urls JSON NULL,                   -- de dónde se descarga el texto completo
  file_path VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | indexing | indexed | partial | error
  error TEXT NULL,
  chunk_count INT NOT NULL DEFAULT 0,
  embed_model VARCHAR(200) NULL,
  indexed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fragmentos de texto con su vector (Float32 en binario).
CREATE TABLE chunks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_id INT UNSIGNED NOT NULL,
  ord INT NOT NULL,
  content MEDIUMTEXT NOT NULL,
  embedding MEDIUMBLOB NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
