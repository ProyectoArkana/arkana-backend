const express = require('express');
<<<<<<< HEAD
const cors = require('cors');
require('dotenv').config();

const matchRoutes = require('./routes/matchRoutes');

const app = express();
const PORT = process.env.PORT || 3004;
=======
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const registerMatchHandlers = require('./sockets/matchHandler');

const app = express();
const PORT = process.env.PORT || 3006;
>>>>>>> origin/develop

app.use(cors());
app.use(express.json());

<<<<<<< HEAD
=======
// 1. Crear el Servidor HTTP y montar Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// 2. Endpoints HTTP de control
>>>>>>> origin/develop
app.get('/health', (req, res) => {
  res.json({ service: 'match-service', status: 'up' });
});

<<<<<<< HEAD
app.use('/', matchRoutes);

app.listen(PORT, () => {
  console.log(`[match-service] corriendo en el puerto ${PORT}`);
});
=======
// 3. Iniciar la escucha de WebSockets
io.on('connection', (socket) => {
  console.log(`🟢 Nuevo dispositivo conectado al motor: ${socket.id}`);
  
  // Delegar todos los eventos de la partida al archivo manejador
  registerMatchHandlers(io, socket);
});

// 4. Levantar servidor
server.listen(PORT, () => {
  console.log(`[match-service] corriendo en el puerto ${PORT} (HTTP + WebSockets)`);
});
>>>>>>> origin/develop
