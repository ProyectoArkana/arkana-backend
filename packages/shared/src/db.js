const { Pool } = require('pg');
const { loadEnv } = require('./env');

let pool;

// Un solo pool por proceso.
function getPool() {
  if (pool) return pool;
  loadEnv();

  pool = new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT || 5432),
          user: process.env.DB_USER || 'arkana_admin',
          password: process.env.DB_PASSWORD || 'secretpassword',
          database: process.env.DB_NAME || 'arkana_db',
        },
  );

  pool.on('error', (err) => console.error('[db] error inesperado en el pool:', err.message));
  return pool;
}

module.exports = { getPool };
