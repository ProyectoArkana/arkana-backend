const path = require('path');
const dotenv = require('dotenv');

let loaded = false;

// Carga el .env de la raíz del monorepo (sin importar desde qué carpeta arranque el servicio).
function loadEnv() {
  if (loaded) return;
  dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
  loaded = true;
}

module.exports = { loadEnv };
