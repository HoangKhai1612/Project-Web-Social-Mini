const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Cấu hình lưu trữ linh hoạt theo loại file
 *
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        /**
         * Lấy 'type' từ query parameter (vì req.body chưa parse đầy đủ lúc Multer chạy).
         * Ví dụ: 'avatar', 'cover', 'post', hoặc 'message'.
         */
        const type = req.query.type || req.body.type || 'other';

        /**
         * Tạo đường dẫn động dựa trên cấu hình folder hiện tại.
         * Thư mục sẽ là: backend/uploads/avatars/, backend/uploads/messages/, v.v.
         */
        const dir = path.join(__dirname, `../uploads/${type}s/`);

        /**
         * Tự động tạo thư mục nếu chưa tồn tại (recursive giúp tạo thư mục con).
         */
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        /**
         * Cấu trúc tên file: [Loại]-[UserId]-[Thời gian]-[Ngẫu nhiên].ext
         * Đảm bảo tính duy nhất và không bị ghi đè.
         */
        const type = req.query.type || req.body.type || 'img';
        const userId = req.query.user_id || req.body.user_id || 'unknown';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

        /**
         * Giữ nguyên đuôi file gốc và chuyển về chữ thường.
         */
        const ext = path.extname(file.originalname).toLowerCase();

        cb(null, `${type}-${userId}-${uniqueSuffix}${ext}`);
    }
});

/**
 * Bộ lọc định dạng file để đảm bảo an toàn hệ thống.
 */
const fileFilter = (req, file, cb) => {
    /**
     * Chấp nhận các định dạng ảnh phổ biến.
     */
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Định dạng file không hợp lệ! Chỉ chấp nhận ảnh (jpg, png, gif, webp).'), false);
    }
};

/**
 * Khởi tạo Middleware Multer với giới hạn kích thước.
 */
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // Nâng lên 10MB để hỗ trợ ảnh chất lượng cao.
        files: 1 // Chỉ xử lý 1 file cho mỗi lần gọi API.
    }
});

module.exports = upload;