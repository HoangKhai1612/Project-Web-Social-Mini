require('dotenv').config(); // Nạp các biến từ file .env vào process.env
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306 // Thêm cổng mặc định nếu cần
});

db.connect(err => {
    if (err) {
        console.error('Lỗi kết nối DB: ' + err.stack);
        return;
    }
    console.log('Đã kết nối MySQL thành công qua môi trường .env!');
});

module.exports = db;