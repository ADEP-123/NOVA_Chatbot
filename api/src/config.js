const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  },
};
