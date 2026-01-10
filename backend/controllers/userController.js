const db = require('../config/database');
const notificationController = require('./notificationController');
const { isAdminOfGroup } = require('../utils/helpers');

// Helper để lấy instance Socket.io từ request
const getIo = (req) => req.app.get('io');

// ============================================
// I. QUẢN LÝ DANH SÁCH CHAT (BẠN BÈ, NGƯỜI LẠ, NHÓM)
// ============================================

/**
 * @route GET /api/users/friends
 * @desc Lấy danh sách bạn bè đã kết bạn kèm tin nhắn cuối cùng để hiển thị ở Sidebar Chat
 */
exports.getAcceptedFriends = async (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ success: false, message: "Missing user ID." });

    const sql = `
        SELECT 
            u.id, u.full_name, u.avatar, u.gender,
            (SELECT message FROM messages 
             WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id)
             ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM messages 
             WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id)
             ORDER BY created_at DESC LIMIT 1) AS last_message_time,
            (SELECT COUNT(id) FROM messages 
             WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) AS unread_count
        FROM friendships f
        JOIN users u ON u.id = CASE WHEN f.sender_id = ? THEN f.receiver_id ELSE f.sender_id END
        WHERE (f.sender_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'
        ORDER BY last_message_time DESC, u.full_name ASC
    `;
    try {
        const params = [userId, userId, userId, userId, userId, userId, userId, userId];
        const [results] = await db.promise().query(sql, params);
        res.json(results);
    } catch (err) {
        console.error('Error fetching accepted friends:', err);
        return res.status(500).json({ success: false, message: 'Lỗi server khi tải danh sách bạn bè.' });
    }
};

/**
 * @route GET /api/users/strangers-messages
 * @desc Lấy danh sách người chưa kết bạn nhưng đã có tin nhắn qua lại
 */
exports.getStrangersWithMessages = async (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ success: false, message: "Missing user ID." });

    const sql = `
        SELECT 
            u.id, u.full_name, u.avatar, u.gender,
            (SELECT message FROM messages 
             WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id)
             ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM messages 
             WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id)
             ORDER BY created_at DESC LIMIT 1) AS last_message_time,
            (SELECT COUNT(id) FROM messages 
             WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) AS unread_count
        FROM users u
        WHERE u.id != ? 
        AND u.id NOT IN (
            SELECT CASE WHEN f.sender_id = ? THEN f.receiver_id ELSE f.sender_id END
            FROM friendships f
            WHERE (f.sender_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'
        )
        AND EXISTS (
            SELECT 1 FROM messages m
            WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
        )
        LIMIT 15
    `;
    try {
        const params = [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId];
        const [results] = await db.promise().query(sql, params);
        res.json(results);
    } catch (err) {
        console.error('Error fetching strangers:', err);
        return res.status(500).json({ success: false, message: 'Lỗi server khi tải danh sách người lạ.' });
    }
};

/**
 * @route GET /api/users/groups
 * @desc Lấy danh sách các nhóm chat người dùng đã tham gia
 */
exports.getGroups = async (req, res) => {
    const userId = req.query.user_id || req.query.viewer_id;
    if (!userId) return res.status(400).json({ success: false, message: "Missing user ID." });

    const sql = `
        SELECT 
            gc.id, gc.name, gc.created_at,
            (SELECT COUNT(*) FROM group_chat_members WHERE group_chat_id = gc.id) AS member_count
        FROM group_chats gc
        JOIN group_chat_members gcm ON gc.id = gcm.group_chat_id
        WHERE gcm.user_id = ?
        ORDER BY gc.created_at DESC
    `;
    try {
        const [results] = await db.promise().query(sql, [userId]);
        res.json(results);
    } catch (err) {
        console.error('Error fetching groups:', err);
        return res.status(500).json({ success: false });
    }
};

// ============================================
// II. PROFILE & RELATIONSHIP
// ============================================

/**
 * @route GET /api/users/:id
 * @desc Lấy thông tin chi tiết trang cá nhân và tình trạng mối quan hệ giữa người xem và chủ profile
 */
exports.getUserProfile = async (req, res) => {
    const viewedUserId = req.params.id;
    const viewerId = req.query.viewer_id;
    if (!viewerId) return res.status(400).json({ success: false, message: "Missing viewer ID." });

    try {
        // 1. Lấy thông tin chi tiết từ bảng users
        const [userResults] = await db.promise().query(
            `SELECT id, full_name, username, avatar, cover_img, bio, work_place, education, 
             birthday, gender, relationship_status, location, privacy_setting, user_info 
             FROM users WHERE id = ?`,
            [viewedUserId]
        );

        if (userResults.length === 0) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });

        const user = userResults[0];
        let relationshipStatus = 'not_friends';

        // 2. Xác định quan hệ giữa người xem và chủ profile
        if (String(viewerId) === String(viewedUserId)) {
            relationshipStatus = 'self';
        } else {
            const [friendship] = await db.promise().query(
                `SELECT status, sender_id FROM friendships 
                 WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) LIMIT 1`,
                [viewerId, viewedUserId, viewedUserId, viewerId]
            );

            if (friendship.length > 0) {
                const { status, sender_id } = friendship[0];
                const isSender = String(sender_id) === String(viewerId);

                if (status === 'accepted') relationshipStatus = 'friends';
                else if (status === 'pending') relationshipStatus = isSender ? 'request_sent' : 'request_received';
                else if (status === 'blocked') relationshipStatus = 'blocked';
            }
        }

        // 3. Đếm tổng số bạn bè
        const [countResults] = await db.promise().query(
            'SELECT COUNT(*) AS friend_count FROM friendships WHERE (sender_id = ? OR receiver_id = ?) AND status = "accepted"',
            [viewedUserId, viewedUserId]
        );

        res.json({
            success: true,
            user,
            relationshipStatus,
            friend_count: countResults[0].friend_count
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Lỗi server khi tải trang cá nhân.' });
    }
};

/**
 * @route GET /api/users/:userId/friends-list
 * @desc Lấy danh sách bạn bè chi tiết (avatar, tên) dùng cho Modal danh sách bạn bè
 */
exports.getFriendList = async (req, res) => {
    const { userId } = req.params;
    const sql = `
        SELECT u.id, u.full_name, u.avatar, u.gender, u.username
        FROM users u
        JOIN friendships f ON (u.id = f.sender_id OR u.id = f.receiver_id)
        WHERE (f.sender_id = ? OR f.receiver_id = ?) 
        AND f.status = 'accepted' AND u.id != ?
    `;
    try {
        const [friends] = await db.promise().query(sql, [userId, userId, userId]);
        res.json({ success: true, friends });
    } catch (err) {
        console.error('Error fetching friend list:', err);
        res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách bạn bè.' });
    }
};

/**
 * @route PUT /api/users
 * @desc Cập nhật thông tin profile cá nhân
 */
exports.updateProfile = async (req, res) => {
    const { user_id, bio, work_place, education, birthday, location, user_info, avatar, cover_img } = req.body;

    if (!user_id) return res.status(400).json({ success: false, message: "Thiếu ID người dùng." });

    const sql = `
        UPDATE users SET 
        bio = COALESCE(?, bio), 
        work_place = COALESCE(?, work_place), 
        education = COALESCE(?, education), 
        birthday = COALESCE(?, birthday), 
        location = COALESCE(?, location), 
        user_info = COALESCE(?, user_info),
        avatar = COALESCE(?, avatar),
        cover_img = COALESCE(?, cover_img)
        WHERE id = ?
    `;

    try {
        const [result] = await db.promise().query(sql, [
            bio || null, work_place || null, education || null,
            birthday || null, location || null, user_info || null,
            avatar || null, cover_img || null, user_id
        ]);

        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Cập nhật thông tin thành công!' });
        } else {
            res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
        }
    } catch (err) {
        console.error("Error updating profile:", err);
        return res.status(500).json({ success: false, message: 'Lỗi server khi lưu thông tin.' });
    }
};

/**
 * @route POST /api/users/friendship
 * @desc Xử lý Gửi/Chấp nhận/Hủy kết bạn/Xóa bạn
 */
exports.manageFriendship = async (req, res) => {
    const { sender_id, receiver_id, action } = req.body;

    if (!sender_id || !receiver_id || !action) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin." });
    }

    try {
        switch (action) {
            case 'request':
                await db.promise().query(
                    'INSERT INTO friendships (sender_id, receiver_id, status) VALUES (?, ?, "pending")',
                    [sender_id, receiver_id]
                );
                // Thông báo cho người nhận (receiver)
                await notificationController.handleNotification(req, sender_id, 'friend_request', null, null, receiver_id);
                return res.json({ success: true, message: 'Đã gửi yêu cầu kết bạn.' });

            case 'accept':
                // QUAN TRỌNG: Khi chấp nhận, sender trong DB chính là người đã gửi yêu cầu (receiver_id từ client)
                // và receiver trong DB chính là mình (sender_id từ client)
                const [result] = await db.promise().query(
                    'UPDATE friendships SET status = "accepted" WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) AND status = "pending"',
                    [receiver_id, sender_id, sender_id, receiver_id]
                );

                if (result.affectedRows === 0) {
                    return res.status(404).json({ success: false, message: 'Yêu cầu không tồn tại.' });
                }

                await notificationController.handleNotification(req, sender_id, 'friend_accepted', null, null, receiver_id);
                return res.json({ success: true, message: 'Đã trở thành bạn bè.' });

            case 'reject':
            case 'cancel':
            case 'remove':
                // Xóa mọi quan hệ giữa 2 người (không phân biệt ai gửi ai nhận)
                await db.promise().query(
                    'DELETE FROM friendships WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
                    [sender_id, receiver_id, receiver_id, sender_id]
                );
                return res.json({ success: true, message: 'Thao tác thành công.' });

            default:
                return res.status(400).json({ success: false, message: 'Hành động không hợp lệ.' });
        }
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Yêu cầu đã tồn tại.' });
        res.status(500).json({ success: false });
    }
};

// ============================================
// III. PHOTO & SHARING
// ============================================

/**
 * @route PUT /api/users/update-photo
 * @desc Cập nhật Avatar hoặc Cover image nhanh
 */
exports.updatePhoto = async (req, res) => {
    const { user_id, type, photo_url } = req.body;
    const column = type === 'avatar' ? 'avatar' : 'cover_img';
    if (!['avatar', 'cover_img'].includes(column)) return res.status(400).json({ message: "Invalid type" });

    try {
        await db.promise().query(`UPDATE users SET ${column} = ? WHERE id = ?`, [photo_url, user_id]);
        res.json({ success: true, message: `Cập nhật ảnh thành công.` });
    } catch (err) {
        console.error('Error updating photo:', err);
        res.status(500).json({ success: false });
    }
};

/**
 * @route GET /api/users/share-targets
 * @desc Lấy danh sách bạn bè và nhóm để hiển thị trong Modal "Chia sẻ Profile"
 */
exports.getShareTargets = async (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ success: false });

    try {
        // Lấy bạn bè
        const [friends] = await db.promise().query(
            `SELECT u.id, u.full_name AS name, u.avatar, 'user' AS type 
             FROM users u JOIN friendships f ON (u.id = f.sender_id OR u.id = f.receiver_id)
             WHERE (f.sender_id = ? OR f.receiver_id = ?) AND f.status = 'accepted' AND u.id != ?`,
            [userId, userId, userId]
        );
        // Lấy nhóm
        const [groups] = await db.promise().query(
            `SELECT gc.id, gc.name, 'group' AS type 
             FROM group_chats gc JOIN group_chat_members gcm ON gc.id = gcm.group_chat_id
             WHERE gcm.user_id = ?`,
            [userId]
        );
        res.json({ success: true, targets: [...friends, ...groups] });
    } catch (err) {
        console.error('Error fetching share targets:', err);
        res.status(500).json({ success: false });
    }
};

// ============================================
// IV. POST MANAGEMENT & SEARCH
// ============================================

/**
 * @route GET /api/users/:userId/posts
 * @desc Lấy bài đăng của một user (Timeline trang cá nhân)
 */
exports.getUserPosts = async (req, res) => {
    const { userId } = req.params;
    try {
        const [results] = await db.promise().query(
            `SELECT p.*, u.full_name, u.avatar 
             FROM posts p 
             JOIN users u ON p.user_id = u.id 
             WHERE p.user_id = ? 
             ORDER BY p.created_at DESC`,
            [userId]
        );
        res.json({ success: true, posts: results });
    } catch (err) {
        console.error('Error fetching user posts:', err);
        res.status(500).json({ success: false, message: 'Lỗi khi lấy bài viết.' });
    }
};

/**
 * @route GET /api/users/requests
 * @desc Lấy danh sách các lời mời kết bạn đang chờ xử lý
 */
exports.getFriendRequests = async (req, res) => {
    const receiverId = req.query.user_id;
    if (!receiverId) return res.status(400).json({ success: false });
    try {
        const [results] = await db.promise().query(
            `SELECT f.sender_id, u.full_name, u.avatar, u.gender, u.location 
             FROM friendships f 
             JOIN users u ON f.sender_id = u.id 
             WHERE f.receiver_id = ? AND f.status = "pending"`,
            [receiverId]
        );
        res.json(results);
    } catch (err) {
        console.error('Error fetching friend requests:', err);
        return res.status(500).json({ error: "Server error" });
    }
};

/**
 * @route GET /api/users/search
 * @desc Tìm kiếm người dùng theo tên hoặc username
 */
exports.searchUsers = async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);
    const searchPattern = `%${query}%`;
    try {
        const [results] = await db.promise().query(
            'SELECT id, full_name, username, avatar, gender FROM users WHERE full_name LIKE ? OR username LIKE ? LIMIT 10',
            [searchPattern, searchPattern]
        );
        res.json(results);
    } catch (err) {
        console.error('Error searching users:', err);
        return res.status(500).json({ error: "Server error" });
    }
};

/**
 * @route DELETE /api/posts/:postId
 */
exports.deletePost = async (req, res) => {
    const { postId } = req.params;
    const userId = req.query.userId;
    try {
        const [result] = await db.promise().query('DELETE FROM posts WHERE id = ? AND user_id = ?', [postId, userId]);
        if (result.affectedRows > 0) {
            res.json({ success: true, message: "Đã xóa bài viết." });
        } else {
            res.status(403).json({ success: false, message: "Không có quyền xóa bài này." });
        }
    } catch (err) {
        console.error('Error deleting post:', err);
        res.status(500).json({ success: false });
    }
};

/**
 * @route PUT /api/users/privacy
 */
exports.updatePrivacy = async (req, res) => {
    const { user_id, setting_value } = req.body;
    try {
        await db.promise().query('UPDATE users SET privacy_setting = ? WHERE id = ?', [setting_value, user_id]);
        res.json({ success: true, message: 'Cập nhật quyền riêng tư thành công.' });
    } catch (err) {
        console.error('Error updating privacy:', err);
        return res.status(500).json({ success: false });
    }
};

exports.updateEmail = async (req, res) => {
    const { user_id, new_email, password } = req.body;

    if (!user_id || !new_email || !password) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập đầy đủ thông tin xác thực." });
    }

    try {
        // 1. Kiểm tra mật khẩu hiện tại
        const [user] = await db.promise().query('SELECT password FROM users WHERE id = ?', [user_id]);

        if (user.length === 0 || user[0].password !== password) {
            return res.status(401).json({ success: false, message: "Mật khẩu xác nhận không chính xác." });
        }

        // 2. Kiểm tra trùng email
        const [existing] = await db.promise().query('SELECT id FROM users WHERE username = ? AND id != ?', [new_email, user_id]);
        if (existing.length > 0) return res.status(409).json({ success: false, message: "Email đã tồn tại." });

        // 3. Cập nhật
        await db.promise().query('UPDATE users SET username = ? WHERE id = ?', [new_email, user_id]);
        res.json({ success: true, message: "Cập nhật email thành công!" });

    } catch (err) {
        res.status(500).json({ success: false, message: "Lỗi hệ thống." });
    }
};

exports.getUserProfile = async (req, res) => {
    const viewedUserId = req.params.id; // ID người bị xem
    const viewerId = req.query.viewer_id; // ID người đang xem (từ localStorage gửi lên)

    if (!viewerId) {
        return res.status(400).json({ success: false, message: "Thiếu ID người xem (viewer_id)." });
    }

    try {
        // 1. Lấy thông tin chi tiết của người dùng bị xem
        const [userResults] = await db.promise().query(
            `SELECT id, full_name, username, avatar, cover_img, bio, work_place, 
                    education, birthday, gender, location, privacy_setting, created_at 
             FROM users WHERE id = ?`,
            [viewedUserId]
        );

        if (userResults.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
        }

        const user = userResults[0];
        let relationshipStatus = 'not_friends';

        // 2. Xác định mối quan hệ giữa người xem và chủ profile
        if (String(viewerId) === String(viewedUserId)) {
            relationshipStatus = 'self';
        } else {
            const [friendship] = await db.promise().query(
                `SELECT status, sender_id FROM friendships 
                 WHERE (sender_id = ? AND receiver_id = ?) 
                    OR (sender_id = ? AND receiver_id = ?) LIMIT 1`,
                [viewerId, viewedUserId, viewedUserId, viewerId]
            );

            if (friendship.length > 0) {
                const f = friendship[0];
                if (f.status === 'accepted') {
                    relationshipStatus = 'friends';
                } else if (f.status === 'pending') {
                    // Nếu viewer là người gửi -> 'request_sent', nếu viewer là người nhận -> 'request_received'
                    relationshipStatus = (String(f.sender_id) === String(viewerId)) ? 'request_sent' : 'request_received';
                } else if (f.status === 'blocked') {
                    relationshipStatus = 'blocked';
                }
            }
        }

        // 3. Đếm tổng số bạn bè của chủ profile
        const [countResults] = await db.promise().query(
            `SELECT COUNT(*) AS total FROM friendships 
             WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'`,
            [viewedUserId, viewedUserId]
        );
        const friendCount = countResults[0].total;

        // 4. LOGIC QUYỀN RIÊNG TƯ (Lock Profile)
        const isSelf = relationshipStatus === 'self';
        const isFriend = relationshipStatus === 'friends';
        const isPrivate = user.privacy_setting == 0; // Giả sử 0 là riêng tư, 1 là công khai

        // Nếu KHÔNG PHẢI chính mình VÀ KHÔNG PHẢI bạn bè VÀ chủ nhà để RIÊNG TƯ
        if (!isSelf && !isFriend && isPrivate) {
            return res.json({
                success: true,
                user: {
                    id: user.id,
                    full_name: user.full_name,
                    avatar: user.avatar,
                    cover_img: user.cover_img // Vẫn cho xem ảnh bìa cho đẹp giao diện
                },
                relationshipStatus,
                friend_count: friendCount,
                isLocked: true // Cờ hiệu để Frontend ẩn phần bài viết và thông tin chi tiết
            });
        }

        // 5. Ngược lại: Trả về đầy đủ dữ liệu
        res.json({
            success: true,
            user: user,
            relationshipStatus,
            friend_count: friendCount,
            isLocked: false
        });

    } catch (err) {
        console.error("Lỗi tại getUserProfile:", err);
        res.status(500).json({ success: false, message: "Lỗi server khi lấy thông tin trang cá nhân." });
    }
};

// ============================================
// CẬP NHẬT THÔNG TIN HỒ SƠ & CÀI ĐẶT HIỂN THỊ
// ============================================

/**
 * @route PUT /api/users
 * @desc Cập nhật thông tin chi tiết và cấu hình hiển thị (JSON user_info)
 */
exports.updateProfile = async (req, res) => {
    const {
        user_id, bio, work_place, education,
        birthday, gender, location, user_info, privacy_setting
    } = req.body;

    if (!user_id) return res.status(400).json({ success: false, message: "Thiếu ID người dùng." });

    // user_info nên được gửi lên từ Frontend dưới dạng chuỗi JSON hoặc Object
    const userInfoJson = typeof user_info === 'object' ? JSON.stringify(user_info) : user_info;

    const sql = `
        UPDATE users SET 
            bio = COALESCE(?, bio), 
            work_place = COALESCE(?, work_place), 
            education = COALESCE(?, education), 
            birthday = COALESCE(?, birthday), 
            gender = COALESCE(?, gender),
            location = COALESCE(?, location), 
            user_info = COALESCE(?, user_info),
            privacy_setting = COALESCE(?, privacy_setting)
        WHERE id = ?
    `;

    try {
        const [result] = await db.promise().query(sql, [
            bio, work_place, education, birthday, gender,
            location, userInfoJson, privacy_setting, user_id
        ]);

        if (result.affectedRows > 0) {
            // [NEW] Cập nhật Realtime Status nếu có thay đổi Setting
            if (user_info) {
                try {
                    const ui = typeof user_info === 'string' ? JSON.parse(user_info) : user_info;
                    if (ui.online_status !== undefined) {
                        const io = req.app.get('io');
                        if (io && io.handlePrivacyChange) {
                            io.handlePrivacyChange(user_id, ui.online_status);
                        }
                    }
                } catch (e) { console.error("Error parsing user_info for socket update", e); }
            }

            res.json({ success: true, message: 'Cập nhật hồ sơ thành công!' });
        } else {
            res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
        }
    } catch (err) {
        console.error("Lỗi cập nhật hồ sơ:", err);
        res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lưu thông tin.' });
    }
};

// ============================================
// XỬ LÝ ẢNH (AVATAR & COVER IMAGE)
// ============================================

/**
 * @route POST /api/users/upload-image
 * @desc Tải lên file ảnh vật lý (Dùng cho nút sửa ảnh trên giao diện)
 */
exports.uploadProfileImage = async (req, res) => {
    const { user_id, type } = req.body; // type: 'avatar' hoặc 'cover'

    if (!req.file) {
        return res.status(400).json({ success: false, message: "Không có file nào được chọn." });
    }

    // Đường dẫn lưu vào DB (Ví dụ: uploads/filename)
    const photoUrl = `uploads/${req.file.filename}`;
    const column = type === 'avatar' ? 'avatar' : 'cover_img';

    try {
        const sql = `UPDATE users SET ${column} = ? WHERE id = ?`;
        await db.promise().query(sql, [photoUrl, user_id]);

        res.json({
            success: true,
            message: "Cập nhật ảnh thành công!",
            url: photoUrl
        });
    } catch (err) {
        console.error("Lỗi DB khi upload ảnh:", err);
        res.status(500).json({ success: false, message: "Lỗi lưu đường dẫn ảnh." });
    }
};

/**
 * @route PUT /api/users/update-photo-url
 * @desc Cập nhật nhanh bằng URL (Nếu bạn có kho ảnh sẵn)
 */
exports.updatePhoto = async (req, res) => {
    const { user_id, type, photo_url } = req.body;
    const column = type === 'avatar' ? 'avatar' : 'cover_img';

    if (!['avatar', 'cover_img'].includes(column)) {
        return res.status(400).json({ message: "Loại ảnh không hợp lệ." });
    }

    try {
        await db.promise().query(`UPDATE users SET ${column} = ? WHERE id = ?`, [photo_url, user_id]);
        res.json({ success: true, message: "Cập nhật thành công." });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

/**
 * @route PUT /api/users/update-name
 * @desc Đổi tên người dùng (Yêu cầu mật khẩu xác thực)
 */
exports.updateName = async (req, res) => {
    const { user_id, new_name, password } = req.body;

    if (!user_id || !new_name || !password) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập đầy đủ thông tin." });
    }

    try {
        // 1. Kiểm tra mật khẩu hiện tại
        const [user] = await db.promise().query('SELECT password FROM users WHERE id = ?', [user_id]);

        if (user.length === 0 || user[0].password !== password) {
            return res.status(401).json({ success: false, message: "Mật khẩu xác nhận không chính xác." });
        }

        // 2. Cập nhật tên mới
        await db.promise().query('UPDATE users SET full_name = ? WHERE id = ?', [new_name, user_id]);

        res.json({ success: true, message: "Cập nhật tên thành công!" });

    } catch (err) {
        console.error("Error updating name:", err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống." });
    }
};

/**
 * @desc Lấy danh sách tất cả những người đã từng có lịch sử nhắn tin (Bạn bè + Người lạ)
 */
exports.getRecentChatUsers = async (req, res) => {
    const userId = req.query.user_id;
    const sql = `
        SELECT DISTINCT u.id, u.full_name, u.avatar
        FROM users u
        WHERE u.id IN (
            SELECT receiver_id FROM messages WHERE sender_id = ?
            UNION
            SELECT sender_id FROM messages WHERE receiver_id = ?
        ) AND u.id != ?
    `;
    try {
        const [results] = await db.promise().query(sql, [userId, userId, userId]);
        res.json({ success: true, users: results });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

/**
 * @route GET /api/users/share-targets
 * @desc Lấy tất cả đối tượng có thể chia sẻ (Bạn bè + Nhóm + Người lạ đã nhắn tin)
 */
exports.getShareTargets = async (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ success: false });

    try {
        // 1. Lấy bạn bè (Accepted)
        const [friends] = await db.promise().query(
            `SELECT u.id, u.full_name AS name, u.avatar, 'user' AS type 
             FROM users u 
             JOIN friendships f ON (u.id = f.sender_id OR u.id = f.receiver_id)
             WHERE (f.sender_id = ? OR f.receiver_id = ?) AND f.status = 'accepted' AND u.id != ?`,
            [userId, userId, userId]
        );

        // 2. Lấy các nhóm chat đã tham gia
        const [groups] = await db.promise().query(
            `SELECT gc.id, gc.name, 'group' AS type 
             FROM group_chats gc 
             JOIN group_chat_members gcm ON gc.id = gcm.group_chat_id
             WHERE gcm.user_id = ?`,
            [userId]
        );

        // 3. Lấy người lạ nhưng đã có tin nhắn (Loại bỏ những người đã là bạn bè ở trên)
        const [strangers] = await db.promise().query(
            `SELECT DISTINCT u.id, u.full_name AS name, u.avatar, 'user' AS type
             FROM users u
             JOIN messages m ON (u.id = m.sender_id OR u.id = m.receiver_id)
             WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?
             AND u.id NOT IN (
                SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
                FROM friendships WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'
             )`,
            [userId, userId, userId, userId, userId, userId]
        );

        // Hợp nhất và loại bỏ trùng lặp ID (nếu có)
        const allTargets = [...friends, ...groups, ...strangers];
        const uniqueTargets = Array.from(new Map(allTargets.map(item => [item.type + item.id, item])).values());

        res.json({ success: true, targets: uniqueTargets });
    } catch (err) {
        console.error('Error fetching share targets:', err);
        res.status(500).json({ success: false });
    }
};
// ============================================
// EXPORTS
// ============================================
// Export đồng nhất để router sử dụng
module.exports = exports;