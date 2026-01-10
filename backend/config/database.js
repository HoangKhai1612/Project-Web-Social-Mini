const mysql = require('mysql2');

// Thay đổi thông tin kết nối sau:
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      // Thay bằng user của bạn
    password: '',      // Thay bằng pass của bạn
    database: 'social_db'
});

db.connect(err => {
    if (err) {
        console.error('Lỗi kết nối DB: ' + err.stack);
        throw err;
    }
    console.log('Đã kết nối MySQL thành công!');
});

module.exports = db;