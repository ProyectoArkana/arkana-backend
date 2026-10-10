const express = require('express');
const cors = require('cors');
require('dotenv').config();

const profileRoutes = require('./routes/profileRoutes');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ service: 'user-service', status: 'up' });
});

app.use('/', profileRoutes);

app.listen(PORT, () => {
  console.log(`[user-service] corriendo en el puerto ${PORT}`);
});
