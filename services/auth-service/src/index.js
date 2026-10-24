const express = require('express');
const cors = require('cors');
const { loadEnv } = require('@arkana/shared');
loadEnv();

const { register, login } = require('./authController');

const app = express();
const PORT = process.env.AUTH_PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ service: 'auth-service', status: 'up' }));

app.post('/register', register);
app.post('/login', login);

app.listen(PORT, () => console.log(`[auth-service] corriendo en el puerto ${PORT}`));
