const db = require('../config/database');

/**
 * @route GET /api/search/history
 * @desc Lấy 10 lịch sử tìm kiếm gần nhất của user
 */
exports.getHistory = async (req, res) => {
    const { userId, source = 'global' } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: "Thiếu User ID" });

    try {
        // Lấy lịch sử theo đúng source yêu cầu
        const [history] = await db.promise().query(
            'SELECT id, item_id, item_type, item_name, source, created_at FROM search_history WHERE user_id = ? AND source = ? ORDER BY created_at DESC LIMIT 10',
            [userId, source]
        );
        res.json({ success: true, history });
    } catch (err) {
        console.error("Error fetching search history:", err);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

/**
 * @route POST /api/search/history
 * @desc Thêm một mục vào lịch sử (Phân tách theo Source: global/chat)
 */
exports.addHistory = async (req, res) => {
    const { userId, itemId, itemType, itemName, source = 'global' } = req.body;
    if (!userId || !itemId || !itemType || !itemName) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin" });
    }

    try {
        // 1. Tìm bản ghi hiện có cho Item này trong CÙNG MỘT SOURCE
        // (Để gộp các lần tìm kiếm/click lại 1 chỗ cho đỡ tốn tài nguyên)
        const [existing] = await db.promise().query(
            'SELECT id FROM search_history WHERE user_id = ? AND item_id = ? AND source = ?',
            [userId, itemId, source]
        );

        if (existing.length > 0) {
            // Cập nhật thông tin mới nhất cho bản ghi cũ
            await db.promise().query(
                `UPDATE search_history SET item_type = ?, item_name = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [itemType, itemName, existing[0].id]
            );
        } else {
            // Insert bản ghi mới cho source này
            await db.promise().query(
                `INSERT INTO search_history (user_id, item_id, item_type, item_name, source, created_at) 
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [userId, itemId, itemType, itemName, source]
            );
        }

        // 2. Giới hạn 10 bản ghi cho mỗi source của user
        await db.promise().query(
            `DELETE FROM search_history 
             WHERE user_id = ? AND source = ? AND id NOT IN (
                 SELECT id FROM (
                     SELECT id FROM search_history 
                     WHERE user_id = ? AND source = ?
                     ORDER BY created_at DESC 
                     LIMIT 10
                 ) AS tmp
             )`,
            [userId, source, userId, source]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("Error adding to search history:", err);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

/**
 * @route DELETE /api/search/history/:id
 * @desc Xóa 1 mục lịch sử theo ID
 */
exports.deleteHistoryItem = async (req, res) => {
    const { id } = req.params;
    const { userId } = req.query;

    try {
        const [result] = await db.promise().query(
            'DELETE FROM search_history WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows > 0) {
            res.json({ success: true, message: "Đã xóa mục lịch sử" });
        } else {
            res.status(404).json({ success: false, message: "Không tìm thấy mục này" });
        }
    } catch (err) {
        console.error("Error deleting history item:", err);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

/**
 * @route DELETE /api/search/history
 * @desc Xóa toàn bộ lịch sử của user
 */
exports.clearHistory = async (req, res) => {
    const { userId, source } = req.query;

    try {
        let query = 'DELETE FROM search_history WHERE user_id = ?';
        let params = [userId];

        if (source) {
            query += ' AND source = ?';
            params.push(source);
        }

        await db.promise().query(query, params);
        res.json({ success: true, message: "Đã xóa lịch sử" });
    } catch (err) {
        console.error("Error clearing history:", err);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};
