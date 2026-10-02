const express = require('express');
const router = express.Router();
const { joinQueue, leaveQueue } = require('../controllers/matchmakingController');

router.post('/join', joinQueue);
router.post('/leave', leaveQueue);

module.exports = router;