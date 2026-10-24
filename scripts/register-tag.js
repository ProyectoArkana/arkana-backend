#!/usr/bin/env node
// Herramienta de "fabricación" de cartas: vincula el UID de un chip NFC con una carta del catálogo.
//
//   npm run tag:register -- list                       -> muestra el catálogo con sus ids
//   npm run tag:register -- 04A1B2C3D4E5F6 3           -> chip -> carta con id 3
//   npm run tag:register -- 04A1B2C3D4E5F6 "Oso Continental"   -> también por nombre
//
// El UID es el que muestra la app al escanear (o el que lea cualquier app de NFC).
const { getPool, normalizeNfcId } = require('@arkana/shared');

async function main() {
  const pool = getPool();
  const [first, second] = process.argv.slice(2);

  try {
    if (!first || first === 'list') {
      const { rows } = await pool.query(
        `SELECT c.id, c.name, c.element,
                (SELECT count(*) FROM nfc_tags t WHERE t.card_id = c.id)::int AS chips
         FROM cards c ORDER BY c.id`,
      );
      console.table(rows);
      console.log('\nUso: npm run tag:register -- <nfc_id> <id o nombre de la carta>');
      return;
    }

    const nfcId = normalizeNfcId(first);
    if (!nfcId || !second) {
      console.error('Uso: npm run tag:register -- <nfc_id> <id o nombre de la carta>');
      process.exitCode = 1;
      return;
    }

    const byId = /^\d+$/.test(second);
    const { rows } = await pool.query(
      byId ? 'SELECT id, name FROM cards WHERE id = $1' : 'SELECT id, name FROM cards WHERE lower(name) = lower($1)',
      [byId ? Number(second) : second],
    );
    if (rows.length === 0) {
      console.error(`No existe la carta "${second}". Usa "list" para ver el catálogo.`);
      process.exitCode = 1;
      return;
    }

    await pool.query(
      `INSERT INTO nfc_tags (nfc_id, card_id) VALUES ($1, $2)
       ON CONFLICT (nfc_id) DO UPDATE SET card_id = EXCLUDED.card_id`,
      [nfcId, rows[0].id],
    );
    console.log(`✅ Chip ${nfcId} -> #${rows[0].id} ${rows[0].name}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
