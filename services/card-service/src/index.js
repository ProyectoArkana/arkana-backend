const express = require('express');
const cors = require('cors');
const { loadEnv, requireUser } = require('@arkana/shared');
loadEnv();

const cards = require('./cardController');

const app = express();
const PORT = process.env.CARD_PORT || 3003;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ service: 'card-service', status: 'up' }));

// Rutas estáticas primero; /:id al final
app.get('/', cards.listCatalog);
app.get('/effectiveness', cards.listEffectiveness);
app.get('/gallery', requireUser, cards.getMyGallery);
app.get('/collection', requireUser, cards.getCollection);
app.post('/scan', requireUser, cards.scanCard);
app.get('/:id', cards.getCardById);

app.listen(PORT, () => console.log(`[card-service] corriendo en el puerto ${PORT}`));
