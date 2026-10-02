const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const registerMatchHandlers = require('./sockets/matchHandler');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

// 1. Crear el Servidor HTTP y montar Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// 2. Endpoints HTTP de control
app.get('/health', (req, res) => {
  res.json({ service: 'match-service', status: 'up' });
});

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