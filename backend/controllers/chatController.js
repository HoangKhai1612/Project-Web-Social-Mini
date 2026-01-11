const db = require('../config/database');

// ============================================
// LẤY TIN NHẮN & CÀI ĐẶT (MESSAGE HISTORY)
// ============================================

exports.getMessages = async (req, res) => {
    const userId = req.query.user_id;
    const targetId = req.params.targetId;
    const isGroupRequest = req.query.is_group === 'true';

    if (!userId || !targetId) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin ID." });
    }

    try {
        let messages = [];
        let settings = {};

        if (isGroupRequest) {
            // --- LOGIC CHAT NHÓM ---
            const [memberInfo] = await db.promise().query(
                'SELECT role, alias FROM group_chat_members WHERE group_chat_id = ? AND user_id = ?',
                [targetId, userId]
            );

            if (memberInfo.length === 0) {
                return res.status(403).json({ success: false, message: "Bạn không phải thành viên nhóm này." });
            }

            const [groupSettings] = await db.promise().query(
                'SELECT name as group_name, theme_url, avatar FROM group_chats WHERE id = ?',
                [targetId]
            );

            settings = groupSettings[0] || {};
            settings.my_role = memberInfo[0].role;

            // Lấy tin nhắn nhóm kèm nội dung reply (nếu có)
            const sqlGroupMessages = `
                SELECT m.*, u.full_name AS sender_name, u.avatar AS sender_avatar, u.gender AS sender_gender,
                       COALESCE(gcm.alias, u.full_name) AS display_name,
                       rm.message AS reply_content,
                       rm.media_url AS reply_media_url
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                LEFT JOIN group_chat_members gcm ON gcm.group_chat_id = m.receiver_id AND gcm.user_id = m.sender_id
                LEFT JOIN messages rm ON m.reply_to_id = rm.id
                WHERE m.receiver_id = ? 
                ORDER BY m.created_at ASC
            `;
            [messages] = await db.promise().query(sqlGroupMessages, [targetId]);

        } else {
            // --- LOGIC CHAT 1-1 ---
            await db.promise().query(
                'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
                [targetId, userId]
            );

            const [targetUser] = await db.promise().query('SELECT full_name FROM users WHERE id = ?', [targetId]);
            const targetFullName = targetUser[0]?.full_name || "Người dùng";

            const [chatSet] = await db.promise().query(
                'SELECT alias, theme_url FROM chat_settings WHERE user_id = ? AND target_id = ?',
                [userId, targetId]
            );

            settings = chatSet[0] || {};
            settings.display_name = settings.alias || targetFullName;

            // Kiểm tra chặn và bạn bè (giữ nguyên logic của bạn)
            try {
                const [friendship] = await db.promise().query(
                    'SELECT status FROM friendships WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
                    [userId, targetId, targetId, userId]
                );
                settings.friendship_status = friendship[0]?.status || 'stranger';
            } catch (e) { settings.friendship_status = 'stranger'; }

            const [blockStatus] = await db.promise().query(
                'SELECT blocked_by FROM blocks WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)',
                [userId, targetId, targetId, userId]
            );
            settings.is_blocked = blockStatus.length > 0;
            if (settings.is_blocked) settings.blocked_by = blockStatus[0].blocked_by;

            // Lấy tin nhắn 1-1 kèm nội dung reply
            const sqlPrivateMessages = `
                SELECT m.*, 
                       IF(m.sender_id = ?, 'Bạn', ?) as display_name,
                       s.avatar AS sender_avatar, s.gender AS sender_gender,
                       rm.message AS reply_content,
                       rm.media_url AS reply_media_url
                FROM messages m
                JOIN users s ON m.sender_id = s.id
                LEFT JOIN messages rm ON m.reply_to_id = rm.id
                WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
                ORDER BY m.created_at ASC
            `;
            [messages] = await db.promise().query(sqlPrivateMessages, [
                userId, settings.display_name,
                userId, targetId, targetId, userId
            ]);
        }

        // Parse reactions từ chuỗi sang JSON cho Frontend dễ xử lý
        messages = messages.map(msg => ({
            ...msg,
            reactions: msg.reactions ? JSON.parse(msg.reactions) : {}
        }));

        res.json({ success: true, messages, settings, isGroup: isGroupRequest });

    } catch (err) {
        console.error('Lỗi tải lịch sử chat:', err);
        res.status(500).json({ success: false, message: 'Lỗi server nội bộ.' });
    }
};

// --- 1. HÀM UPLOAD MEDIA (ẢNH/VIDEO) ---
exports.uploadMedia = (req, res) => {
    try {
        // 1. Kiểm tra nếu file không tồn tại
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Không tìm thấy file tải lên."
            });
        }

        /**
         * 2. Xác định loại thư mục (type)
         * Ưu tiên lấy từ query parameter (?type=message) để đảm bảo Multer đã xử lý đúng thư mục
         */
        const type = req.query.type || req.body.type || 'other';

        /**
         * 3. Tạo đường dẫn tương đối (Relative Path)
         * Đây là giá trị sẽ được lưu vào Database (ví dụ: uploads/messages/img-xxx.png)
         * Việc lưu đường dẫn tương đối giúp hệ thống không bị "chết" link khi đổi tên miền.
         */
        const relativePath = `uploads/${type}s/${req.file.filename}`;

        /**
         * 4. Tạo URL tuyệt đối (Full URL)
         * Dùng để trả về cho Frontend hiển thị ảnh ngay lập tức.
         */
        const protocol = req.protocol; // http hoặc https
        const host = req.get('host'); // ví dụ: localhost:3000
        const fullUrl = `${protocol}://${host}/${relativePath}`;

        // 5. Phản hồi kết quả cho Frontend
        res.json({
            success: true,
            message: "Tải file lên thành công",
            data: {
                filename: req.file.filename,
                relativePath: relativePath, // Dùng để gửi qua Socket/Lưu DB
                url: fullUrl              // Dùng để hiển thị preview trên FE
            }
        });

    } catch (error) {
        console.error("Lỗi chi tiết tại uploadMedia:", error);
        res.status(500).json({
            success: false,
            message: "Lỗi hệ thống khi xử lý tệp tin."
        });
    }
};

// --- 2. HÀM THẢ CẢM XÚC (REACTIONS) ---
exports.toggleReaction = async (req, res) => {
    const { messageId, userId, emoji } = req.body;

    if (!messageId || !userId || !emoji) {
        return res.status(400).json({ success: false, message: "Thiếu dữ liệu." });
    }

    try {
        // Lấy reactions hiện tại của tin nhắn
        const [rows] = await db.promise().query('SELECT reactions FROM messages WHERE id = ?', [messageId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy tin nhắn." });

        // Parse JSON từ database
        let reactions = rows[0].reactions ? JSON.parse(rows[0].reactions) : {};

        // 1. Xóa user khỏi TẤT CẢ các emoji hiện tại (để đảm bảo chỉ có 1 reaction)
        let removed = false;
        for (const reactionType in reactions) {
            const index = reactions[reactionType].indexOf(userId);
            if (index > -1) {
                reactions[reactionType].splice(index, 1);
                if (reactions[reactionType].length === 0) delete reactions[reactionType];
                if (reactionType === emoji) removed = true; // Đánh dấu là đã xóa chính emoji này (toggle off)
            }
        }

        // 2. Nếu chưa xóa (tức là user chưa thả emoji này), thì thêm vào
        // (Nếu removed = true nghĩa là user đã thả emoji này rồi -> click lại -> xóa -> toggle off không thêm lại)
        if (!removed) {
            if (!reactions[emoji]) reactions[emoji] = [];
            reactions[emoji].push(userId);
        }

        // Cập nhật lại vào Database
        await db.promise().query('UPDATE messages SET reactions = ? WHERE id = ?', [JSON.stringify(reactions), messageId]);

        res.json({ success: true, reactions });
    } catch (error) {
        console.error("Lỗi toggleReaction:", error);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};

// --- 3. LƯU Ý KHI LƯU TIN NHẮN (Gợi ý cho hàm lưu tin nhắn chính) ---
// Khi bạn thực hiện INSERT tin nhắn mới, hãy đảm bảo lưu thêm 2 trường:
// - reply_to_id: ID của tin nhắn đang được trả lời (nếu có)
// - media_url: Đường dẫn ảnh/video nhận được từ hàm uploadMedia

// ============================================
// QUẢN LÝ CHẶN (BLOCK / UNBLOCK)
// ============================================

exports.toggleBlock = async (req, res) => {
    const { user_id, target_id, action } = req.body;
    try {
        if (action === 'block') {
            await db.promise().query(
                'INSERT IGNORE INTO blocks (user_id, blocked_user_id, blocked_by) VALUES (?, ?, ?)',
                [user_id, target_id, user_id]
            );
        } else {
            await db.promise().query(
                'DELETE FROM blocks WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)',
                [user_id, target_id, target_id, user_id]
            );
        }
        res.json({ success: true, message: action === 'block' ? "Đã chặn" : "Đã bỏ chặn" });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

// ============================================
// QUẢN LÝ CÀI ĐẶT (ALIAS, THEME, NAME)
// ============================================

exports.updateSettings = async (req, res) => {
    const { user_id, target_id, field, value, is_group, member_id } = req.body;
    const allowedFields = ['alias', 'theme_url', 'name'];

    if (!allowedFields.includes(field)) {
        return res.status(400).json({ success: false, message: "Trường cập nhật không hợp lệ." });
    }

    try {
        if (is_group) {
            if (field === 'alias') {
                await db.promise().query(
                    'UPDATE group_chat_members SET alias = ? WHERE group_chat_id = ? AND user_id = ?',
                    [value, target_id, member_id || user_id]
                );
            } else {
                // Kiểm tra quyền Admin
                const [adminCheck] = await db.promise().query(
                    'SELECT role FROM group_chat_members WHERE group_chat_id = ? AND user_id = ?',
                    [target_id, user_id]
                );
                if (field === 'name' && adminCheck[0]?.role !== 'admin') {
                    return res.status(403).json({ success: false, message: "Chỉ Admin mới có quyền." });
                }
                const colName = field === 'name' ? 'name' : 'theme_url';
                await db.promise().query(`UPDATE group_chats SET ${colName} = ? WHERE id = ?`, [value, target_id]);
            }
        } else {
            const sql = `
                INSERT INTO chat_settings (user_id, target_id, ${field}) 
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE ${field} = VALUES(${field})
            `;
            await db.promise().query(sql, [user_id, target_id, value]);
        }
        res.json({ success: true, message: 'Cập nhật thành công!' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

// ============================================
// QUẢN LÝ NHÓM (TẠO, THÊM, XÓA, RỜI)
// ============================================

exports.createGroupChat = async (req, res) => {
    const { creator_id, name, member_ids } = req.body;
    if (!creator_id || !name || !member_ids || member_ids.length < 2) {
        return res.status(400).json({ success: false, message: "Nhóm cần tối thiểu 3 người." });
    }

    try {
        const [groupResult] = await db.promise().query('INSERT INTO group_chats (name, creator_id) VALUES (?, ?)', [name, creator_id]);
        const groupId = groupResult.insertId;

        await db.promise().query('INSERT INTO group_chat_members (group_chat_id, user_id, role) VALUES (?, ?, "admin")', [groupId, creator_id]);

        const memberValues = member_ids.map(id => [groupId, id, 'member']);
        const placeholders = memberValues.map(() => '(?, ?, ?)').join(',');
        await db.promise().query(
            `INSERT INTO group_chat_members (group_chat_id, user_id, role) VALUES ${placeholders}`,
            memberValues.flat()
        );

        res.status(201).json({ success: true, groupId });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

exports.getFriendsNotInGroup = async (req, res) => {
    const { user_id, group_id } = req.query;
    try {
        const sql = `
            SELECT u.id, u.full_name 
            FROM users u
            WHERE u.id IN (
                SELECT CASE WHEN user_id1 = ? THEN user_id2 ELSE user_id1 END
                FROM friendships 
                WHERE (user_id1 = ? OR user_id2 = ?) AND status = 'accepted'
            )
            AND u.id NOT IN (
                SELECT user_id FROM group_chat_members WHERE group_chat_id = ?
            )
        `;
        const [friends] = await db.promise().query(sql, [user_id, user_id, user_id, group_id]);
        res.json({ success: true, friends });
    } catch (err) { res.status(500).json({ success: false }); }
};

exports.addMembersToGroup = async (req, res) => {
    const { groupId, member_ids } = req.body;
    try {
        const memberValues = member_ids.map(id => [groupId, id, 'member']);
        const placeholders = memberValues.map(() => '(?, ?, ?)').join(',');
        await db.promise().query(
            `INSERT IGNORE INTO group_chat_members (group_chat_id, user_id, role) VALUES ${placeholders}`,
            memberValues.flat()
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
};

exports.getGroupMembers = async (req, res) => {
    const { groupId } = req.params;
    try {
        const [members] = await db.promise().query(`
            SELECT u.id, u.full_name, gcm.alias, gcm.role 
            FROM group_chat_members gcm
            JOIN users u ON gcm.user_id = u.id
            WHERE gcm.group_chat_id = ?`, [groupId]);
        res.json({ success: true, members });
    } catch (err) { res.status(500).json({ success: false }); }
};

exports.leaveOrRemoveMember = async (req, res) => {
    const { groupId, userIdToRemove, requestorId } = req.body;
    try {
        if (userIdToRemove != requestorId) {
            const [check] = await db.promise().query('SELECT role FROM group_chat_members WHERE group_chat_id = ? AND user_id = ?', [groupId, requestorId]);
            if (!check[0] || check[0].role !== 'admin') {
                return res.status(403).json({ success: false, message: "Chỉ Admin mới có quyền xóa." });
            }
        }

        await db.promise().query('DELETE FROM group_chat_members WHERE group_chat_id = ? AND user_id = ?', [groupId, userIdToRemove]);

        const [countRes] = await db.promise().query('SELECT COUNT(*) as total FROM group_chat_members WHERE group_chat_id = ?', [groupId]);

        if (countRes[0].total < 3) {
            await db.promise().query('DELETE FROM group_chats WHERE id = ?', [groupId]);
            await db.promise().query('DELETE FROM group_chat_members WHERE group_chat_id = ?', [groupId]);
            await db.promise().query('DELETE FROM messages WHERE receiver_id = ?', [groupId]);
            return res.json({ success: true, groupDeleted: true });
        }

        res.json({ success: true, groupDeleted: false });
    } catch (err) { res.status(500).json({ success: false }); }
};

exports.uploadGroupChatAvatar = async (req, res) => {
    const groupId = req.params.groupId;
    const userId = req.user.id; // [FIX] Use secure ID from token
    const file = req.file;

    if (!groupId || !file) {
        return res.status(400).json({ success: false, message: 'Thiếu ID nhóm hoặc file ảnh.' });
    }

    try {
        console.log('--- UPLOAD CHAT GROUP AVATAR DEBUG ---');
        console.log('GroupId:', groupId, 'UserId:', userId);

        // Kiểm tra xem User có phải là thành viên nhóm không
        const [memberCheck] = await db.promise().query(
            'SELECT 1 FROM group_chat_members WHERE group_chat_id = ? AND user_id = ?',
            [groupId, userId]
        );

        if (memberCheck.length === 0) {
            return res.status(403).json({ success: false, message: 'Bạn không phải là thành viên của nhóm chat này.' });
        }

        // Lưu đường dẫn ảnh vào DB
        const avatarUrl = `uploads/group_chats/${file.filename}`; // [FIX] Correct folder name
        await db.promise().query('UPDATE group_chats SET avatar = ? WHERE id = ?', [avatarUrl, groupId]);

        res.json({ success: true, message: 'Cập nhật ảnh nhóm chat thành công.', avatarUrl: avatarUrl });

    } catch (err) {
        console.error('Lỗi upload avatar nhóm chat:', err);
        res.status(500).json({ success: false, message: 'Lỗi upload ảnh.' });
    }
};

// ============================================
// TIỆN ÍCH TIN NHẮN
// ============================================

exports.markChatAsRead = async (req, res) => {
    const { user_id, target_id } = req.body;
    try {
        await db.promise().query('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0', [target_id, user_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
};

exports.deleteChat = async (req, res) => {
    const { user_id, target_id } = req.body;
    try {
        await db.promise().query(
            'DELETE FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
            [user_id, target_id, target_id, user_id]
        );
        res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử tin nhắn.' });
    } catch (err) { res.status(500).json({ success: false }); }
};

// ============================================
// EXPORTS
// ============================================

module.exports = exports;