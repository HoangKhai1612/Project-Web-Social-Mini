const db = require('../config/database');
const jwt = require('jsonwebtoken');

// Simple cache to avoid querying DB on every request
let isMaintenanceMode = false;
let lastCheck = 0;

const checkMaintenance = async (req, res, next) => {
    // 1. Skip for Admin routes (admins must be able to access to turn it off)
    if (req.originalUrl.startsWith('/api/admin')) return next();

    // 2. Skip for Login/Register (to allow admins to login)
    // Actually, we want to BLOCK regular users from logging in, but Admins must login.
    // So we allow the Login API, but in AuthController we will block regular users if maintenance is on.
    // Here we mainly block "GET" access or verified access.
    if (req.originalUrl.startsWith('/api/auth')) return next();

    // 3. Update cache every 10 seconds
    const now = Date.now();
    if (now - lastCheck > 10000) {
        try {
            const [rows] = await db.promise().query('SELECT setting_value FROM sys_settings WHERE setting_key = "maintenance_mode"');
            isMaintenanceMode = rows[0]?.setting_value === 'true';
            lastCheck = now;
        } catch (e) { console.error(e); }
    }

    // 4. If Maintenance is ON
    if (isMaintenanceMode) {
        // Allow Admins to bypass (check token)
        const token = req.headers['authorization']?.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded.role === 'admin' || decoded.role === 'super_admin') {
                    return next();
                }
            } catch (e) { }
        }

        return res.status(503).json({
            success: false,
            message: 'Hệ thống đang bảo trì. Vui lòng quay lại sau!',
            maintenance: true
        });
    }

    next();
};

module.exports = checkMaintenance;
