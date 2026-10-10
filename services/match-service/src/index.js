const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const matchRoutes = require('./routes/matchRoutes');
const registerMatchHandlers = require('./sockets/matchHandler');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.get('/health', (req, res) => {
  res.json({ service: 'match-service', status: 'up' });
});

app.use('/', matchRoutes);

io.on('connection', (socket) => {
  console.log(`🟢 Nuevo dispositivo conectado al motor: ${socket.id}`);
  registerMatchHandlers(io, socket);
});

server.listen(PORT, () => {
  console.log(`[match-service] corriendo en el puerto ${PORT} (HTTP + WebSockets)`);
});
