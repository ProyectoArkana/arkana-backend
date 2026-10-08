const express = require('express');
const cors = require('cors');
require('dotenv').config();

<<<<<<< HEAD
const profileRoutes = require('./routes/profileRoutes');
=======
const userRoutes = require('./routes/userRoutes');
>>>>>>> origin/develop

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

<<<<<<< HEAD
=======
// Montar las rutas en la raíz
app.use('/', userRoutes);

>>>>>>> origin/develop
app.get('/health', (req, res) => {
  res.json({ service: 'user-service', status: 'up' });
});

<<<<<<< HEAD
app.use('/', profileRoutes);

app.listen(PORT, () => {
  console.log(`[user-service] corriendo en el puerto ${PORT}`);
});
=======
app.listen(PORT, () => {
  console.log(`[user-service] corriendo en el puerto ${PORT}`);
});
>>>>>>> origin/develop
