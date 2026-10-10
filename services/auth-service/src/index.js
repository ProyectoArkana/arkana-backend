const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Montar Rutas en la raíz del microservicio
app.use('/', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'auth-service', status: 'up' });
});

app.listen(PORT, () => {
  console.log(`[auth-service] corriendo en el puerto ${PORT}`);
});