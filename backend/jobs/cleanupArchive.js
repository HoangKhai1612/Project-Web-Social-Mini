const db = require('../config/database');
const cron = require('node-cron');

/**
 * @desc Master System Cleanup Job
 * Chạy định kỳ để dọn dẹp hệ thống:
 * 1. Xóa vĩnh viễn các bài viết đã xóa mềm quá 30 ngày.
 * 2. Xóa các báo cáo cũ đã giải quyết quá 30 ngày.
 * 3. Xóa các file ảnh rác không còn attach vào post/user nào (Optional - Advanced).
 */
const runCleanup = async () => {
    console.log('🔄 [CRON] Starting Master System Cleanup...');

    // 1. Xóa bài viết đã xóa mềm > 30 ngày (Soft Delete -> Hard Delete)
    const sqlSoftDelete = `
        DELETE FROM posts 
        WHERE deleted_at IS NOT NULL 
        AND deleted_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    `;

    // 2. Xóa các báo cáo đã giải quyết > 30 ngày
    const sqlReports = `
        DELETE FROM reports 
        WHERE status = 'resolved' 
        AND resolved_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    `;

    // 3. Xóa Archive cũ > 1 năm (Ví dụ chính sách lưu trữ)
    const sqlArchives = `
        DELETE FROM archived_posts 
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 365 DAY)
    `;

    try {
        const results = await Promise.all([
            db.promise().query(sqlSoftDelete),
            db.promise().query(sqlReports),
            db.promise().query(sqlArchives)
        ]);

        console.log(`✅ [CRON] Cleanup Completed.`);
        console.log(`   - Posts Permanently Deleted: ${results[0][0].affectedRows}`);
        console.log(`   - Reports Cleaned: ${results[1][0].affectedRows}`);
        console.log(`   - Archives Purged: ${results[2][0].affectedRows}`);
    } catch (err) {
        console.error("❌ [CRON] Cleanup Failed:", err);
        throw err;
    }
};

module.exports = { runCleanup };
