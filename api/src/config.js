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
};
