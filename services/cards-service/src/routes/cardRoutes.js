const express = require('express');
const router = express.Router();
const {
  listCards,
  getCardById,
  createCard,
  listEffectiveness,
  upsertEffectiveness,
  listMyPhysicalCards,
  getPhysicalCard,
  registerPhysicalCard,
  claimPhysicalCard,
  listMyDecks,
  getDeckById,
  createDeck,
  updateDeck,
  deleteDeck,
  addCardToDeck,
  removeCardFromDeck
} = require('../controllers/cardController');

// Catálogo
router.get('/', listCards);
router.post('/', createCard);
router.get('/effectiveness', listEffectiveness);
router.post('/effectiveness', upsertEffectiveness);

// Cartas físicas NFC
router.get('/physical', listMyPhysicalCards);
router.post('/physical', registerPhysicalCard);
router.post('/physical/claim', claimPhysicalCard);
router.get('/physical/:id', getPhysicalCard);

// Mazos
router.get('/decks', listMyDecks);
router.post('/decks', createDeck);
router.get('/decks/:id', getDeckById);
router.put('/decks/:id', updateDeck);
router.delete('/decks/:id', deleteDeck);
router.post('/decks/:id/cards', addCardToDeck);
router.delete('/decks/:id/cards/:physicalCardId', removeCardFromDeck);

// Carta por id (después de rutas estáticas)
router.get('/:id', getCardById);

module.exports = router;
