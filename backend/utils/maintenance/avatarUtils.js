const db = require('../../config/database');
const fs = require('fs');
const path = require('path');

/**
 * Scripts bảo trì và kiểm tra dữ liệu Avatar
 */

// 1. Kiểm tra sự đồng bộ giữa DB và Disk
async function auditAvatars() {
    try {
        const [users] = await db.promise().query('SELECT id, full_name, avatar FROM users');

        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            console.log("Uploads dir does not exist!");
            return;
        }
        const files = fs.readdirSync(uploadDir);

        console.log("--- DISK FILES (First 10) ---");
        console.log(files.slice(0, 10));
        console.log(`Total files: ${files.length}`);

        console.log("\n--- DB RECORDS vs DISK CHECK ---");
        users.forEach(u => {
            if (!u.avatar) {
                // console.log(`[${u.id}] ${u.full_name}: NULL`);
                return;
            }

            // Normalize DB path to filename
            // DB might be 'uploads/filename', 'uploads/avatars/filename', 'filename'
            let filename = u.avatar;
            filename = filename.replace(/\\/g, '/'); // fix windows slash
            filename = filename.split('/').pop(); // get basename

            const exists = files.includes(filename);

            if (!exists || u.avatar.includes('avatars/')) {
                console.log(`[${u.id}] ${u.full_name}`);
                console.log(`    DB:   '${u.avatar}'`);
                console.log(`    File: '${filename}'`);
                console.log(`    Found on disk? ${exists ? 'YES' : 'NO'}`);
            }
        });

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

// 2. Sửa đường dẫn Avatar trong DB (Migration)
async function fixAvatarPaths() {
    console.log("--- BẮT ĐẦU SỬA ĐƯỜNG DẪN AVATAR --------------");
    try {
        const [users] = await db.promise().query('SELECT id, avatar FROM users WHERE avatar LIKE "%avatars/%" OR avatar LIKE "%covers/%"');
        console.log(`🔍 Tìm thấy ${users.length} user có đường dẫn cũ (chứa subfolder avatars/ hoặc covers/).`);

        for (const u of users) {
            let newPath = u.avatar.replace('uploads/avatars/', 'uploads/')
                .replace('uploads/covers/', 'uploads/')
                .replace('avatars/', 'uploads/')
                .replace('covers/', 'uploads/');

            // Đảm bảo bắt đầu bằng uploads/
            if (!newPath.startsWith('uploads/') && !newPath.startsWith('http')) {
                newPath = `uploads/${newPath}`;
            }

            await db.promise().query('UPDATE users SET avatar = ? WHERE id = ?', [newPath, u.id]);
            console.log(`🛠️ User ${u.id}: Đã sửa thành '${newPath}'`);
        }
        console.log("✅ Đã hoàn tất sửa lỗi đường dẫn.");
    } catch (err) {
        console.error("Lỗi:", err);
    } finally {
        console.log("-----------------------------------------------");
    }
}

// Chạy script dựa trên tham số dòng lệnh
// Cách dùng: node utils/maintenance/avatarUtils.js --audit HOẶC --fix
const args = process.argv.slice(2);
if (args.includes('--fix')) {
    fixAvatarPaths().then(() => process.exit());
} else {
    auditAvatars().then(() => process.exit());
}
