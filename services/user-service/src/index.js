const express = require('express');
const cors = require('cors');
const { loadEnv, requireUser } = require('@arkana/shared');
loadEnv();

const { getMe, getMyHistory } = require('./userController');

const app = express();
const PORT = process.env.USER_PORT || 3002;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ service: 'user-service', status: 'up' }));

// Las estadísticas (victorias/derrotas) NO se modifican por HTTP: las actualiza
// match-service al terminar una partida, dentro de la misma transacción que el historial.
app.get('/me', requireUser, getMe);
app.get('/me/history', requireUser, getMyHistory);

app.listen(PORT, () => console.log(`[user-service] corriendo en el puerto ${PORT}`));
