const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const uploadMiddleware = postController.uploadMiddleware;

// --- 1. CÁC ROUTE TĨNH (STATIC) - ĐƯA LÊN TRÊN ---
router.get('/search', postController.searchPosts);
router.get('/favorites', postController.getFavoritePosts);
router.get('/hidden', postController.getHiddenPosts);
router.post('/comment/react', postController.reactToComment); // [NEW] Moved up to avoid conflict with /:postId/react

// --- 2. CÁC ROUTE ĐỘNG (DYNAMIC) ---
router.get('/', postController.getPosts);
router.post('/', uploadMiddleware, postController.createPost);

// --- 3. KHO LƯU TRỮ (Đã chuyển sang userRoutes) ---

// Route xem chi tiết bài đăng (Phải đặt SAU /search, /favorites nhưng TRƯỚC các route con khác nếu cần, hoặc đặt ở group dynamic)
router.get('/:postId', postController.getPostById);

// Route check phải nằm trên các thao tác post chi tiết để tránh bị bắt bởi :postId
router.get('/:postId/check', postController.checkPostExists);

router.get('/:postId/comments', postController.getComments);
router.post('/:postId/comment', postController.addComment);
router.post('/:postId/react', postController.reactToPost);
router.post('/:postId/share', postController.sharePost);

router.put('/:postId', uploadMiddleware, postController.updatePost);
router.put('/:postId/visibility', postController.toggleVisibility);
router.post('/:postId/favorite', postController.toggleFavorite);
router.post('/:postId/hide', postController.togglePersonalHide); // Đổi tên hàm cho khớp controller mới

router.delete('/:postId', postController.deletePost);

module.exports = router;