const db = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * @route POST /api/auth/register
 * @desc Đăng ký người dùng mới (Bcrypt)
 */
exports.register = async (req, res) => {
    const {
        full_name,
        username,
        password,
        birthday,
        school,
        work,
        location,
        gender
    } = req.body;

    const avatarFile = req.files['avatar'] ? req.files['avatar'][0] : null;
    const coverFile = req.files['cover'] ? req.files['cover'][0] : null;
    const avatarPath = avatarFile ? `uploads/${avatarFile.filename}` : null;
    const coverPath = coverFile ? `uploads/${coverFile.filename}` : null;

    try {
        const [checkResults] = await db.promise().query(
            'SELECT COUNT(*) AS count FROM users WHERE username = ?',
            [username]
        );

        if (checkResults[0].count > 0) {
            return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại.' });
        }

        // --- MÃ HÓA MẬT KHẨU ---
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const insertSql = `
            INSERT INTO users 
            (full_name, username, password, birthday, education, work_place, location, gender, avatar, cover_img, privacy_setting) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `;

        const [userResult] = await db.promise().query(insertSql, [
            full_name,
            username,
            hashedPassword, // Lưu pass đã hash
            birthday || null,
            school || null,
            work || null,
            location || null,
            gender || 'Other',
            avatarPath,
            coverPath
        ]);

        const userId = userResult.insertId;
        const initialUserInfo = JSON.stringify({ relationship: '', family: [], interests: [] });
        await db.promise().query('UPDATE users SET user_info = ? WHERE id = ?', [initialUserInfo, userId]);

        res.status(201).json({ success: true, message: 'Đăng ký tài khoản thành công!' });

    } catch (error) {
        console.error("Lỗi đăng ký:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi đăng ký tài khoản.' });
    }
};

/**
 * @route POST /api/auth/login
 * @desc Đăng nhập người dùng (JWT)
 */
exports.login = async (req, res) => {
    const { username, password } = req.body;

    // Chỉ lấy pass để so sánh bcrypt
    const sql = `
        SELECT id, full_name, username, password, avatar, cover_img, bio, 
               work_place, education, birthday, location, gender, 
               privacy_setting, user_info, role,
               is_locked, ban_until, ban_reason
        FROM users 
        WHERE username = ?
    `;

    try {
        const [results] = await db.promise().query(sql, [username]);

        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Tên đăng nhập không tồn tại.' });
        }

        const user = results[0];

        // --- CHECK MAINTENANCE MODE ---
        try {
            const [settingRows] = await db.promise().query('SELECT setting_value FROM sys_settings WHERE setting_key = "maintenance_mode"');
            const isMaintenance = settingRows[0]?.setting_value === 'true';

            if (isMaintenance && user.role !== 'admin' && user.role !== 'super_admin') {
                return res.status(503).json({ success: false, message: 'Hệ thống đang bảo trì. Vui lòng quay lại sau!' });
            }
        } catch (err) { console.error("Maintenance Check Error:", err); }

        // --- CHECK BAN STATUS ---
        if (user.is_locked) {
            return res.status(403).json({ success: false, message: `Tài khoản của bạn đã bị KHÓA VĨNH VIỄN. Lý do: ${user.ban_reason || 'Vi phạm điều khoản'}` });
        }

        if (user.ban_until && new Date(user.ban_until) > new Date()) {
            return res.status(403).json({ success: false, message: `Tài khoản tạm thời bị khóa đến ${new Date(user.ban_until).toLocaleString()}. Lý do: ${user.ban_reason}` });
        }

        // --- KIỂM TRA MẬT KHẨU ---
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác.' });
        }

        // --- TẠO JWT ---
        const token = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                role: user.role // [NEW] Add role to token
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // Token có hiệu lực 7 ngày
        );

        // --- AUDIT LOG FOR ADMIN ---
        if (user.role === 'admin' || user.role === 'super_admin') {
            try {
                await db.promise().query(
                    'INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)',
                    [user.id, 'Đã đăng nhập vào hệ thống', `IP: ${req.ip}`]
                );
            } catch (logErr) {
                console.error("Audit Log Error:", logErr);
            }
        }

        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            token, // Gửi token về frontend
            user: {
                id: user.id,
                full_name: user.full_name,
                username: user.username,
                avatar: user.avatar,
                cover_img: user.cover_img,
                bio: user.bio,
                work_place: user.work_place,
                education: user.education,
                birthday: user.birthday,
                location: user.location,
                gender: user.gender,
                role: user.role, // [NEW] Return role
                privacy_setting: user.privacy_setting,
                extra_info: JSON.parse(user.user_info || '{}')
            }
        });
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        res.status(500).json({ success: false, message: 'Lỗi hệ thống khi đăng nhập.' });
    }
};

/**
 * @route PUT /api/auth/password
 * @desc Đổi mật khẩu người dùng (Bcrypt)
 */
exports.changePassword = async (req, res) => {
    const { user_id, old_password, new_password } = req.body;

    if (!user_id || !old_password || !new_password) {
        return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin.' });
    }

    try {
        const [results] = await db.promise().query('SELECT password FROM users WHERE id = ?', [user_id]);
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
        }

        const isMatch = await bcrypt.compare(old_password, results[0].password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Mật khẩu cũ không chính xác.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        await db.promise().query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user_id]);
        res.json({ success: true, message: 'Đổi mật khẩu thành công!' });

    } catch (error) {
        console.error("Lỗi đổi mật khẩu:", error);
        res.status(500).json({ success: false, message: 'Lỗi cơ sở dữ liệu.' });
    }
};