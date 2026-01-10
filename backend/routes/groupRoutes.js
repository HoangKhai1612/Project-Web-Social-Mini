// routes/groupRoutes.js

const express = require('express');
const router = express.Router();

// Import controller
const groupController = require('../controllers/groupController');

/**
 * ============================================
 * PUBLIC & BASIC GROUP MANAGEMENT
 * ============================================
 */

// Tìm kiếm Groups/Pages (GET /api/groups/search?q=keyword)
router.get('/search', groupController.searchGroups);

// Lấy danh sách Groups cá nhân (GET /api/groups/my-groups)
router.get('/my-groups', groupController.getMyGroups);

// Tạo Group mới (POST /api/groups)
router.post('/', groupController.createGroup);

// Quản lý thành viên (tham gia/rời nhóm) (POST /api/groups/membership)
router.post('/membership', groupController.manageMembership);

// Kiểm tra trạng thái thành viên (GET /api/groups/:groupId/check-member)
router.get('/:groupId/check-member', groupController.checkMemberStatus);


/**
 * ============================================
 * ADMIN MANAGEMENT
 * ============================================
 */

// Admin: Duyệt/Từ chối thành viên (PUT /api/groups/members/manage)
router.put('/members/manage', groupController.manageGroupMembers);

// Admin: Thăng/Giáng cấp Admin/Member (PUT /api/groups/members/manage-role)
router.put('/members/manage-role', groupController.manageMemberRole);

// Admin: Lấy danh sách yêu cầu chờ duyệt (GET /api/groups/:groupId/pending)
router.get('/:groupId/pending', groupController.getGroupJoinRequests);

// Admin: Lấy danh sách thành viên được duyệt (GET /api/groups/:groupId/members)
router.get('/:groupId/members', groupController.getGroupMembers);


/**
 * ============================================
 * DETAIL & DELETE
 * ============================================
 */

// Lấy Chi tiết Group (GET /api/groups/:id)
router.get('/:id', groupController.getGroupDetail);

// Xóa Group (DELETE /api/groups/:id)
router.delete('/:id', groupController.deleteGroup);

module.exports = router;