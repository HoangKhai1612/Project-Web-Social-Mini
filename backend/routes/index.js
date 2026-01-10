const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const postRoutes = require('./postRoutes');
const userRoutes = require('./userRoutes');
const groupRoutes = require('./groupRoutes');
const notificationRoutes = require('./notificationRoutes');
const chatRoutes = require('./chatRoutes');
const searchRoutes = require('./searchRoutes');

const authMiddleware = require('../middleware/authMiddleware');

// Gắn các tuyến con vào /api/TEN_TUYEN
router.use('/auth', authRoutes);
router.use('/users', authMiddleware, userRoutes);
router.use('/posts', authMiddleware, postRoutes);
router.use('/groups', authMiddleware, groupRoutes);
router.use('/notifications', authMiddleware, notificationRoutes);
router.use('/chat', authMiddleware, chatRoutes);
router.use('/search', authMiddleware, searchRoutes);

router.get('/', (req, res) => {
    res.json({
        status: 'OK',
        version: '1.0',
        message: 'Mini Social Network API is running correctly!'
    });
});

module.exports = router;