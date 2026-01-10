const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const upload = require('../middleware/uploadMiddleware');
// 1. Upload ảnh trong chat (Bổ sung mới)
// Khi gọi route này, body phải gửi kèm type: 'message'
router.post('/upload-media', upload.single('image'), chatController.uploadMedia);

// 2. Thả cảm xúc tin nhắn (Bổ sung mới)
router.post('/react', chatController.toggleReaction);

// Lấy lịch sử tin nhắn (Dùng chung cho Bạn bè, Nhóm, Người lạ)
router.get('/:targetId', chatController.getMessages);

// Đánh dấu đã đọc
router.post('/mark-read', chatController.markChatAsRead);

// Xóa đoạn chat (Chỉ dùng cho chat 1-1)
router.post('/delete', chatController.deleteChat);

// Tạo nhóm chat (Tối thiểu 3 người)
router.post('/group', chatController.createGroupChat);

// Lấy thành viên nhóm
router.get('/group/:groupId/members', chatController.getGroupMembers);

// Lấy bạn bè chưa có trong nhóm (Để Admin thêm người)
// ĐÂY THƯỜNG LÀ DÒNG GÂY LỖI NẾU TÊN HÀM SAI
router.get('/friends-not-in-group', chatController.getFriendsNotInGroup);

// Rời nhóm hoặc xóa thành viên (Logic giải tán nếu < 3 người)
router.post('/group/remove', chatController.leaveOrRemoveMember);

// Cập nhật cài đặt (Alias, Theme, đổi tên nhóm)
router.post('/settings/update', chatController.updateSettings);

router.post('/block', chatController.toggleBlock);

module.exports = router;