require('dotenv').config(); // Load env variables
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const db = require('./config/database');
const mainRouter = require('./routes/index');

const app = express();
const server = http.createServer(app);

// --- HELPER FUNCTION: Broadcast trạng thái chỉ cho BẠN BÈ ---
const notifyFriendsStatus = async (userId, status) => {
    try {
        // 1. Lấy danh sách ID bạn bè
        const sql = `
            SELECT CASE 
                WHEN sender_id = ? THEN receiver_id 
                ELSE sender_id 
            END as friend_id
            FROM friendships 
            WHERE (sender_id = ? OR receiver_id = ?) 
            AND status = 'accepted'
        `;
        const [rows] = await db.promise().query(sql, [userId, userId, userId]);

        if (rows.length === 0) return;

        // 2. Lặp qua bạn bè và gửi event nếu họ đang online
        rows.forEach(row => {
            const friendId = String(row.friend_id);
            if (onlineUsers.has(friendId)) {
                onlineUsers.get(friendId).forEach(socketId => {
                    io.to(socketId).emit('user_status_changed', { userId, status });
                });
            }
        });
    } catch (err) {
        console.error(`Lỗi notifyFriendsStatus cho user ${userId}:`, err);
    }
};

// --- 1. Cấu hình Socket.io ---
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Helper để Controller gọi khi User đổi Setting
io.handlePrivacyChange = (userId, showOnline) => {
    const uid = String(userId);
    if (onlineUsers.has(uid)) {
        const socketIds = onlineUsers.get(uid);
        // 1. Cập nhật state cho tất cả socket của user này
        socketIds.forEach(sid => {
            const s = io.sockets.sockets.get(sid);
            if (s) s.showOnline = showOnline;
        });

        // 2. Broadcast trạng thái mới cho bạn bè
        // Nếu chuyển thành OFF -> Gửi offline
        // Nếu chuyển thành ON -> Gửi online
        notifyFriendsStatus(userId, showOnline ? 'online' : 'offline');
    }
};

// Gắn đối tượng IO vào app để truy cập từ các Controller (req.app.get('io'))
app.set('io', io);

// --- 2. Middleware & Static Files ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Cấu hình thư mục tĩnh để xem ảnh/video đã upload
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const groupRoutes = require('./routes/groupRoutes');
const adminRoutes = require('./routes/adminRoutes'); // [NEW]
const checkMaintenance = require('./middleware/maintenanceMiddleware'); // [NEW]

// --- 3. Định tuyến API ---
app.use(checkMaintenance); // Apply global maintenance check
app.use('/api', mainRouter);
app.use('/api', adminRoutes); // Register Admin Routes

app.get('/', (req, res) => {
    res.send('<h1>SocialVN Backend đang chạy OK!</h1>');
});

// --- 4. Logic Socket.io (Realtime Status, Chat, Reply & Reactions) ---
const onlineUsers = new Map(); // userId -> Set(socketId)

io.on('connection', (socket) => {
    // Log khi có một kết nối socket mới
    console.log(`Kết nối mới: ${socket.id}`);

    /**
     * Sự kiện Đăng ký User: Join vào phòng cá nhân và các phòng nhóm
     */
    socket.on('register_user', async (userId) => {
        socket.userId = userId;

        try {
            // Lấy cấu hình quyền riêng tư (Show Online Status) từ DB
            const [user] = await db.promise().query('SELECT user_info FROM users WHERE id = ?', [userId]);
            const userInfo = user[0]?.user_info ? (typeof user[0].user_info === 'string' ? JSON.parse(user[0].user_info) : user[0].user_info) : {};
            const showOnline = userInfo.online_status !== false; // Mặc định là bật

            socket.showOnline = showOnline;

            // Quản lý trạng thái Online
            if (!onlineUsers.has(String(userId))) {
                onlineUsers.set(String(userId), new Set());
            }
            onlineUsers.get(String(userId)).add(socket.id);

            // Broadcast trạng thái online (nếu được phép và đây là socket đầu tiên)
            if (showOnline && onlineUsers.get(String(userId)).size === 1) {
                // io.emit('user_status_changed', { userId, status: 'online' }); // [REMOVED]
                notifyFriendsStatus(userId, 'online');
            }
            // Update Admin Dashboard Realtime
            io.emit('admin_online_count', onlineUsers.size);
        } catch (err) {
            console.error('Lỗi khi register_user:', err);
        }

        // Join vào phòng cá nhân
        socket.join(String(userId));
        console.log(`User ${userId} đã đăng ký và join phòng cá nhân.`);

        try {
            // Lấy danh sách các nhóm mà user là thành viên
            const [groups] = await db.promise().query(
                'SELECT group_chat_id FROM group_chat_members WHERE user_id = ?',
                [userId]
            );

            // Tham gia vào từng room của nhóm
            groups.forEach(g => {
                const roomName = `group_${g.group_chat_id}`;
                socket.join(roomName);
                console.log(`User ${userId} đã tham gia room: ${roomName}`);
            });
        } catch (err) {
            console.error(`Lỗi khi User ${userId} tự động join group room:`, err);
        }
    });

    /**
     * Sự kiện Gửi tin nhắn (Hỗ trợ Media, Reply)
     */
    socket.on('send_message', async (data) => {
        const { senderId, receiverId, message, isGroup, mediaUrl, replyToId } = data;

        if ((!message || message.trim() === "") && !mediaUrl) return;
        try {
            // 1. Lấy tên người gửi
            const [user] = await db.promise().query('SELECT full_name FROM users WHERE id = ?', [senderId]);
            const senderName = user[0]?.full_name || "Thành viên";

            // 2. Xử lý logic Reply
            let replyContent = null;
            if (replyToId) {
                const [replyMsg] = await db.promise().query('SELECT message, media_url FROM messages WHERE id = ?', [replyToId]);
                replyContent = replyMsg[0]?.message || (replyMsg[0]?.media_url ? "[Hình ảnh]" : "Tin nhắn đã bị xóa");
            }

            // 3. Lưu tin nhắn vào Database
            const sqlInsert = `
                INSERT INTO messages (sender_id, receiver_id, message, media_url, reply_to_id, created_at) 
                VALUES (?, ?, ?, ?, ?, NOW())`;
            const [result] = await db.promise().query(sqlInsert, [senderId, receiverId, message, mediaUrl, replyToId]);

            const messageData = {
                id: result.insertId,
                senderId,
                sender_name: senderName,
                message,
                media_url: mediaUrl,
                reply_to_id: replyToId,
                reply_content: replyContent,
                receiverId,
                created_at: new Date(),
                isGroup,
                reactions: {}
            };

            // 4. Phát tin nhắn realtime theo phòng
            if (isGroup) {
                io.to(`group_${receiverId}`).emit('receive_message', messageData);
            } else {
                io.to(String(receiverId)).emit('receive_message', messageData);
                io.to(String(senderId)).emit('receive_message', messageData);
            }
        } catch (err) {
            console.error('Lỗi khi xử lý gửi tin nhắn:', err);
        }
    });

    /**
     * Sự kiện Thả cảm xúc (Reactions)
     */
    socket.on('send_reaction', (data) => {
        const { messageId, receiverId, reactions, isGroup } = data;
        const target = isGroup ? `group_${receiverId}` : String(receiverId);

        io.to(target).emit('update_reactions', { messageId, reactions });

        if (!isGroup) {
            socket.emit('update_reactions', { messageId, reactions });
        }
    });

    /**
     * Trạng thái đang nhập...
     */
    socket.on('typing', (data) => {
        const { senderId, receiverId, isTyping, isGroup } = data;
        const target = isGroup ? `group_${receiverId}` : String(receiverId);
        socket.to(target).emit('is_typing', { senderId, isTyping, isGroup });
    });

    /**
     * Kiểm tra trạng thái Online tập trung (Có bảo mật)
     */
    socket.on('check_online_status', async (userIds, callback) => {
        const requesterId = socket.userId;
        const statusMap = {};

        // Mặc định tất cả là offline
        userIds.forEach(uid => statusMap[uid] = 'offline');

        if (!requesterId) {
            if (callback) callback(statusMap);
            return;
        }

        try {
            // 1. Lọc ra những người là BẠN BÈ của requester (hoặc chính là requester)
            // Chỉ trả về online cho bạn bè.
            const sql = `
                SELECT CASE 
                    WHEN sender_id = ? THEN receiver_id 
                    ELSE sender_id 
                END as friend_id
                FROM friendships 
                WHERE (sender_id = ? OR receiver_id = ?) 
                AND status = 'accepted'
            `;
            const [friends] = await db.promise().query(sql, [requesterId, requesterId, requesterId]);
            const friendSet = new Set(friends.map(f => String(f.friend_id)));
            friendSet.add(String(requesterId)); // Luôn xem được chính mình

            // 2. Kiểm tra status thực tế dựa trên Privacy
            userIds.forEach(uid => {
                const targetId = String(uid);

                // Điều kiện 1: Phải là bạn bè (hoặc chính mình)
                if (!friendSet.has(targetId)) return;

                // Điều kiện 2: Target phải đang có kết nối
                if (onlineUsers.has(targetId)) {
                    // Điều kiện 3: Target phải bật "Active Status" (ít nhất 1 socket bật)
                    const socketIds = onlineUsers.get(targetId);
                    let isVisible = false;
                    for (const sId of socketIds) {
                        const s = io.sockets.sockets.get(sId);
                        if (s && s.showOnline) {
                            isVisible = true;
                            break;
                        }
                    }

                    if (isVisible) {
                        statusMap[targetId] = 'online';
                    }
                }
            });

            if (callback) callback(statusMap);

        } catch (err) {
            console.error("Lỗi check_online_status:", err);
            if (callback) callback(statusMap);
        }
    });

    // Log khi người dùng ngắt kết nối
    socket.on('disconnect', () => {
        console.log(`User ngắt kết nối: ${socket.id}`);
        if (socket.userId) {
            const userId = String(socket.userId);
            if (onlineUsers.has(userId)) {
                onlineUsers.get(userId).delete(socket.id);
                if (onlineUsers.get(userId).size === 0) {
                    onlineUsers.delete(userId);
                    // Chỉ broadcast offline nếu trước đó họ đang hiển thị online
                    if (socket.showOnline) {
                        // io.emit('user_status_changed', { userId, status: 'offline' }); // [REMOVED]
                        notifyFriendsStatus(userId, 'offline');
                    }
                    // [NEW] Update Admin Dashboard Realtime
                    io.emit('admin_online_count', onlineUsers.size);
                }
            }
        }
    });
});

// --- 5. Xử lý lỗi tập trung ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Có lỗi xảy ra tại hệ thống!' });
});

// --- 6. Khởi chạy Server ---
const postController = require('./controllers/postController'); // Import để chạy cleanup
const adminController = require('./controllers/adminController'); // [New] Import admin controller

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`-----------------------------------------------`);
    console.log(`🚀 SocialVN Backend đang chạy tại: http://localhost:${PORT}`);
    console.log(`📡 Socket.io (Media & Reply) đã sẵn sàng.`);
    console.log(`-----------------------------------------------`);

    // [NEW] Khởi động Master Cleanup (Dọn dẹp hệ thống tự động hóa)
    const { runCleanup } = require('./jobs/cleanupSystem');
    // Chạy một lần khi khởi động server
    runCleanup().catch(err => console.error("Initial Cleanup Error:", err));
});