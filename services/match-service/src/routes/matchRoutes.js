const express = require('express');
const router = express.Router();
const {
  createMatch,
  listMyMatches,
  getMatchById,
  joinMatch,
  updateMatch,
  scanCard,
  listScannedCards,
  addEvent,
  listEvents
} = require('../controllers/matchController');

router.post('/', createMatch);
router.get('/', listMyMatches);
router.get('/:id', getMatchById);
router.post('/:id/join', joinMatch);
router.patch('/:id', updateMatch);

router.post('/:id/scans', scanCard);
router.get('/:id/scans', listScannedCards);

router.post('/:id/events', addEvent);
router.get('/:id/events', listEvents);

module.exports = router;
