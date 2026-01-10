const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.post('/register', upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
]), authController.register);
router.post('/login', authController.login);
router.put('/password', authController.changePassword);

module.exports = router;