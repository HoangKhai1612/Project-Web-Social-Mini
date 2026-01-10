// backend/controllers/notificationController.js

const db = require('../config/database');
const { createNotification } = require('../utils/helpers');
// SỬA LỖI: Cần require cả areFriends và getFriendsIds
const { areFriends, getFriendsIds } = require('../utils/notificationLogic');
const getIo = (req) => req.app.get('io');


// ============================================
// PUBLIC API CONTROLLERS
// ============================================

/**
 * @route GET /api/notifications
 * @desc Lấy lịch sử thông báo của người dùng
 */
exports.getNotifications = (req, res) => {
    const receiver_id = req.query.user_id;

    if (!receiver_id) {
        return res.status(400).json({ success: false, message: "Missing receiver ID." });
    }

    const sql = `
        SELECT n.*, u.full_name AS sender_name, u.avatar AS sender_avatar, u.gender AS sender_gender
        FROM notifications n
        LEFT JOIN users u ON n.sender_id = u.id
        WHERE n.receiver_id = ?
        ORDER BY n.created_at DESC
        LIMIT 30
    `;
    db.query(sql, [receiver_id], (err, results) => {
        if (err) {
            console.error('Lỗi DB khi tải thông báo:', err);
            return res.status(500).json(err);
        }
        res.json(results);
    });
};

/**
 * @route PUT /api/notifications/mark-read
 * @desc Đánh dấu tất cả thông báo chưa đọc của user là đã đọc
 */
exports.markAllAsRead = (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ success: false, message: "Missing user ID." });
    }

    const sql = 'UPDATE notifications SET is_read = TRUE WHERE receiver_id = ? AND is_read = FALSE';

    db.query(sql, [user_id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Lỗi DB khi cập nhật.' });
        res.json({ success: true, updated: result.affectedRows, message: 'Đánh dấu đã đọc thành công.' });
    });
};

// ============================================
// INTERNAL HANDLER (Được gọi từ các Controllers khác)
// ============================================

/**
 * @desc Xử lý gửi thông báo sự kiện (Like, Comment, Post mới, Friend Request)
 * @param {Object} req - Request object (chứa io instance)
 * @param {string|number} senderId - Người thực hiện hành động
 * @param {string} type - Loại thông báo
 * @param {string|number|null} contextId - ID của post/group/user liên quan
 * @param {string|number|null} ownerId - ID người sở hữu nội dung (nếu có)
 * @param {string|number|null} targetId - ID người nhận phụ (vd: Friend Request)
 * @param {Object|null} groupInfo - Thông tin nhóm liên quan (id, name)
 */
exports.handleNotification = async (req, senderId, type, contextId = null, ownerId = null, targetId = null, groupInfo = null) => {
    const io = getIo(req);
    let message = '';
    let receiverId = null;

    try {
        switch (type) {

            // --- SỰ KIỆN KẾT BẠN (Gửi/Chấp nhận) ---

            case 'friend_request':
                receiverId = targetId;
                message = 'đã gửi lời mời kết bạn cho bạn.';
                if (receiverId) {
                    createNotification(io, receiverId, senderId, type, message, contextId || senderId);
                }
                break;

            case 'friend_accepted':
                receiverId = targetId;
                message = 'đã chấp nhận lời mời kết bạn của bạn.';
                if (receiverId) {
                    createNotification(io, receiverId, senderId, type, message, senderId);
                }
                break;

            // --- SỰ KIỆN TƯƠNG TÁC NỘI DUNG (LIKE/COMMENT) ---

            case 'like':
            case 'comment':
                // NOTE: Logic lọc người lạ được xử lý bằng cách CHỈ thông báo cho ownerId

                // Lấy tên Group nếu có
                let groupName = groupInfo?.name ? ` trong Page "${groupInfo.name}"` : '';

                // Thông báo tới người sở hữu bài viết (ownerId), nếu họ không phải là người gửi
                if (ownerId && String(ownerId) !== String(senderId)) {

                    receiverId = ownerId;

                    if (type === 'like') {
                        message = `đã thả cảm xúc vào bài viết của bạn${groupName}.`;
                    } else {
                        message = `đã bình luận vào bài viết của bạn${groupName}.`;
                    }

                    createNotification(io, receiverId, senderId, type, message, contextId);
                }
                break;

            // --- SỰ KIỆN BÀI VIẾT MỚI (CHỈ BẠN BÈ) ---

            case 'new_post_friend':
                // 1. Gửi thông báo cho chính người đăng bài (Mình đã đăng bài gì)
                message = 'Bạn vừa đăng một bài viết mới.';
                createNotification(io, senderId, senderId, type, message, contextId);

                // 2. Gửi thông báo tới tất cả bạn bè của người đăng bài 
                const friendsIds = await getFriendsIds(senderId);
                message = 'đã đăng một bài viết mới.';

                friendsIds.forEach(friendId => {
                    // Gửi thông báo cho từng người bạn
                    createNotification(io, friendId, senderId, type, message, contextId);
                });
                break;

            // --- CÁC SỰ KIỆN LIÊN QUAN ĐẾN GROUP (Được xử lý trong GroupController) ---

            case 'group_created':
            case 'group_approved':
            case 'group_left':
            case 'group_removed':
            case 'group_role_change':
            case 'group_join_request':
            case 'group_creator_transfer': // Sẽ được xử lý trong GroupController
                break;

            default:
                break;
        }

    } catch (error) {
        // Ghi lại lỗi nếu xảy ra sự cố (ngoài lỗi DB/Socket)
        console.error(`Lỗi xử lý thông báo loại ${type}:`, error);
    }
};


// ============================================
// EXPORTS
// ============================================

module.exports = {
    getNotifications: exports.getNotifications,
    markAllAsRead: exports.markAllAsRead,
    handleNotification: exports.handleNotification,
};