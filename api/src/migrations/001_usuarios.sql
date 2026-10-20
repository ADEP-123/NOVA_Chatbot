CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  -- Texto libre para poder crear nuevos tipos de usuario sin migración (cuotas en .env).
  role VARCHAR(30) NOT NULL DEFAULT 'registered',
  active TINYINT(1) NOT NULL DEFAULT 1,
  email_verified_at DATETIME NULL,
  -- Ley 1581 de 2012: momento en que aceptó la política de tratamiento de datos.
  data_consent_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens de un solo uso para verificar correo y restablecer contraseña. Se guarda solo su hash.
CREATE TABLE user_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
