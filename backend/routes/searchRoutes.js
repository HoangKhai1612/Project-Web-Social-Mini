const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

router.get('/history', searchController.getHistory);
router.post('/history', searchController.addHistory);
router.delete('/history/:id', searchController.deleteHistoryItem);
router.delete('/history', searchController.clearHistory);

module.exports = router;
