const db = require('../config/database');
const { isAdminOfGroup, createNotification } = require('../utils/helpers');
// NOTE: NotificationController không cần require ở đây vì chúng ta gọi trực tiếp createNotification
const getIo = (req) => req.app.get('io');


// ============================================
// HELPER FUNCTIONS (Định nghĩa trước khi được gọi trong Controller)
// ============================================

/**
 * @desc Kiểm tra xem User có phải là Creator của Group hay không.
 */
async function isCreatorOfGroup(userId, groupId) {
    const [result] = await db.promise().query(
        'SELECT creator_id FROM groups WHERE id = ? AND creator_id = ?',
        [groupId, userId]
    );
    return result.length > 0;
}

/**
 * @desc Thực thi xóa toàn bộ Group và các nội dung liên quan (posts, members).
 */
async function executeGroupDelete(groupId, res) {
    try {
        // Lấy tên nhóm để thông báo (nếu cần)
        const [groupInfo] = await db.promise().query('SELECT name FROM groups WHERE id = ?', [groupId]);
        const groupName = groupInfo.length > 0 ? groupInfo[0].name : "Group";

        // Xóa các bảng liên quan
        await db.promise().query('DELETE FROM posts WHERE group_id = ?', [groupId]);
        await db.promise().query('DELETE FROM group_members WHERE group_id = ?', [groupId]);
        const [result] = await db.promise().query('DELETE FROM groups WHERE id = ?', [groupId]);

        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Group không tồn tại.' });

        // TODO: CẦN THÔNG BÁO CHO TẤT CẢ THÀNH VIÊN VỀ VIỆC NHÓM BỊ XÓA (NẾU CẦN)

        return res.json({ success: true, message: `Group "${groupName}" đã được xóa thành công.` });
    } catch (err) {
        console.error('Lỗi thực thi xóa Group:', err);
        return res.status(500).json({ success: false, message: 'Lỗi DB khi xóa Group.' });
    }
}


// ============================================
// CÁC HÀM CONTROLLER
// ============================================

async function getMyGroups(req, res) {
    // ... (Giữ nguyên logic)
    const userId = req.query.user_id;
    if (!userId) {
        return res.status(400).json({ success: false, message: 'Missing user ID.' });
    }

    try {
        const createdSql = `
            SELECT g.id, g.name, g.description, g.creator_id, g.created_at,
            (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.status = 'approved') AS member_count,
            (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.status = 'pending') AS pending_count
            FROM groups g
            WHERE g.creator_id = ?
        `;
        const [createdGroups] = await db.promise().query(createdSql, [userId]);

        const joinedSql = `
            SELECT g.id, g.name, g.description, g.creator_id, g.created_at
            FROM groups g
            JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id = ? AND gm.status = 'approved' AND g.creator_id != ?
        `;
        const [joinedGroups] = await db.promise().query(joinedSql, [userId, userId]);

        res.json({ success: true, created: createdGroups, joined: joinedGroups });
    } catch (err) {
        console.error("Lỗi khi tải Groups cá nhân:", err);
        res.status(500).json({ success: false, message: 'Lỗi server khi tải groups cá nhân.' });
    }
}

async function getGroupDetail(req, res) {
    // ... (Giữ nguyên logic)
    const groupId = req.params.id;
    const viewerId = req.query.user_id;
    if (!viewerId) return res.status(400).json({ success: false, message: 'Missing viewer ID.' });

    try {
        const [groupResults] = await db.promise().query(
            `SELECT g.id, g.name, g.description, g.creator_id, g.created_at,
            (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.status = 'approved') AS member_count,
            (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.status = 'pending') AS pending_count
            FROM groups g WHERE g.id = ?`,
            [groupId]
        );

        if (groupResults.length === 0) return res.status(404).json({ success: false, message: 'Group không tồn tại.' });
        const group = groupResults[0];

        const [memberStatus] = await db.promise().query(
            'SELECT role, status FROM group_members WHERE group_id = ? AND user_id = ?',
            [groupId, viewerId]
        );

        let membershipStatus = 'not_member';

        if (memberStatus.length > 0) {
            const member = memberStatus[0];
            if (member.status === 'approved') {
                membershipStatus = member.role;

                // Nếu là Creator VÀ đang là thành viên được duyệt, gán status 'creator'
                if (String(group.creator_id) === String(viewerId)) {
                    membershipStatus = 'creator';
                }
            } else if (member.status === 'pending') {
                membershipStatus = 'pending';
            }
        }

        res.json({ success: true, group, membership_status: membershipStatus });
    } catch (err) {
        console.error('Lỗi tải chi tiết Group:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi tải chi tiết Group.' });
    }
}

async function deleteGroup(req, res) {
    const groupId = req.params.id;
    const { admin_id } = req.body;
    if (!admin_id) return res.status(400).json({ success: false, message: 'Missing Admin ID.' });

    try {
        // Lấy thông tin group và người được ủy quyền
        const [groupResult] = await db.promise().query(
            'SELECT creator_id, delete_delegate_id FROM groups WHERE id = ?',
            [groupId]
        );
        if (groupResult.length === 0) {
            return res.status(404).json({ success: false, message: 'Group không tồn tại.' });
        }
        const group = groupResult[0];

        // KIỂM TRA QUYỀN XÓA (Creator HOẶC Người được ủy quyền xóa)
        const isAllowedToDelete = String(admin_id) === String(group.creator_id) ||
            String(admin_id) === String(group.delete_delegate_id);

        if (!isAllowedToDelete) {
            return res.status(403).json({ success: false, message: 'Chỉ người tạo Page/Group hoặc người được ủy quyền mới có quyền xóa.' });
        }

        // Thực thi xóa nhóm
        // [TÍCH HỢP THÔNG BÁO] executeGroupDelete sẽ xử lý thông báo tên nhóm bị xóa.
        return executeGroupDelete(groupId, res);

    } catch (err) {
        console.error('Lỗi xóa Group:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi xóa Group.' });
    }
}

async function createGroup(req, res) {
    const { name, description, creator_id } = req.body;
    const io = getIo(req);

    if (!name || !creator_id) {
        return res.status(400).json({ success: false, message: 'Tên nhóm và Creator ID không được trống.' });
    }

    try {
        const groupSql = 'INSERT INTO groups (name, description, creator_id) VALUES (?, ?, ?)';
        const [groupResult] = await db.promise().query(groupSql, [name, description, creator_id]);
        const groupId = groupResult.insertId;

        const memberSql = 'INSERT INTO group_members (group_id, user_id, role, status) VALUES (?, ?, "admin", "approved")';
        await db.promise().query(memberSql, [groupId, creator_id]);

        // [TÍCH HỢP THÔNG BÁO] Thông báo cho Creator (thông báo cá nhân)
        createNotification(io, creator_id, creator_id, 'group_created', `Bạn đã tạo Group/Page: "${name}" thành công.`, groupId);

        res.status(201).json({ success: true, message: 'Đã tạo nhóm/page thành công.', groupId });
    } catch (err) {
        console.error('Lỗi DB khi tạo nhóm:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo nhóm.' });
    }
}

async function getGroups(req, res) {
    // ... (Giữ nguyên logic)
    const sql = `
        SELECT g.*, u.full_name AS creator_name,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.status = 'approved') AS member_count
        FROM groups g
        JOIN users u ON g.creator_id = u.id
        ORDER BY g.created_at DESC
    `;
    try {
        const [results] = await db.promise().query(sql);
        res.json(results);
    } catch (err) {
        console.error('Lỗi DB khi tải danh sách nhóm:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi tải danh sách nhóm.' });
    }
}

async function searchGroups(req, res) {
    // ... (Giữ nguyên logic)
    const query = req.query.q;
    if (!query) return res.status(400).json({ success: false, message: 'Vui lòng nhập từ khóa tìm kiếm.' });

    const searchPattern = `%${query}%`;
    const sql = `
        SELECT g.id, g.name, g.description, COUNT(gm.user_id) AS member_count
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.status = 'approved'
        WHERE g.name LIKE ? OR g.description LIKE ?
        GROUP BY g.id
        ORDER BY member_count DESC
        LIMIT 10
    `;
    try {
        const [results] = await db.promise().query(sql, [searchPattern, searchPattern]);
        const groups = results.map(g => ({ ...g, full_name: g.name, type: 'group' }));
        res.json(groups);
    } catch (err) {
        console.error("Lỗi DB khi tìm kiếm Group:", err);
        return res.status(500).json({ success: false, message: 'Lỗi server khi tìm kiếm Group.' });
    }
}

async function manageMembership(req, res) {
    const { group_id, user_id, action } = req.body;
    const io = getIo(req);

    try {
        if (action === 'request') {
            const [existing] = await db.promise().query(
                'SELECT status FROM group_members WHERE group_id = ? AND user_id = ?',
                [group_id, user_id]
            );
            if (existing.length > 0) {
                return res.status(409).json({ success: false, message: 'Bạn đã là thành viên hoặc đang chờ duyệt.' });
            }
            await db.promise().query(
                'INSERT INTO group_members (group_id, user_id, role, status) VALUES (?, ?, "member", "pending")',
                [group_id, user_id]
            );

            // Lấy danh sách Admin để gửi thông báo yêu cầu duyệt
            const [admins] = await db.promise().query(
                'SELECT user_id FROM group_members WHERE group_id = ? AND role = "admin" AND status = "approved"',
                [group_id]
            );
            admins.forEach(admin => {
                // [TÍCH HỢP THÔNG BÁO] Gửi thông báo đến Admin khi có yêu cầu tham gia
                createNotification(io, admin.user_id, user_id, 'group_join_request', 'Vừa có yêu cầu tham gia nhóm mới.', group_id);
            });
            return res.json({ success: true, message: 'Đã gửi yêu cầu tham gia nhóm. Vui lòng chờ admin duyệt.' });

        } else if (action === 'leave') {
            const [userRoleResult] = await db.promise().query(
                'SELECT role, status FROM group_members WHERE group_id = ? AND user_id = ? AND status = "approved"',
                [group_id, user_id]
            );
            if (userRoleResult.length === 0) {
                return res.status(404).json({ success: false, message: 'Bạn không phải là thành viên được duyệt của nhóm này.' });
            }
            const userRole = userRoleResult[0].role;

            const isCreator = await isCreatorOfGroup(user_id, group_id);

            // 1. Nếu là Admin hoặc Creator đang rời nhóm
            if (userRole === 'admin' || isCreator) {
                const [adminCountResult] = await db.promise().query(
                    "SELECT COUNT(user_id) AS admin_count FROM group_members WHERE group_id = ? AND status = 'approved' AND role = 'admin' AND user_id != ?",
                    [group_id, user_id]
                );
                const remainingAdmins = adminCountResult[0].admin_count;

                // Nếu không còn Admin nào sau khi người này rời đi
                if (remainingAdmins === 0) {
                    const [memberCountResult] = await db.promise().query(
                        "SELECT COUNT(user_id) AS member_count FROM group_members WHERE group_id = ? AND status = 'approved' AND user_id != ?",
                        [group_id, user_id]
                    );
                    const remainingMembers = memberCountResult[0].member_count;

                    if (remainingMembers === 0) {
                        // Trường hợp nhóm trống, xóa nhóm
                        return executeGroupDelete(group_id, res);
                    } else {
                        // Trường hợp còn thành viên nhưng không còn Admin, yêu cầu chuyển giao quyền
                        return res.status(403).json({ success: false, message: 'Bạn là Admin/Creator cuối cùng. Vui lòng chuyển giao vai trò Admin cho thành viên khác trước khi rời nhóm.' });
                    }
                }
            }

            // 2. Rời nhóm (nếu không phải trường hợp chặn ở trên)
            await db.promise().query('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [group_id, user_id]);

            // [TÍCH HỢP THÔNG BÁO] Thông báo cho Creator/Admin khác biết Member đã rời (Tùy chọn)
            // Lấy thông tin nhóm
            const [groupInfo] = await db.promise().query('SELECT creator_id FROM groups WHERE id = ?', [group_id]);
            if (groupInfo.length > 0) {
                const creatorId = groupInfo[0].creator_id;
                // Thông báo cho Creator rằng user_id đã rời
                if (String(creatorId) !== String(user_id)) {
                    createNotification(io, creatorId, user_id, 'group_left', 'Vừa rời nhóm của bạn.', group_id);
                }
            }

            return res.json({ success: true, message: 'Bạn đã rời nhóm thành công.' });
        } else {
            return res.status(400).json({ success: false, message: 'Hành động không hợp lệ.' });
        }
    } catch (err) {
        console.error('Lỗi quản lý thành viên:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi xử lý yêu cầu.' });
    }
}

async function getGroupJoinRequests(req, res) {
    // ... (Giữ nguyên logic)
    const groupId = req.params.groupId;
    const adminId = req.query.admin_id;
    const isAdmin = await isAdminOfGroup(adminId, groupId);
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản trị nhóm này.' });

    try {
        const sql = `
            SELECT gm.user_id, u.full_name, u.avatar, u.location
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id = ? AND gm.status = 'pending'
        `;
        const [results] = await db.promise().query(sql, [groupId]);
        res.json(results);
    } catch (err) {
        console.error('Lỗi DB khi tải yêu cầu duyệt nhóm:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi tải yêu cầu duyệt nhóm.' });
    }
}

async function manageGroupMembers(req, res) {
    const { admin_id, user_id_to_manage, group_id, action } = req.body;
    const io = getIo(req);
    const isAdmin = await isAdminOfGroup(admin_id, group_id);
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản trị nhóm này.' });

    try {
        if (action === 'approve') {
            await db.promise().query(
                'UPDATE group_members SET status = "approved", role = "member" WHERE user_id = ? AND group_id = ? AND status = "pending"',
                [user_id_to_manage, group_id]
            );

            // [TÍCH HỢP THÔNG BÁO] Thông báo cho người dùng được duyệt
            createNotification(io, user_id_to_manage, admin_id, 'group_approved', 'Yêu cầu tham gia nhóm của bạn đã được chấp nhận.', group_id);

            res.json({ success: true, message: 'Đã duyệt thành viên thành công.' });
        } else if (action === 'reject' || action === 'remove') {
            const [targetRoleResult] = await db.promise().query(
                'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
                [group_id, user_id_to_manage]
            );
            if (targetRoleResult.length > 0 && targetRoleResult[0].role === 'admin' && !(await isCreatorOfGroup(admin_id, group_id))) {
                return res.status(403).json({ success: false, message: 'Chỉ Creator mới có thể xóa Admin khác.' });
            }

            // [TÍCH HỢP THÔNG BÁO] Thông báo cho người dùng bị từ chối/xóa (Tùy chọn)
            if (action === 'remove') {
                createNotification(io, user_id_to_manage, admin_id, 'group_removed', 'Bạn đã bị xóa khỏi nhóm.', group_id);
            }

            await db.promise().query('DELETE FROM group_members WHERE user_id = ? AND group_id = ?', [user_id_to_manage, group_id]);
            res.json({ success: true, message: 'Đã từ chối/xóa thành viên.' });
        } else {
            res.status(400).json({ success: false, message: 'Hành động không hợp lệ.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Lỗi DB khi quản lý thành viên.' });
    }
}

async function getGroupMembers(req, res) {
    // ... (Giữ nguyên logic)
    const groupId = req.params.groupId;
    const adminId = req.query.admin_id;
    const isAdmin = await isAdminOfGroup(adminId, groupId);
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem danh sách này.' });

    try {
        const membersSql = `
            SELECT gm.user_id, gm.role, gm.joined_at,
                   u.full_name, u.email, u.avatar, u.gender, g.creator_id
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            JOIN groups g ON gm.group_id = g.id
            WHERE gm.group_id = ? AND gm.status = 'approved'
            ORDER BY FIELD(gm.role, 'admin', 'member')
        `;
        const [members] = await db.promise().query(membersSql, [groupId]);
        res.json({ success: true, members, creator_id: members.length > 0 ? members[0].creator_id : null });
    } catch (err) {
        console.error('Lỗi tải danh sách thành viên:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi tải thành viên.' });
    }
}

async function manageMemberRole(req, res) {
    const { admin_id, user_id_to_manage, group_id, action } = req.body;
    const io = getIo(req);

    // Chỉ Creator mới có quyền
    const isCreator = await isCreatorOfGroup(admin_id, group_id);
    if (!isCreator) {
        return res.status(403).json({ success: false, message: 'Chỉ Chủ Page mới có quyền quản lý vai trò cấp cao.' });
    }

    // Ngăn Creator tự giáng cấp/xóa mình
    if (String(admin_id) === String(user_id_to_manage)) {
        return res.status(400).json({ success: false, message: 'Bạn không thể tự giáng cấp/xóa mình.' });
    }

    try {
        const newRole = action === 'promote' ? 'admin' : 'member';
        await db.promise().query(
            'UPDATE group_members SET role = ? WHERE user_id = ? AND group_id = ? AND status = "approved"',
            [newRole, user_id_to_manage, group_id]
        );

        // [TÍCH HỢP THÔNG BÁO] Thông báo cho người dùng bị thăng/giáng cấp
        const message = action === 'promote' ? 'Bạn đã được thăng chức lên Admin.' : 'Bạn đã bị giáng chức xuống thành viên.';
        createNotification(io, user_id_to_manage, admin_id, 'group_role_change', message, group_id);

        res.json({
            success: true,
            message: `Đã ${action === 'promote' ? 'thăng' : 'giáng'} cấp thành viên thành công.`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Lỗi DB khi quản lý vai trò thành viên.' });
    }
}

/**
 * @route PUT /api/groups/members/transfer-admin
 * @desc Chuyển giao quyền Creator và Admin (khi Creator/Admin cuối cùng rời nhóm).
 */
async function transferAdminRole(req, res) {
    const { group_id, old_admin_id, new_admin_id } = req.body;
    const io = getIo(req);

    if (!old_admin_id || !new_admin_id || !group_id) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin cần thiết.' });
    }

    try {
        const isCreator = await isCreatorOfGroup(old_admin_id, group_id);
        const isAdmin = await isAdminOfGroup(old_admin_id, group_id);

        if (!isCreator && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện chuyển giao quyền này.' });
        }

        // 1. Thăng cấp người nhận (New Admin) lên Admin và chấp nhận membership
        await db.promise().query(
            'UPDATE group_members SET role = "admin", status = "approved" WHERE group_id = ? AND user_id = ?',
            [group_id, new_admin_id]
        );

        let message = 'Đã chuyển giao vai trò Admin thành công và rời nhóm.';

        // 2. Nếu người chuyển giao là Creator gốc, chuyển quyền Creator trong bảng 'groups'
        if (isCreator) {
            const [groupUpdateResult] = await db.promise().query(
                'UPDATE groups SET creator_id = ? WHERE id = ? AND creator_id = ?',
                [new_admin_id, group_id, old_admin_id]
            );
            if (groupUpdateResult.affectedRows > 0) {
                message = 'Đã chuyển giao quyền Chủ Page thành công và rời nhóm.';
            }
        }

        // 3. Loại bỏ Creator cũ khỏi danh sách thành viên (hành động rời nhóm)
        await db.promise().query(
            'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
            [group_id, old_admin_id]
        );

        // [TÍCH HỢP THÔNG BÁO] Thông báo cho người nhận quyền mới
        createNotification(io, new_admin_id, old_admin_id, 'group_creator_transfer', message, group_id);


        res.json({ success: true, message: message });

    } catch (error) {
        console.error('Lỗi chuyển giao Admin/Creator:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi chuyển giao quyền Admin.' });
    }
}



/**
 * @route GET /api/groups/:groupId/check-member
 * @desc Kiểm tra trạng thái thành viên của User trong Group
 */
async function checkMemberStatus(req, res) {
    const groupId = req.params.groupId;
    const userId = req.query.user_id;

    if (!groupId || !userId) {
        return res.status(400).json({ success: false, message: 'Missing parameters.' });
    }

    try {
        const [results] = await db.promise().query(
            'SELECT role, status FROM group_members WHERE group_id = ? AND user_id = ?',
            [groupId, userId]
        );

        if (results.length === 0) {
            return res.json({ isMember: false, status: 'not_member', role: null });
        }

        const member = results[0];
        const isMember = member.status === 'approved';

        res.json({
            isMember,
            status: member.status,
            role: member.role
        });

    } catch (err) {
        console.error('Lỗi kiểm tra thành viên:', err);
        res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
}

// =======================
// EXPORTS
// =======================
module.exports = {
    getMyGroups,
    getGroupDetail,
    deleteGroup,
    createGroup,
    getGroups,
    searchGroups,
    manageMembership,
    getGroupJoinRequests,
    manageGroupMembers,
    getGroupMembers,
    manageMemberRole,
    isCreatorOfGroup,
    transferAdminRole,
    checkMemberStatus, // EXPORT HÀM MỚI
};