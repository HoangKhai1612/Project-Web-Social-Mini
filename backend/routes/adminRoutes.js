const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// === ADMIN ROUTES (Protected by Auth + Admin) ===
router.use('/admin', authMiddleware, adminMiddleware);

// Module 1: Overview
router.get('/admin/stats', adminController.getDashboardStats);

// Module 2: Users
router.get('/admin/users', adminController.getUsers);
router.get('/admin/users/:id', adminController.getUserDetails);
router.post('/admin/users/lock', adminController.toggleUserLock);

// Module 3: Reports
router.get('/admin/reports', adminController.getReports);
router.post('/admin/reports/resolve', adminController.resolveReport);
router.post('/admin/enforce-violation', adminController.enforceViolation);
router.get('/admin/users/:userId/violations', adminController.getUserViolations);
router.post('/admin/reports/:id/dismiss', adminController.dismissReport);

// Module 4: Content
router.get('/admin/posts', adminController.getAllPosts);
router.delete('/admin/posts/:id', adminController.deletePostAdmin);

// Module 5: System & Admin Management
router.get('/admin/logs', adminController.getSystemLogs);
router.get('/admin/settings/system', adminController.getSystemSettings); // [NEW]
router.post('/admin/settings/system', adminController.updateSystemSetting); // [NEW]
router.get('/admin/admins', adminController.getAdmins);
router.post('/admin/admins', adminController.createAdmin);
router.put('/admin/admins/:id/role', adminController.updateAdminRole);
router.delete('/admin/admins/:id', adminController.deleteAdmin);


// === USER REPORTING ROUTES (Protected by Auth only) ===
router.post('/report', authMiddleware, adminController.submitReport);

module.exports = router;
