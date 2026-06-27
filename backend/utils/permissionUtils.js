const db = require('../config/database');

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

        // 2. Kiểm tra User có phải là Admin/Super Admin được duyệt hay không
        const [adminResult] = await db.promise().query(
            "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'approved' AND role IN ('admin', 'super_admin')",
            [groupId, userId]
        );
        if (adminResult.length > 0) return true; // Là Admin hoặc Super Admin

        return false;
    } catch (error) {
        console.error("Lỗi DB khi kiểm tra quyền Admin:", error);
        return false;
    }
}

module.exports = { isAdminOfGroup };
