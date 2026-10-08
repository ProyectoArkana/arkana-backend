const express = require('express');
const cors = require('cors');
require('dotenv').config();

const cardRoutes = require('./routes/cardRoutes');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'cards-service', status: 'up' });
});

app.use('/', cardRoutes);

app.listen(PORT, () => {
  console.log(`[cards-service] corriendo en el puerto ${PORT}`);
});
