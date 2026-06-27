const db = require('../config/database');

/**
 * @desc Tạo và lưu thông báo vào DB, sau đó gửi qua Socket.IO.
 * @param {Object} io - Instance của Socket.IO
 * @param {string | number} receiverId - ID người nhận thông báo
 * @param {string | number} senderId - ID người gửi thông báo (người thực hiện hành động)
 * @param {string} type - Loại thông báo (e.g., 'like', 'comment', 'group_join_request')
 * @param {string} content - Nội dung thông báo
 * @param {string | number | null} targetId - ID của post/group/comment liên quan
 */
async function createNotification(io, receiverId, senderId, type, content, targetId = null) {
    if (String(receiverId) === String(senderId)) return; // Không tự thông báo cho chính mình

    const sql = `
        INSERT INTO notifications (receiver_id, sender_id, type, content, target_id)
        VALUES (?, ?, ?, ?, ?)
    `;
    try {
        await db.promise().query(sql, [receiverId, senderId, type, content, targetId]);

        // Gửi thông báo qua Socket.IO
        io.to(receiverId).emit('new_notification', {
            senderId: senderId,
            type: type,
            content: content,
            targetId: targetId
        });

    } catch (error) {
        console.error("Lỗi DB/Socket khi tạo thông báo:", error);
    }
}

module.exports = { createNotification };
