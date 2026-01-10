const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// --- 1. CÁC ROUTE TĨNH (STATIC) - PHẢI ĐẶT TRÊN ĐẦU ---
router.get('/friends', userController.getAcceptedFriends);
router.get('/strangers-messages', userController.getStrangersWithMessages);
router.get('/requests', userController.getFriendRequests);
router.get('/search', userController.searchUsers);
router.get('/groups', userController.getGroups);
router.get('/share-targets', userController.getShareTargets); // Chỉ để 1 lần ở đây
router.get('/chat-targets', userController.getShareTargets); // Dùng chung logic chia sẻ tổng hợp

// --- 2. CẬP NHẬT TÀI KHOẢN ---
router.put('/', userController.updateProfile);
router.put('/update-photo', userController.updatePhoto);
router.put('/privacy', userController.updatePrivacy);
router.put('/update-email', userController.updateEmail);
router.put('/update-name', userController.updateName);
router.post('/upload-image', upload.single('image'), userController.uploadProfileImage);

// --- 3. QUAN HỆ BẠN BÈ ---
router.post('/friendship', userController.manageFriendship);

// --- 4. ROUTE CÓ THAM SỐ (DYNAMIC) - ĐẶT DƯỚI CÙNG ---
router.get('/:userId/posts', userController.getUserPosts);
router.get('/:userId/friends-list', userController.getFriendList);
router.get('/:id', userController.getUserProfile); // Route này phải luôn ở cuối cùng

module.exports = router;