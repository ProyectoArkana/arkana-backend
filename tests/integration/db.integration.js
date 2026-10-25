const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

let client;

before(async () => {
  client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
});

after(async () => { await client.end(); });

test('la base de datos responde', async () => {
  const { rows } = await client.query('SELECT 1 AS ok');
  assert.equal(rows[0].ok, 1);
});

test('init-db.sql crea al menos las seis tablas del modelo', async () => {
  const { rows } = await client.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
  );
  assert.ok(rows[0].n >= 6, `se esperaban 6 o mas tablas y hay ${rows[0].n}`);
});
