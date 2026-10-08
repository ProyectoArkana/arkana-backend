const express = require('express');
const router = express.Router();
const { getCatalog, claimNfcCard, getUserInventory } = require('../controllers/cardController');

router.get('/catalog', getCatalog);
router.post('/nfc/claim', claimNfcCard);
router.get('/inventory', getUserInventory);

module.exports = router;