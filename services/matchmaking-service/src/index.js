const express = require('express');
const cors = require('cors');
require('dotenv').config();

const matchmakingRoutes = require('./routes/matchmakingRoutes');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

app.use('/', matchmakingRoutes);

app.get('/health', (req, res) => {
  res.json({ service: 'matchmaking-service', status: 'up' });
});

app.listen(PORT, () => {
  console.log(`[matchmaking-service] corriendo en el puerto ${PORT}`);
});