const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Tuyến Thông báo (Base Path: /api/notifications)

/**
 * @route GET /api/notifications
 * @desc Lấy lịch sử thông báo của người dùng
 */
router.get('/', notificationController.getNotifications);

/**
 * @route PUT /api/notifications/mark-read
 * @desc Đánh dấu tất cả thông báo chưa đọc của user là đã đọc
 */
router.put('/mark-read', notificationController.markAllAsRead);

module.exports = router;