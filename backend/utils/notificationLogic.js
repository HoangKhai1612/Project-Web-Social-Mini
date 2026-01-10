// backend/utils/notificationLogic.js

const db = require('../config/database');

/**
 * @desc Kiểm tra xem hai User có là bạn bè của nhau không.
 * @param {string|number} user1Id 
 * @param {string|number} user2Id 
 * @returns {boolean}
 */
async function areFriends(user1Id, user2Id) {
    // Không cần kiểm tra tự so sánh, để các Controller bên ngoài tự quyết định
    // if (String(user1Id) === String(user2Id)) return false; 

    const [result] = await db.promise().query(
        `SELECT 1 FROM friendships 
         WHERE (sender_id = ? AND receiver_id = ? AND status = 'accepted') 
            OR (sender_id = ? AND receiver_id = ? AND status = 'accepted')`,
        [user1Id, user2Id, user2Id, user1Id]
    );
    return result.length > 0;
}

/**
 * @desc Lấy danh sách ID bạn bè của một User.
 * @param {string|number} userId 
 * @returns {Array<string|number>}
 */
async function getFriendsIds(userId) {
    const [results] = await db.promise().query(
        `SELECT sender_id, receiver_id FROM friendships 
         WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'`,
        [userId, userId]
    );
    
    // Lọc ra ID của bạn bè
    const friendsIds = results.map(row => 
        String(row.sender_id) === String(userId) ? row.receiver_id : row.sender_id
    );
    return friendsIds;
}

// BỎ HÀM sendNotification THỪA KHÔNG CẦN THIẾT

module.exports = {
    areFriends,
    getFriendsIds
};