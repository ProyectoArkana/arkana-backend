#!/usr/bin/env node
// Asigna un rol a un usuario desde la terminal (así se crea el PRIMER administrador).
//
//   npm run role:set -- list                         -> lista usuarios con su rol
//   npm run role:set -- prueba@test.com ADMIN        -> por correo
//   npm run role:set -- prueba PLAYER                -> o por username
const { getPool } = require('@arkana/shared');

const ROLES = ['PLAYER', 'ADMIN'];

async function main() {
  const pool = getPool();
  const [first, second] = process.argv.slice(2);

  try {
    if (!first || first === 'list') {
      const { rows } = await pool.query('SELECT username, email, role FROM users ORDER BY created_at');
      console.table(rows);
      console.log('\nUso: npm run role:set -- <correo o username> <PLAYER|ADMIN>');
      return;
    }

    const role = String(second ?? '').toUpperCase();
    if (!ROLES.includes(role)) {
      console.error(`Rol inválido. Usa uno de: ${ROLES.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    const { rows } = await pool.query(
      `UPDATE users SET role = $2
       WHERE lower(email) = lower($1) OR lower(username) = lower($1)
       RETURNING username, email, role`,
      [first, role],
    );
    if (rows.length === 0) {
      console.error(`No existe un usuario con correo o username "${first}".`);
      process.exitCode = 1;
      return;
    }
    console.log(`✅ ${rows[0].username} (${rows[0].email}) -> ${rows[0].role}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
