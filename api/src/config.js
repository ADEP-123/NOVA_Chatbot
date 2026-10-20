const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  appUrl: (env.APP_URL || 'http://localhost:8080').replace(/\/$/, ''),
  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  },
  session: {
    secret: env.SESSION_SECRET,
    // true solo cuando NOVA se sirve por HTTPS.
    secureCookie: env.COOKIE_SECURE === 'true',
    maxAgeHours: Number(env.SESSION_MAX_AGE_HOURS || 24 * 7),
  },
  smtp: {
    host: env.SMTP_HOST, // vacío = no se envían correos, los enlaces se imprimen en el log
    port: Number(env.SMTP_PORT || 1025),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.MAIL_FROM || 'NOVA <no-reply@nova.local>',
  },
  admin: {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  },
  // Modelo que redacta las respuestas.
  llm: {
    provider: env.LLM_PROVIDER || 'openai',
    baseUrl: (env.LLM_BASE_URL || 'http://ollama:11434/v1').replace(/\/$/, ''),
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL || 'qwen2.5:3b',
    temperature: Number(env.LLM_TEMPERATURE ?? 0.2),
    maxTokens: Number(env.LLM_MAX_TOKENS || 1024),
  },
  // Modelo que convierte texto en vectores para buscar en el corpus.
  // Va aparte para poder usar un chat de pago con embeddings locales.
  // Si cambias el modelo de embeddings hay que reindexar el corpus.
  embed: {
    provider: env.EMBED_PROVIDER || env.LLM_PROVIDER || 'openai',
    baseUrl: (env.EMBED_BASE_URL || 'http://ollama:11434/v1').replace(/\/$/, ''),
    apiKey: env.EMBED_API_KEY,
    model: env.EMBED_MODEL || 'bge-m3',
  },
};
