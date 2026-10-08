const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  getProfileById,
  updateMyProfile,
  updateStats
} = require('../controllers/profileController');

router.get('/me', getMyProfile);
router.put('/me', updateMyProfile);
router.get('/:userId', getProfileById);
router.patch('/:userId/stats', updateStats);

module.exports = router;
