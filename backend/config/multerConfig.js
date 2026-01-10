const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Cấu hình lưu trữ tệp tin
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // ✅ Lấy type từ query (?type=message) vì body có thể chưa parse xong
        const type = req.query.type || 'other';
        const dir = path.join(__dirname, `../uploads/${type}s/`);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const type = req.query.type || 'img';
        const userId = req.query.user_id || 'unknown';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();

        cb(null, `${type}-${userId}-${uniqueSuffix}${ext}`);
    }
});

/**
 * Bộ lọc định dạng tệp tin
 */
const fileFilter = (req, file, cb) => {
    // Chấp nhận các loại ảnh và video phổ biến
    const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Định dạng không hợp lệ! Chỉ chấp nhận ảnh (jpg, png, gif, webp) hoặc video (mp4, webm).'), false);
    }
};

/**
 * Khởi tạo middleware Multer
 */
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // Giới hạn tối đa 100MB cho cả video
        files: 1 // Xử lý 1 file cho mỗi lần gọi API
    }
});

module.exports = upload;