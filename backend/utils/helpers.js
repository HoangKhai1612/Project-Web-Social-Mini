const db = require('../config/database');
// Bỏ import isNullOrUndefined không cần thiết
// const { isNullOrUndefined } = require('util'); 


// ============================================
// 1. GROUP HELPERS
// ============================================

/**
 * @desc Kiểm tra xem User có quyền Admin/Creator trong Group hay không.
 * @param {string | number} userId 
 * @param {string | number} groupId 
 * @returns {boolean}
 */
async function isAdminOfGroup(userId, groupId) {
    if (!userId || !groupId) return false;

    try {
        // 1. Kiểm tra User có phải là Creator của nhóm hay không
        const [creatorResult] = await db.promise().query(
            'SELECT 1 FROM groups WHERE id = ? AND creator_id = ?',
            [groupId, userId]
        );
        if (creatorResult.length > 0) return true; // Là Creator

        // 2. Kiểm tra User có phải là Admin được duyệt hay không
        const [adminResult] = await db.promise().query(
            'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND status = "approved" AND role = "admin"',
            [groupId, userId]
        );
        if (adminResult.length > 0) return true; // Là Admin

        return false;
    } catch (error) {
        console.error("Lỗi DB khi kiểm tra quyền Admin:", error);
        return false;
    }
}


// ============================================
// 2. NOTIFICATION HELPERS
// ============================================

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

    // CHUỖI SQL SẠCH (ĐÃ XÓA DÒNG CHÚ THÍCH GÂY LỖI)
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


// ============================================
// 3. COMMENT HELPERS
// ============================================

/**
 * @desc Xây dựng cấu trúc cây comments (comments và replies).
 * @param {Array<Object>} list - Danh sách comments phẳng từ DB
 * @param {string | number | null} parentId - ID cha bắt đầu (null cho comment gốc)
 * @returns {Array<Object>} Cấu trúc comments dạng cây
 */
function buildCommentTree(list, parentId) {
    const tree = [];

    list.forEach(item => {
        // Chuyển đổi null/undefined thành 0 để so sánh dễ dàng hơn với comments gốc
        const currentParentId = item.parent_id || 0; 
        const targetParentId = parentId || 0;

        if (currentParentId === targetParentId) {
            const replies = buildCommentTree(list, item.id);
            if (replies.length) {
                item.replies = replies;
            }
            tree.push(item);
        }
    });

    return tree;
}


// ============================================
// EXPORTS
// ============================================

module.exports = {
    isAdminOfGroup,
    createNotification,
    buildCommentTree
};