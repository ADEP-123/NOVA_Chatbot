-- Tokens consumidos por usuario (o sesión anónima) en cada periodo (día o mes).
CREATE TABLE token_usage (
  subject VARCHAR(100) NOT NULL,          -- user:<id> | anon:<id de sesión>
  period CHAR(10) NOT NULL,               -- 2026-10-20 (diario) o 2026-10 (mensual)
  role VARCHAR(30) NOT NULL,
  tokens INT UNSIGNED NOT NULL DEFAULT 0,
  requests INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (subject, period),
  INDEX idx_period (period)
) ENGINE=InnoDB;
