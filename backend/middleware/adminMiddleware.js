const jwt = require('jsonwebtoken');
require('dotenv').config();

const requireAdmin = (req, res, next) => {
    // 1. Kiểm tra xem user đã được authenticate chưa (từ authMiddleware)
    // Giả sử authMiddleware đã chạy trước và gán req.user
    // Nếu chưa dùng authMiddleware chung, ta có thể verify lại token ở đây hoặc assume chain: auth -> admin

    // Để an toàn, ta check lại token hoặc check property req.user đã được populate
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập.' });
    }

    try {
        if (!req.user) {
            // Nếu chưa có req.user, verify token
            const bearerToken = token.split(' ')[1];
            if (!bearerToken) return res.status(401).json({ success: false, message: 'Token không hợp lệ.' });

            const decoded = jwt.verify(bearerToken, process.env.JWT_SECRET);
            req.user = decoded;
        }

        console.log('[AdminMiddleware] Checking user:', req.user); // [DEBUG]

        // 2. Check ROLE
        if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            console.log('[AdminMiddleware] FAILED: Role is', req.user.role); // [DEBUG]
            return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập Admin.' });
        }

        next();

    } catch (err) {
        console.error('[AdminMiddleware] Error:', err.message); // [DEBUG]
        return res.status(403).json({ success: false, message: 'Phiên đăng nhập hết hạn hoặc không hợp lệ.' });
    }
};

module.exports = requireAdmin;
