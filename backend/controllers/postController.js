const db = require('../config/database');
const { isAdminOfGroup } = require('../utils/permissionUtils');
const { createNotification } = require('../utils/notificationUtils');
const { buildCommentTree } = require('../utils/dataUtils');
const upload = require('../config/multerConfig'); // Đã giả định là multer single('media')
const notificationController = require('./notificationController'); // REQUIRE CONTROLLER THÔNG BÁO MỚI
const getIo = (req) => req.app.get('io');

// Middleware cho việc upload file (Dùng để export cho Router)
exports.uploadMiddleware = upload.single('media');

/**
 * @route POST /api/posts/
 * @desc Tạo Bài đăng mới (Cập nhật logic lưu folder posts)
 */
exports.createPost = async (req, res) => {
    const { user_id, content, group_id } = req.body;

    // ✅ Lấy type từ query hoặc mặc định là 'post'
    const type = req.query.type || 'post';

    // ✅ Lưu đường dẫn tương đối vào DB: uploads/posts/filename.ext
    const media_url = req.file ? `uploads/${type}s/${req.file.filename}` : null;

    if (!content && !media_url) {
        return res.status(400).json({ success: false, message: 'Bài đăng không được trống!' });
    }

    const sql = 'INSERT INTO posts (user_id, group_id, content, media_url) VALUES (?, ?, ?, ?)';
    try {
        const [result] = await db.promise().query(sql, [user_id, group_id || null, content, media_url]);
        const postId = result.insertId;

        // Lấy thông tin đầy đủ của bài viết để broadcast
        const [postRows] = await db.promise().query(`
            SELECT p.*, u.full_name, u.avatar, u.gender
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
        `, [postId]);

        const fullPost = postRows[0];
        const io = getIo(req);

        if (!group_id) {
            notificationController.handleNotification(req, user_id, 'new_post_friend', postId);
            // Broadcast realtime cho tất cả (hoặc bạn bè)
            io.emit('new_post', fullPost);
        } else {
            // Broadcast cho Group room
            io.to(`group_${group_id}`).emit('new_post', fullPost);
        }

        res.status(201).json({
            success: true,
            message: 'Đăng bài thành công!',
            postId: postId,
            media_url: media_url
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Lỗi DB khi đăng bài.' });
    }
};

/**
 * @route GET /api/posts/:postId
 * @desc Lấy chi tiết một bài đăng (Dùng cho Edit/View Modal)
 */
exports.getPostById = async (req, res) => {
    const { postId } = req.params;
    try {
        const sql = `
            SELECT p.*, g.name AS group_name, u.full_name, u.avatar 
            FROM posts p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN groups g ON p.group_id = g.id
            WHERE p.id = ?
        `;
        const [posts] = await db.promise().query(sql, [postId]);

        if (posts.length === 0) {
            return res.status(404).json({ success: false, message: "Bài viết không tồn tại." });
        }

        res.json(posts[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};

/**
 * @route GET /api/posts
 * @desc Lấy Newsfeed/Profile/Group Feed 
 */
exports.getPosts = async (req, res) => {
    const viewerId = req.query.user_id;
    const targetId = req.query.target_user_id;
    const targetType = req.query.target_type;

    if (!viewerId) return res.status(400).json({ success: false, message: "Thiếu ID người xem." });

    try {
        let sqlFilter = '';
        let filterParams = [];

        // ĐIỀU KIỆN CHUNG: Chưa bị xóa mềm
        const softDeleteCondition = `AND p.deleted_at IS NULL`;

        // ĐIỀU KIỆN ẨN: Loại bỏ các bài mà viewer đã chủ động bấm "Ẩn" (trừ khi xem lại chính bài của mình trong profile)
        const hideExclusion = `AND p.id NOT IN (SELECT post_id FROM hidden_posts_by_users WHERE user_id = ${db.escape(viewerId)})`;

        if (targetType === 'group' && targetId) {
            // 1. Feed của Nhóm
            sqlFilter = `WHERE p.group_id = ? ${hideExclusion} ${softDeleteCondition}`;
            filterParams.push(targetId);
        } else if (String(viewerId) === String(targetId) && targetType !== 'profile') {
            // 2. Trang chủ (Newsfeed)
            sqlFilter = `
                WHERE p.group_id IS NULL 
                AND (p.visibility = 0 OR p.user_id = ?) 
                ${hideExclusion} ${softDeleteCondition}
                AND (
                    p.user_id = ? 
                    OR EXISTS (
                        SELECT 1 FROM friendships f
                        WHERE f.status = 'accepted'
                        AND ((f.sender_id = p.user_id AND f.receiver_id = ?) OR (f.sender_id = ? AND f.receiver_id = p.user_id))
                    )
                )
                AND p.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            `;
            filterParams.push(viewerId, viewerId, viewerId, viewerId);
        } else {
            // 3. Trang cá nhân (Profile)
            // Nếu là chính chủ xem: Thấy hết bài của mình (kể cả bài ẩn 🔒)
            // Nếu người khác xem: Chỉ thấy bài công khai (0)
            const visibilityRule = String(viewerId) === String(targetId) ? "" : "AND p.visibility = 0";
            sqlFilter = `WHERE p.user_id = ? AND p.group_id IS NULL ${visibilityRule} ${hideExclusion} ${softDeleteCondition}`;
            filterParams.push(targetId);
        }

        const sql = `
    SELECT p.*, g.name AS group_name, u.full_name, u.avatar, u.gender,
        (SELECT COUNT(id) FROM reactions WHERE post_id = p.id) AS total_reactions,
        (SELECT COUNT(id) FROM comments WHERE post_id = p.id) AS comment_count,
        (SELECT reaction_type FROM reactions WHERE post_id = p.id AND user_id = ?) AS user_reaction_type,
        -- THÊM 2 DÒNG DƯỚI ĐÂY ĐỂ BIẾT TRẠNG THÁI ĐÃ THÍCH/ẨN CHƯA
        EXISTS(SELECT 1 FROM favorite_posts WHERE post_id = p.id AND user_id = ?) AS is_favorite,

        EXISTS(SELECT 1 FROM hidden_posts_by_users WHERE post_id = p.id AND user_id = ?) AS is_hidden_by_me,
        -- LẤY ROLE CỦA VIEWER TRONG GROUP (NẾU BÀI VIẾT THUỘC GROUP)
        (SELECT role FROM group_members WHERE group_id = p.group_id AND user_id = ?) AS viewer_group_role
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN groups g ON p.group_id = g.id
    ${sqlFilter}
    ORDER BY p.created_at DESC LIMIT 20
`;

        // Khi thực thi query, nhớ truyền đủ tham số viewerId
        const [posts] = await db.promise().query(sql, [viewerId, viewerId, viewerId, viewerId, ...filterParams]);
        res.json(posts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Lỗi khi tải bài viết.' });
    }
};

/**
 * @route DELETE /api/posts/:postId
 * @desc Xóa Bài Đăng (Kiểm tra quyền Admin Group)
 */
exports.deletePost = async (req, res) => {
    const postId = req.params.postId;
    const { user_id } = req.body;

    try {
        const [post] = await db.promise().query('SELECT user_id, group_id FROM posts WHERE id = ?', [postId]);

        if (post.length === 0) {
            return res.status(404).json({ success: false, message: 'Bài đăng không tồn tại.' });
        }

        const postOwnerId = post[0].user_id;
        const postGroupId = post[0].group_id;

        let canDelete = false;

        // [PHÂN QUYỀN 1] Người sở hữu bài đăng luôn xóa được bài của mình
        if (String(user_id) === String(postOwnerId)) {
            canDelete = true;
        }

        // [PHÂN QUYỀN 2] Kiểm tra quyền Creator/Admin của Group
        if (!canDelete && postGroupId) {
            // isAdminOfGroup nên được thiết lập để trả về TRUE cho cả Creator và Admin
            const isAdmin = await isAdminOfGroup(user_id, postGroupId);
            if (isAdmin) {
                canDelete = true; // Creator/Admin xóa được bài của người khác trong Group
            }
        }

        if (!canDelete) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa bài đăng này.' });
        }

        // [MOVE TO ARCHIVE]
        // 1. Lấy toàn bộ dữ liệu bài viết
        const [postData] = await db.promise().query('SELECT * FROM posts WHERE id = ?', [postId]);
        const p = postData[0];

        // 3. Chèn vào bảng archived_posts (Dùng REPLACE để tránh lỗi Duplicate)
        await db.promise().query(
            `REPLACE INTO archived_posts (original_id, user_id, content, media_url, group_id, visibility, created_at, deleted_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [p.id, p.user_id, p.content, p.media_url, p.group_id, p.visibility, p.created_at, user_id]
        );

        // 4. Xóa dữ liệu liên quan (Manual Cascade)
        await db.promise().query('DELETE FROM reactions WHERE post_id = ?', [postId]);
        await db.promise().query('DELETE FROM comments WHERE post_id = ?', [postId]);
        await db.promise().query('DELETE FROM favorite_posts WHERE post_id = ?', [postId]);
        await db.promise().query('DELETE FROM hidden_posts_by_users WHERE post_id = ?', [postId]);
        // await db.promise().query('DELETE FROM post_reports WHERE post_id = ?', [postId]); // Tạm khóa để tránh lỗi

        // 5. Xóa khỏi bảng posts chính
        await db.promise().query('DELETE FROM posts WHERE id = ?', [postId]);

        res.json({ success: true, message: 'Bài đăng đã được chuyển vào Kho lưu trữ.' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Lỗi DB khi xóa bài đăng.' });
    }
};

/**
 * @desc Xóa vĩnh viễn
 */
exports.permanentDeletePost = async (req, res) => {
    const { postId } = req.params;
    const { user_id } = req.body;

    try {
        const [post] = await db.promise().query('SELECT user_id FROM posts WHERE id = ?', [postId]);
        if (post.length === 0) return res.status(404).json({ success: false, message: 'Bài viết không tồn tại.' });

        if (String(post[0].user_id) !== String(user_id)) {
            return res.status(403).json({ success: false, message: 'Không có quyền xóa vĩnh viễn.' });
        }

        // Xóa sạch dữ liệu liên quan
        await db.promise().query('DELETE FROM reactions WHERE post_id = ?', [postId]);
        await db.promise().query('DELETE FROM comments WHERE post_id = ?', [postId]);
        await db.promise().query('DELETE FROM favorite_posts WHERE post_id = ?', [postId]);
        await db.promise().query('DELETE FROM hidden_posts_by_users WHERE post_id = ?', [postId]);

        // Cuối cùng xóa bài viết
        await db.promise().query('DELETE FROM posts WHERE id = ?', [postId]);

        res.json({ success: true, message: 'Đã xóa vĩnh viễn bài viết.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
};

// [REMOVED] autoCleanup logic moved to jobs/cleanupArchive.js


/**
 * @route POST /api/posts/:postId/react
 * @desc Gửi Reaction
 */
exports.reactToPost = async (req, res) => {
    const postId = req.params.postId;
    const { user_id, reaction_type } = req.body;

    try {
        const [results] = await db.promise().query('SELECT id, reaction_type FROM reactions WHERE post_id = ? AND user_id = ?', [postId, user_id]);

        if (results.length > 0) {
            const reactionId = results[0].id;
            const currentType = results[0].reaction_type;

            if (reaction_type === 0 || currentType === reaction_type) {
                await db.promise().query('DELETE FROM reactions WHERE id = ?', [reactionId]);
                return res.json({ success: true, action: 'deleted' });
            } else {
                await db.promise().query('UPDATE reactions SET reaction_type = ? WHERE id = ?', [reaction_type, reactionId]);
                return res.json({ success: true, action: 'updated', newType: reaction_type });
            }
        } else if (reaction_type > 0) {
            await db.promise().query('INSERT INTO reactions (post_id, user_id, reaction_type) VALUES (?, ?, ?)', [postId, user_id, reaction_type]);

            // Lấy thông tin chủ bài viết và Group để thông báo
            const [postData] = await db.promise().query(
                'SELECT p.user_id, g.name, p.group_id FROM posts p LEFT JOIN groups g ON p.group_id = g.id WHERE p.id = ?',
                [postId]
            );

            // [TÍCH HỢP THÔNG BÁO] Gửi thông báo nếu không phải tự like
            if (postData.length > 0 && String(postData[0].user_id) !== String(user_id)) {

                // Chuẩn bị thông tin Group để truyền vào handleNotification
                const groupInfo = postData[0].group_id ? { id: postData[0].group_id, name: postData[0].name } : null;

                notificationController.handleNotification(
                    req,
                    user_id,
                    'like',
                    postId,
                    postData[0].user_id,
                    null,
                    groupInfo // Truyền Group Info
                );
            }

            return res.json({ success: true, action: 'created', newType: reaction_type });
        }
        return res.status(200).json({ success: false, message: 'Không có hành động nào được thực hiện.' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Lỗi server khi tương tác.' });
    }
};

/**
 * @route GET /api/posts/:postId/comments
 * @desc Lấy Comments của một Post
 */
exports.getComments = async (req, res) => {
    const postId = req.params.postId;

    const sql = `
        SELECT c.*, u.full_name, u.avatar, u.gender
        FROM comments c 
        JOIN users u ON c.user_id = u.id 
        WHERE c.post_id = ? 
        ORDER BY c.created_at ASC 
    `;

    try {
        const [results] = await db.promise().query(sql, [postId]);

        // Giả định buildCommentTree là hàm helper chuẩn bị dữ liệu comments
        const commentTree = buildCommentTree(results, null);

        res.json(commentTree.reverse());
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Lỗi server khi tải comments.' });
    }
};

/**
 * @route POST /api/posts/:postId/comment
 * @desc Thêm Comment mới (hoặc Reply)
 */
exports.addComment = async (req, res) => {
    const postId = req.params.postId;
    const { user_id, content, parent_id } = req.body;

    if (!content) return res.status(400).json({ success: false, message: 'Nội dung không được trống.' });

    const sql = 'INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)';
    try {
        const [result] = await db.promise().query(sql, [postId, user_id, content, parent_id]);

        // Lấy thông tin chủ bài viết và Group
        const [postData] = await db.promise().query(
            'SELECT p.user_id, g.name, p.group_id FROM posts p LEFT JOIN groups g ON p.group_id = g.id WHERE p.id = ?',
            [postId]
        );

        let receiverId = null;

        if (parent_id) {
            // Trường hợp 1: Reply comment -> Gửi thông báo tới chủ comment cha
            const [parentComment] = await db.promise().query('SELECT user_id FROM comments WHERE id = ?', [parent_id]);
            if (parentComment.length > 0) {
                receiverId = parentComment[0].user_id;
            }
        } else if (postData.length > 0) {
            // Trường hợp 2: Comment mới -> Gửi thông báo tới chủ bài viết
            receiverId = postData[0].user_id;
        }

        // [TÍCH HỢP THÔNG BÁO] Gửi thông báo nếu người comment không phải người nhận
        if (receiverId && String(user_id) !== String(receiverId)) {
            // Chuẩn bị thông tin Group để truyền vào handleNotification
            const groupInfo = postData[0].group_id ? { id: postData[0].group_id, name: postData[0].name } : null;

            notificationController.handleNotification(
                req,
                user_id,
                'comment',
                postId,
                receiverId,
                null,
                groupInfo // Truyền Group Info
            );
        }

        res.status(201).json({ success: true, commentId: result.insertId, parentId: parent_id });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Lỗi server khi thêm comment.' });
    }
};

/**
 * @desc Thả cảm xúc cho bình luận (Tương tự Chat - JSON Column)
 * @route POST /api/posts/comment/react
 */
exports.reactToComment = async (req, res) => {
    // Lấy link từ authMiddleware (yêu cầu login)
    const userIdFromToken = req.user.userId || req.user.id;
    const { commentId, emoji } = req.body;

    if (!commentId || !emoji) {
        return res.status(400).json({ success: false, message: "Thiếu dữ liệu (commentId hoặc emoji)." });
    }

    try {
        // 0. Chuẩn hóa ID
        const targetCommentId = Number(commentId);
        const targetUserId = Number(userIdFromToken);

        // 1. Lấy reactions hiện tại
        const [rows] = await db.promise().query('SELECT reactions FROM comments WHERE id = ?', [targetCommentId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Không tìm thấy bình luận." });

        let reactions = {};
        try {
            reactions = rows[0].reactions ? (typeof rows[0].reactions === 'string' ? JSON.parse(rows[0].reactions) : rows[0].reactions) : {};
        } catch (e) { reactions = {}; }

        // 2. Logic Single Reaction
        let removed = false;
        for (const reactionType in reactions) {
            // Đảm bảo so sánh dạng number
            const index = reactions[reactionType].findIndex(uid => Number(uid) === targetUserId);
            if (index > -1) {
                reactions[reactionType].splice(index, 1);
                if (reactions[reactionType].length === 0) delete reactions[reactionType];
                if (reactionType === emoji) removed = true;
            }
        }

        // 3. Apply New Reaction
        if (!removed) {
            if (!reactions[emoji]) reactions[emoji] = [];
            reactions[emoji].push(targetUserId);
        }

        // 4. Update
        const jsonString = JSON.stringify(reactions);
        await db.promise().query('UPDATE comments SET reactions = ? WHERE id = ?', [jsonString, targetCommentId]);

        res.json({ success: true, reactions });
    } catch (err) {
        console.error("Lỗi reactToComment:", err);
        res.status(500).json({ success: false, message: "Lỗi server khi thả cảm xúc." });
    }
};


/**
 * @route POST /api/posts/:postId/share
 * @desc Chia sẻ Bài đăng qua Chat
 */
exports.sharePost = async (req, res) => {
    const postId = req.params.postId;
    const { sender_id, receiver_id, message } = req.body;
    const io = getIo(req);

    try {
        const [postInfo] = await db.promise().query(
            'SELECT p.content, u.full_name FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?',
            [postId]
        );

        if (postInfo.length === 0) {
            return res.status(404).json({ success: false, message: 'Bài đăng không tồn tại.' });
        }

        const shareContent = {
            type: 'share_post',
            post_id: postId,
            post_summary: `[Bài đăng của ${postInfo[0].full_name}] ${postInfo[0].content.substring(0, 50)}...`,
            custom_message: message || 'Tôi chia sẻ bài này cho bạn.'
        };

        // [NOTE]: Việc chia sẻ qua chat là một hành động realtime (Socket.IO) 
        // và không tạo thông báo lịch sử (notifications table), nên logic này là đúng.
        io.to(receiver_id).emit('receive_share_message', {
            sender: sender_id,
            receiver: receiver_id,
            data: shareContent
        });

        res.json({ success: true, message: 'Chia sẻ thành công qua tin nhắn.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Lỗi server khi chia sẻ bài đăng.' });
    }
};


/**
 * @route GET /api/search/posts
 * @desc Tìm kiếm Bài viết
 */
exports.searchPosts = async (req, res) => {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập từ khóa tìm kiếm.' });
    }

    const sql = `
        SELECT p.*, u.full_name, u.avatar 
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.content LIKE ?
        ORDER BY p.created_at DESC
        LIMIT 10
    `;
    const searchPattern = `%${query}%`;

    try {
        const [results] = await db.promise().query(sql, [searchPattern]);
        res.json(results);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Lỗi server khi tìm kiếm bài đăng.' });
    }
};

/**
 * @desc Ẩn/Hiện bài viết (Chủ bài viết) - Chế độ "Chỉ mình tôi"
 */
exports.toggleVisibility = async (req, res) => {
    const { postId } = req.params;
    const { user_id } = req.body;
    try {
        const [post] = await db.promise().query('SELECT visibility FROM posts WHERE id = ? AND user_id = ?', [postId, user_id]);
        if (post.length === 0) return res.status(403).json({ success: false, message: "Bạn không có quyền." });

        const newStatus = post[0].visibility === 0 ? 1 : 0;
        await db.promise().query('UPDATE posts SET visibility = ? WHERE id = ?', [newStatus, postId]);

        res.json({ success: true, message: newStatus === 1 ? "Đã chuyển sang Chỉ mình tôi" : "Đã chuyển sang Công khai", visibility: newStatus });
    } catch (err) { res.status(500).json({ success: false }); }
};

/**
 * @desc Thêm/Hủy yêu thích (Toggle Favorite)
 */
exports.toggleFavorite = async (req, res) => {
    const { postId } = req.params;
    const { user_id } = req.body;
    try {
        // Kiểm tra xem đã tồn tại trong danh sách yêu thích chưa
        const [exists] = await db.promise().query(
            'SELECT id FROM favorite_posts WHERE user_id = ? AND post_id = ?',
            [user_id, postId]
        );

        if (exists.length > 0) {
            // NẾU CÓ: Phải thực hiện xóa (Hủy yêu thích)
            await db.promise().query('DELETE FROM favorite_posts WHERE user_id = ? AND post_id = ?', [user_id, postId]);
            return res.json({ success: true, action: 'removed', message: "Đã xóa khỏi danh sách yêu thích." });
        } else {
            // NẾU CHƯA: Thêm mới
            await db.promise().query('INSERT INTO favorite_posts (user_id, post_id) VALUES (?, ?)', [user_id, postId]);
            return res.json({ success: true, action: 'added', message: "Đã thêm vào danh sách yêu thích." });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

/**
 * @desc Ẩn/Mở bài viết cho riêng người xem (Toggle Personal Hide)
 */
exports.togglePersonalHide = async (req, res) => {
    const { postId } = req.params;
    const { user_id } = req.body;
    try {
        const [exists] = await db.promise().query(
            'SELECT id FROM hidden_posts_by_users WHERE user_id = ? AND post_id = ?',
            [user_id, postId]
        );

        if (exists.length > 0) {
            // Nếu bấm lần nữa thì "Mở ẩn"
            await db.promise().query('DELETE FROM hidden_posts_by_users WHERE id = ?', [exists[0].id]);
            return res.json({ success: true, action: 'unhidden', message: "Đã hiển thị lại bài viết." });
        } else {
            // Thực hiện ẩn
            await db.promise().query('INSERT INTO hidden_posts_by_users (user_id, post_id) VALUES (?, ?)', [user_id, postId]);
            return res.json({ success: true, action: 'hidden', message: "Đã ẩn bài viết khỏi bảng tin." });
        }
    } catch (err) { res.status(500).json({ success: false }); }
};

/**
 * @desc Ẩn bài viết khỏi Feed cá nhân (Người xem)
 */
exports.hidePostForUser = async (req, res) => {
    const { postId } = req.params;
    const { user_id } = req.body;
    try {
        // Lưu vào bảng hidden_posts_by_users để filter ở getPosts
        await db.promise().query('INSERT IGNORE INTO hidden_posts_by_users (user_id, post_id) VALUES (?, ?)', [user_id, postId]);
        res.json({ success: true, message: "Đã ẩn bài viết khỏi bảng tin." });
    } catch (err) { res.status(500).json({ success: false }); }
};

exports.unhidePostForUser = async (req, res) => {
    const { postId } = req.params;
    const { user_id } = req.body;
    try {
        await db.promise().query('DELETE FROM hidden_posts_by_users WHERE user_id = ? AND post_id = ?', [user_id, postId]);
        res.json({ success: true, message: "Đã hiển thị lại bài viết." });
    } catch (err) { res.status(500).json({ success: false }); }
};

/**
 * @route PUT /api/posts/:postId
 * @desc Sửa nội dung bài viết
 */
/**
 * @route PUT /api/posts/:postId
 * @desc Sửa nội dung bài viết (với hỗ trợ Media)
 */
exports.updatePost = async (req, res) => {
    const { postId } = req.params;
    const { user_id, content } = req.body;

    // Lấy type từ query (giống createPost)
    const type = req.query.type || 'post';
    const media_url = req.file ? `uploads/${type}s/${req.file.filename}` : undefined;

    try {
        let sql, params;

        if (media_url) {
            // Nếu có upload ảnh mới -> Cập nhật cả nội dung và ảnh
            sql = 'UPDATE posts SET content = ?, media_url = ? WHERE id = ? AND user_id = ?';
            params = [content, media_url, postId, user_id];
        } else {
            // Nếu không upload ảnh mới -> Chỉ cập nhật nội dung
            sql = 'UPDATE posts SET content = ? WHERE id = ? AND user_id = ?';
            params = [content, postId, user_id];
        }

        const [result] = await db.promise().query(sql, params);

        if (result.affectedRows > 0) {
            // Lấy lại dữ liệu mới nhất để trả về cho frontend cập nhật UI
            const [updatedPost] = await db.promise().query('SELECT * FROM posts WHERE id = ?', [postId]);
            res.json({ success: true, message: "Cập nhật bài viết thành công.", post: updatedPost[0] });
        } else {
            res.status(403).json({ success: false, message: "Không có quyền sửa bài này (hoặc bài không tồn tại)." });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi server." });
    }
};

/**
 * @desc Báo cáo vi phạm & Gửi thông báo cho Admin
 */
exports.reportPost = async (req, res) => {
    const { postId } = req.params;
    const { user_id, reason, detail } = req.body;
    try {
        // 1. Lưu báo cáo vào DB
        const [report] = await db.promise().query(
            'INSERT INTO post_reports (post_id, reporter_id, reason_type, detail) VALUES (?, ?, ?, ?)',
            [postId, user_id, reason, detail]
        );

        // 2. Lấy ID Admin của Group (hoặc Admin hệ thống nếu là bài cá nhân)
        const [post] = await db.promise().query('SELECT group_id, user_id FROM posts WHERE id = ?', [postId]);

        if (post.length > 0 && post[0].group_id) {
            // Gửi thông báo cho Admin Group thông qua Socket/Notification
            // Giả định adminId là chủ group
            const [group] = await db.promise().query('SELECT creator_id FROM groups WHERE id = ?', [post[0].group_id]);
            if (group.length > 0) {
                await notificationController.handleNotification(req, user_id, 'report_post', postId, group[0].creator_id);
            }
        }

        res.json({ success: true, message: "Báo cáo của bạn đã được gửi tới quản trị viên." });
    } catch (err) { res.status(500).json({ success: false }); }
};

/**
 * @desc Lấy danh sách bài viết người dùng đã yêu thích
 */
exports.getFavoritePosts = async (req, res) => {
    const { user_id } = req.query;
    try {
        const sql = `
            SELECT p.id, p.user_id, p.content, p.media_url, u.full_name, u.avatar 
            FROM posts p
            JOIN favorite_posts f ON p.id = f.post_id
            JOIN users u ON p.user_id = u.id
            WHERE f.user_id = ?
            ORDER BY f.created_at DESC
        `;
        const [posts] = await db.promise().query(sql, [user_id]);
        res.json(posts);
    } catch (err) {
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

/**
 * @desc Lấy danh sách bài viết người dùng đã ẩn (Personal Hide)
 */
exports.getHiddenPosts = async (req, res) => {
    const { user_id } = req.query;
    try {
        const sql = `
            SELECT p.id, p.user_id, p.content, p.media_url, u.full_name, u.avatar 
            FROM posts p
            JOIN hidden_posts_by_users h ON p.id = h.post_id
            JOIN users u ON p.user_id = u.id
            WHERE h.user_id = ?
            ORDER BY p.created_at DESC
        `;
        const [posts] = await db.promise().query(sql, [user_id]);
        res.json(posts);
    } catch (err) {
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

/**
 * @route GET /api/posts/:postId/check
 * @desc Kiểm tra sự tồn tại của bài viết
 */
exports.checkPostExists = async (req, res) => {
    const { postId } = req.params;
    try {
        const [post] = await db.promise().query(
            'SELECT user_id, group_id, visibility FROM posts WHERE id = ?',
            [postId]
        );
        if (post.length > 0) {
            res.json({
                exists: true,
                ownerId: post[0].user_id,
                groupId: post[0].group_id,
                visibility: post[0].visibility
            });
        } else {
            res.json({ exists: false });
        }
    } catch (err) { res.status(500).json({ exists: false }); }
};

// ============================================
// EXPORTS
// ============================================

module.exports = exports;