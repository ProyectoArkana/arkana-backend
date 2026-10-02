const express = require('express');
const cors = require('cors');
require('dotenv').config();

const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Montar las rutas en la raíz
app.use('/', userRoutes);

app.get('/health', (req, res) => {
  res.json({ service: 'user-service', status: 'up' });
});

app.listen(PORT, () => {
  console.log(`[user-service] corriendo en el puerto ${PORT}`);
});