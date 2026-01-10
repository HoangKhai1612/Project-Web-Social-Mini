const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authMiddleware = async (req, res, next) => {
    // Lấy token từ header Authorization (dạng: Bearer TOKEN)
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Bạn chưa đăng nhập. Truy cập bị từ chối!' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // [FIX] Kiểm tra xem user có bị xóa/disable server-side không
        const userId = decoded.userId || decoded.id; // Support both conventions
        const [rows] = await db.promise().query('SELECT id, role, is_locked, ban_until, ban_reason FROM users WHERE id = ?', [userId]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại.' });
        }

        const user = rows[0];

        // 1. Check Locked/Banned Permanent
        if (user.is_locked) {
            return res.status(403).json({ success: false, message: `Tài khoản của bạn đã bị KHÓA. Lý do: ${user.ban_reason || 'Vi phạm điều khoản'}` });
        }

        // 2. Check Temporary Ban
        if (user.ban_until && new Date(user.ban_until) > new Date()) {
            return res.status(403).json({ success: false, message: `Tài khoản tạm thời bị khóa đến ${new Date(user.ban_until).toLocaleString()}. Lý do: ${user.ban_reason}` });
        }

        // Update req.user with latest info structure
        req.user = {
            id: user.id,
            userId: user.id,
            role: user.role
        };

        next();
    } catch (error) {
        console.error("JWT Verify Error:", error.message);
        return res.status(403).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
};

module.exports = authMiddleware;
