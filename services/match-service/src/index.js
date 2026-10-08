const express = require('express');
const cors = require('cors');
require('dotenv').config();

const matchRoutes = require('./routes/matchRoutes');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'match-service', status: 'up' });
});

app.use('/', matchRoutes);

app.listen(PORT, () => {
  console.log(`[match-service] corriendo en el puerto ${PORT}`);
});
