const db = require('../config/database');
const fs = require('fs');
const path = require('path');

// 1. MODULE TỔNG QUAN (DASHBOARD OVERVIEW)
exports.getDashboardStats = async (req, res) => {
    try {
        // 1. QUICK STATS
        const [userCount] = await db.promise().query('SELECT COUNT(*) as total FROM users');
        const [postCount] = await db.promise().query('SELECT COUNT(*) as total FROM posts WHERE created_at >= CURDATE()');
        const [reportCount] = await db.promise().query('SELECT COUNT(*) as total FROM reports WHERE status = "pending"');

        // 2. GROWTH CHART (7 DAYS)
        // Helper to get last 7 days dates
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }

        // Fetch Data grouped by Date
        const [usersGrowth] = await db.promise().query(`
            SELECT DATE(created_at) as date, COUNT(*) as count 
            FROM users 
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) 
            GROUP BY DATE(created_at)
        `);

        // Fetch Interactions (Likes + Comments)
        const [interactionsGrowth] = await db.promise().query(`
            SELECT date, SUM(count) as count FROM (
                SELECT DATE(created_at) as date, COUNT(*) as count FROM reactions WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY DATE(created_at)
                UNION ALL
                SELECT DATE(created_at) as date, COUNT(*) as count FROM comments WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY DATE(created_at)
            ) as combined
            GROUP BY date
        `);

        // Map data to the 7-day array
        const chartData = dates.map(dateStr => {
            const u = usersGrowth.find(x => x.date && x.date.toISOString().startsWith(dateStr));
            const i = interactionsGrowth.find(x => x.date === dateStr || (x.date && x.date.toISOString && x.date.toISOString().startsWith(dateStr))); // Handle various date formats returned by driver
            return {
                date: dateStr,
                new_users: u ? u.count : 0,
                interactions: i ? Number(i.count) : 0 // Ensure number
            };
        });

        // 3. RECENT ACTIVITIES
        const [recentActivities] = await db.promise().query('SELECT full_name, created_at FROM users ORDER BY created_at DESC LIMIT 5');

        res.json({
            success: true,
            stats: {
                users: userCount[0].total,
                new_posts: postCount[0].total,
                pending_reports: reportCount[0].total
            },
            chart: chartData,
            activities: recentActivities.map(u => ({
                message: `Người dùng mới: ${u.full_name}`,
                time: u.created_at
            }))
        });
    } catch (err) {
        console.error("Admin Stats Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};



// 2. MODULE QUẢN LÝ NGƯỜI DÙNG
exports.getUsers = async (req, res) => {
    const q = req.query.q || '';
    const currentUserId = req.user.userId || req.user.id;
    try {
        const sql = `
            SELECT id, username, full_name, role, is_locked, avatar, gender, created_at 
            FROM users 
            WHERE username LIKE ? OR full_name LIKE ?
            ORDER BY (id = ?) DESC, created_at DESC LIMIT 50
        `;
        const param = `%${q}%`;
        const [users] = await db.promise().query(sql, [param, param, currentUserId]);
        res.json({ success: true, users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.toggleUserLock = async (req, res) => {
    const { userId, isLocked } = req.body;
    try {
        // Prevent banning self
        if (String(userId) === String(req.user.id)) return res.status(400).json({ message: "Không thể khóa chính mình." });

        await db.promise().query('UPDATE users SET is_locked = ? WHERE id = ?', [isLocked ? 1 : 0, userId]);

        // Log activity (Audit)
        // await logAudit(req.user.id, userId, isLocked ? 'LOCK_USER' : 'UNLOCK_USER');

        res.json({ success: true, message: isLocked ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản." });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

exports.getUserDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const [user] = await db.promise().query('SELECT * FROM users WHERE id = ?', [id]);
        if (!user.length) return res.status(404).json({ message: "Not found" });
        res.json({ success: true, user: user[0] });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

// 3. MODULE QUẢN LÝ BÁO CÁO (REPORTS)
exports.getReports = async (req, res) => {
    try {
        const sql = `
            SELECT r.*, 
                   reporter.full_name as reporter_name, 
                   -- Determine Violator Name
                   CASE 
                       WHEN r.target_type = 'user' THEN target_u.full_name
                       WHEN r.target_type = 'post' THEN post_author.full_name
                       ELSE 'Unknown'
                   END as violator_name,
                   -- Determine Violator ID
                   CASE 
                       WHEN r.target_type = 'user' THEN r.target_id
                       WHEN r.target_type = 'post' THEN p.user_id
                       ELSE NULL
                   END as violator_id,
                   -- Determine Violation Count
                   CASE 
                       WHEN r.target_type = 'user' THEN target_u.violation_count
                       WHEN r.target_type = 'post' THEN post_author.violation_count
                       ELSE 0
                   END as violation_count,
                   p.content as post_content
            FROM reports r
            LEFT JOIN users reporter ON r.reporter_id = reporter.id
            LEFT JOIN users target_u ON r.target_type = 'user' AND r.target_id = target_u.id
            LEFT JOIN posts p ON (r.target_type = 'post' AND r.target_id = p.id) OR (r.post_id IS NOT NULL AND r.post_id = p.id)
            LEFT JOIN users post_author ON p.user_id = post_author.id
            ORDER BY r.created_at DESC
        `;
        const [reports] = await db.promise().query(sql);
        res.json({ success: true, reports });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

exports.resolveReport = async (req, res) => {
    const { reportId, action } = req.body; // action: 'dismiss', 'delete_content', 'warn'
    try {
        let status = 'resolved';

        if (action === 'delete_content') {
            const [report] = await db.promise().query('SELECT post_id FROM reports WHERE id = ?', [reportId]);
            if (report[0]?.post_id) {
                await db.promise().query('DELETE FROM posts WHERE id = ?', [report[0].post_id]);
                // update all reports for this post
                await db.promise().query('UPDATE reports SET status = "resolved" WHERE post_id = ?', [report[0].post_id]);
            }
        } else if (action === 'dismiss') {
            status = 'dismissed';
            await db.promise().query('UPDATE reports SET status = ? WHERE id = ?', [status, reportId]);
        } else if (action === 'warn') {
            // Logic send notification warning
        }

        res.json({ success: true, message: "Đã xử lý báo cáo." });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

// 4. MODULE QUẢN LÝ NỘI DUNG & MEDIA
exports.getAllPosts = async (req, res) => {
    try {
        const [posts] = await db.promise().query(`
            SELECT p.id, p.content, p.image_url, p.created_at, u.full_name, u.username 
            FROM posts p JOIN users u ON p.user_id = u.id 
            ORDER BY p.created_at DESC LIMIT 50
        `);
        res.json({ success: true, posts });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

exports.deletePostAdmin = async (req, res) => {
    const { id } = req.params;
    try {
        await db.promise().query('DELETE FROM posts WHERE id = ?', [id]);
        res.json({ success: true, message: "Đã xóa bài viết." });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

// 5. MODULE HỆ THỐNG
exports.getSystemLogs = async (req, res) => {
    try {
        const [logs] = await db.promise().query(`
            SELECT al.action, al.created_at as timestamp, u.username as user, u.role
            FROM audit_logs al
            JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT 50
        `);

        res.json({
            success: true,
            logs
        });
    } catch (err) {
        console.error("Get Logs Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// VIOLATION ENFORCEMENT & REPORTING
// User submits report
exports.submitReport = async (req, res) => {
    const { target_type, target_id, post_id, reason, description } = req.body;
    // Fix: use req.user.userId or req.user.id depending on what authMiddleware provides.
    // Based on previous files, auth assigns `decoded` to `req.user`.
    // If other controllers use `req.user.userId`, we should try that first, falling back to id.
    const reporter_id = req.user.userId || req.user.id;

    if (!target_type || !target_id || !reason) {
        return res.status(400).json({ message: "Thiếu thông tin báo cáo." });
    }

    // Logic for post_id: if reporting a post, target_id IS the post_id
    const finalPostId = target_type === 'post' ? target_id : (post_id || null);

    try {
        const sql = `INSERT INTO reports (reporter_id, target_type, target_id, post_id, reason, description, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`;
        await db.promise().query(sql, [reporter_id, target_type, target_id, finalPostId, reason, description || null]);
        res.json({ success: true, message: "Báo cáo đã được gửi." });
    } catch (err) {
        console.error("Submit Report Error:", err);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
};

// Enforce violation penalty
exports.enforceViolation = async (req, res) => {
    const { reportId, userId, penaltyLevel, adminNote } = req.body;
    const adminId = req.user.userId || req.user.id;

    try {
        // 1. Get user's current violation count
        const [user] = await db.promise().query(
            'SELECT violation_count FROM users WHERE id = ?',
            [userId]
        );

        const newCount = (user[0]?.violation_count || 0) + 1;

        // 2. Calculate penalty duration
        let banUntil = null;
        let restrictionLevel = 'none';

        switch (penaltyLevel) {
            case 'warning':
                restrictionLevel = 'warning';
                break;
            case 'restricted_3d':
                banUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                restrictionLevel = 'restricted_3d';
                break;
            case 'suspended_7d':
                banUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                restrictionLevel = 'suspended_7d';
                break;
            case 'locked_30d':
                banUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                restrictionLevel = 'locked_30d';
                break;
            case 'banned_permanent':
                restrictionLevel = 'banned_permanent';
                break;
        }

        // 3. Update user record
        await db.promise().query(`
            UPDATE users 
            SET violation_count = ?,
                last_violation_date = NOW(),
                ban_until = ?,
                ban_reason = ?,
                restriction_level = ?,
                is_locked = ?
            WHERE id = ?
        `, [
            newCount,
            banUntil,
            adminNote,
            restrictionLevel,
            (penaltyLevel === 'locked_30d' || penaltyLevel === 'banned_permanent') ? 1 : 0,
            userId
        ]);

        // 4. Record in violation history
        await db.promise().query(`
            INSERT INTO violation_history 
            (user_id, report_id, violation_type, penalty_level, admin_id, reason, expires_at)
            VALUES (?, ?, 'community_violation', ?, ?, ?, ?)
        `, [userId, reportId, penaltyLevel, adminId, adminNote, banUntil]);

        // 5. Update report status
        await db.promise().query(`
            UPDATE reports 
            SET status = 'resolved',
                resolved_at = NOW(),
                resolved_by = ?,
                admin_note = ?
            WHERE id = ?
        `, [adminId, adminNote, reportId]);

        // 5.1 Fetch report details for notification
        const [reportRows] = await db.promise().query('SELECT reason, description, target_type FROM reports WHERE id = ?', [reportId]);
        const reportReason = reportRows[0]?.reason || 'Vi phạm tiêu chuẩn cộng đồng';

        // 6. Send notification
        const penaltyNames = {
            'warning': 'Cảnh cáo',
            'restricted_3d': 'Hạn chế 3 ngày',
            'suspended_7d': 'Đình chỉ 7 ngày',
            'locked_30d': 'Khóa 30 ngày',
            'banned_permanent': 'Khóa vĩnh viễn'
        };

        const notifContent = `⚠️ TÀI KHOẢN BỊ XỬ PHẠT: ${penaltyNames[penaltyLevel] || penaltyLevel}.\n` +
            `📝 Lý do vi phạm: ${reportReason}.\n` +
            (adminNote && adminNote !== 'Không có ghi chú' ? `📌 Ghi chú từ Admin: ${adminNote}` : '');

        // Based on DB check, it is 'receiver_id'
        await db.promise().query(`
            INSERT INTO notifications (receiver_id, content, type, created_at)
            VALUES (?, ?, 'system', NOW())
        `, [
            userId,
            notifContent
        ]);

        res.json({
            success: true,
            message: `Đã xử phạt người dùng: ${penaltyNames[penaltyLevel]}`,
            newViolationCount: newCount
        });

    } catch (err) {
        console.error("Enforce Violation Error:", err);
        res.status(500).json({ success: false, message: 'Lỗi xử lý vi phạm' });
    }
};

// Get user violation history
exports.getUserViolations = async (req, res) => {
    const { userId } = req.params;

    try {
        const [history] = await db.promise().query(`
            SELECT vh.*, u.full_name as admin_name
            FROM violation_history vh
            LEFT JOIN users u ON vh.admin_id = u.id
            WHERE vh.user_id = ?
            ORDER BY vh.created_at DESC
        `, [userId]);

        res.json({ success: true, violations: history });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

// Dismiss Report
exports.dismissReport = async (req, res) => {
    const { id } = req.params;
    const adminId = req.user.userId || req.user.id;

    try {
        await db.promise().query(`
            UPDATE reports 
            SET status = 'dismissed',
                resolved_at = NOW(),
                resolved_by = ?
            WHERE id = ?
        `, [adminId, id]);
        res.json({ success: true, message: "Đã bỏ qua báo cáo." });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};
// [REMOVED] cleanupOldReports logic moved to jobs/cleanupArchive.js

// ============================================
// SYSTEM SETTINGS
// ============================================
exports.getSystemSettings = async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT * FROM sys_settings');
        const settings = {};
        rows.forEach(r => settings[r.setting_key] = r.setting_value);
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

exports.updateSystemSetting = async (req, res) => {
    const { key, value } = req.body;
    try {
        // Upsert setting
        const sql = `INSERT INTO sys_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`;
        await db.promise().query(sql, [key, String(value)]);

        // Broadcast maintenance mode change if applicable
        if (key === 'maintenance_mode') {
            req.app.get('io').emit('maintenance_mode', value === 'true');
        }

        res.json({ success: true, message: 'Updated setting.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

// ============================================
// 6. ADMIN MANAGEMENT (SUPER ADMIN ONLY)
// ============================================
exports.getAdmins = async (req, res) => {
    try {
        const [admins] = await db.promise().query("SELECT id, username, full_name, role, avatar, created_at FROM users WHERE role IN ('admin', 'super_admin') ORDER BY created_at ASC");
        res.json({ success: true, admins });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

exports.createAdmin = async (req, res) => {
    const { username, password, full_name, role } = req.body;
    // Basic validation
    if (!username || !password || !full_name) return res.status(400).json({ message: "Thiếu thông tin." });

    // Validate role - default to 'admin' if not specified
    const newRole = (role === 'super_admin' || role === 'admin') ? role : 'admin';

    // Only super_admin can create other super_admins
    if (newRole === 'super_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Chỉ Super Admin mới có thể tạo Super Admin khác." });
    }

    // [REQ] Default Avatar based on Role (Using "frontend/images/..." as requested)
    const defaultAvatar = newRole === 'super_admin'
        ? 'frontend/images/default_super_admin.png'
        : 'frontend/images/default_admin.png';

    try {
        // Hash password (need bcrypt)
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);

        await db.promise().query(
            "INSERT INTO users (username, password, full_name, role, privacy_setting, avatar) VALUES (?, ?, ?, ?, 'public', ?)",
            [username, hashedPassword, full_name, newRole, defaultAvatar]
        );
        res.json({ success: true, message: `Đã thêm ${newRole === 'super_admin' ? 'Super Admin' : 'Admin'} mới.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi tạo Admin (Username có thể đã tồn tại)." });
    }
};

exports.deleteAdmin = async (req, res) => {
    const targetId = req.params.id;
    const currentUserId = req.user.userId || req.user.id; // Normalize ID
    const currentUserRole = req.user.role;

    // Prevent Self-Delete
    if (String(targetId) === String(currentUserId)) {
        return res.status(400).json({ success: false, message: "Không thể tự xóa chính mình." });
    }

    // [REQ] Only Super Admin can delete admins (and super admins)
    if (currentUserRole !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Chỉ Super Admin mới có quyền xóa tài khoản quản trị." });
    }

    try {
        // Check target exists and get role
        const [target] = await db.promise().query("SELECT role, username FROM users WHERE id = ?", [targetId]);
        if (!target.length) return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản." });

        // Delete the admin account
        await db.promise().query("DELETE FROM users WHERE id = ?", [targetId]);

        res.json({ success: true, message: `Đã xóa tài khoản ${target[0].username}.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

exports.updateAdminRole = async (req, res) => {
    const targetId = req.params.id;
    const { role } = req.body;
    const currentUserId = req.user.userId || req.user.id;
    const currentUserRole = req.user.role;

    // Validate role
    if (role !== 'admin' && role !== 'super_admin') {
        return res.status(400).json({ success: false, message: "Role không hợp lệ." });
    }

    // Prevent changing own role via this API
    if (String(targetId) === String(currentUserId)) {
        return res.status(400).json({ success: false, message: "Không thể thay đổi role của chính mình tại đây." });
    }

    // [REQ] Only Super Admin can update roles
    if (currentUserRole !== 'super_admin') {
        return res.status(403).json({ success: false, message: "Chỉ Super Admin mới có quyền thay đổi role." });
    }

    try {
        // Check target exists
        const [target] = await db.promise().query("SELECT role FROM users WHERE id = ?", [targetId]);
        if (!target.length) return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản." });

        // [REQ] Update Avatar based on New Role (Using "frontend/images/..." as requested)
        const newAvatar = role === 'super_admin'
            ? 'frontend/images/default_super_admin.png'
            : 'frontend/images/default_admin.png';

        // Update role and avatar
        await db.promise().query("UPDATE users SET role = ?, avatar = ? WHERE id = ?", [role, newAvatar, targetId]);

        res.json({ success: true, message: `Đã cập nhật role thành ${role}.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

exports.updateAdminProfile = async (req, res) => {
    const userId = req.user.userId || req.user.id;
    const {
        current_username,
        current_password,
        new_username,
        full_name,
        new_password
    } = req.body;

    if (!current_username || !current_password || !new_username || !full_name) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập đầy đủ thông tin xác thực và thông tin mới." });
    }

    try {
        // 1. Fetch current user data
        const [users] = await db.promise().query("SELECT * FROM users WHERE id = ?", [userId]);
        if (!users.length) return res.status(404).json({ success: false, message: "User not found" });
        const user = users[0];

        // 2. Verify Current Username
        if (user.username !== current_username) {
            return res.status(400).json({ success: false, message: "Tên đăng nhập hiện tại không đúng." });
        }

        // 3. Verify Current Password
        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(current_password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Mật khẩu hiện tại không đúng." });
        }

        // 4. Prepare Update
        let sql = "UPDATE users SET username = ?, full_name = ? WHERE id = ?";
        let params = [new_username, full_name, userId];

        if (new_password && new_password.trim() !== "") {
            const hashedPassword = await bcrypt.hash(new_password, 10);
            sql = "UPDATE users SET username = ?, full_name = ?, password = ? WHERE id = ?";
            params = [new_username, full_name, hashedPassword, userId];
        }

        await db.promise().query(sql, params);
        res.json({ success: true, message: "Cập nhật thông tin cá nhân thành công." });

    } catch (err) {
        console.error("Update Profile Error:", err);
        // Check for duplicate entry error logic if needed, usually err.code === 'ER_DUP_ENTRY'
        res.status(500).json({ success: false, message: "Lỗi cập nhật (Tên đăng nhập mới có thể đã tồn tại)." });
    }
};

exports.verifyCredentials = async (req, res) => {
    const userId = req.user.userId || req.user.id;
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin xác thực." });
    }

    try {
        const [users] = await db.promise().query("SELECT * FROM users WHERE id = ?", [userId]);
        if (!users.length) return res.status(404).json({ success: false, message: "User not found" });
        const user = users[0];

        // Verify Username
        if (user.username !== username) {
            return res.status(400).json({ success: false, message: "Tên đăng nhập không đúng." });
        }

        // Verify Password
        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Mật khẩu không đúng." });
        }

        res.json({ success: true, message: "Xác thực thành công." });
    } catch (err) {
        console.error("Verify Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};
module.exports = exports;