// frontend/js/modules/group.js

import { API_URL, showToast, defaultConfig, getAvatarUrl, apiFetch } from '../main.js';

const getConfig = () => window.elementSdk?.config || defaultConfig;

// ============================================
// 1. RENDER GROUP LIST (Trang chính của Pages)
// ============================================

/**
 * @route GET /api/groups/my-groups
 * @desc Lấy danh sách các groups do mình tạo và groups mình tham gia.
 */
export async function renderGroupList() {
    const main = document.getElementById('mainContent');
    if (!main || !window.currentUser) return;

    const config = getConfig();

    main.innerHTML = `
        <div class="max-w-4xl mx-auto">
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold mb-4 text-slate-800 dark:text-white pb-2 border-b dark:border-slate-700">
                📢 Quản lý Pages/Groups
            </h2>
            
            <button onclick="window.GroupModule.showCreateGroupModal()" 
                    class="btn-primary px-4 py-2 rounded mb-6 text-white" 
                    style="background:${config.primaryAction};">
                ➕ Tạo Page/Group mới
            </button>

            <div id="groupListContainer" class="space-y-6">
                <div class="p-8 text-center text-gray-500">Đang tải danh sách...</div>
            </div>
        </div>
    `;

    try {
        const res = await apiFetch(`/groups/my-groups?user_id=${window.currentUser.userId}`);
        if (!res) return;

        if (!res.ok) throw new Error('Không thể tải danh sách groups');

        const data = await res.json();

        const createdGroups = data.created || [];
        const joinedGroups = data.joined || [];

        const container = document.getElementById('groupListContainer');

        container.innerHTML = `
            ${renderGroupSection(createdGroups, 'Pages/Groups bạn tạo', true)}
            ${renderGroupSection(joinedGroups, 'Pages/Groups bạn tham gia', false)}
        `;

        // Nếu không có nhóm nào, hiển thị thông báo
        if (createdGroups.length === 0 && joinedGroups.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-secondary">
                Bạn chưa tạo hoặc tham gia bất kỳ Page/Group nào. Hãy tạo một Page mới!
            </div>`;
        }

    } catch (err) {
        main.innerHTML = `<div class="p-8 text-center text-red-500">
            ❌ Lỗi tải danh sách Groups: ${err.message}. 
            (Kiểm tra xem API /groups/my-groups đã được định nghĩa chưa)
        </div>`;
    }
}

/** Helper: Render từng phần danh sách Groups */
function renderGroupSection(groups, title, isCreator) {
    if (groups.length === 0) return '';

    const config = getConfig();

    return `
        <div class="surface rounded-lg shadow p-4 border border-base bg-white dark:bg-slate-900 dark:border-slate-800 transition-colors duration-300">
            <h3 class="font-semibold text-lg mb-3 border-b dark:border-slate-700 pb-2 text-slate-800 dark:text-white">${title}</h3>
            
            <div class="space-y-3">
                ${groups.map(group => `
                    <div onclick="window.GroupModule.renderGroupDetail('${group.id}')"
                         class="flex justify-between items-center p-3 hover:bg-gray-100 rounded cursor-pointer">
                        <div class="flex items-center gap-3">
                            <div class="avatar-small rounded-lg bg-purple-500 w-10 h-10 flex items-center justify-center text-white font-bold">
                                ${group.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div class="font-semibold text-content">${group.name}</div>
                                <div class="text-sm text-secondary">
                                    ${isCreator ? 'Quản lý' : 'Thành viên'}
                                    ${group.pending_count > 0 ? ` (${group.pending_count} yêu cầu)` : ''}
                                </div>
                            </div>
                        </div>
                        ${isCreator && group.pending_count > 0 ?
            `<span class="text-red-500 font-bold">🔔</span>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ============================================
// 2. RENDER GROUP DETAIL (Trang chi tiết)
// ============================================

/**
 * [NEW HELPER] Hàm render màn hình chặn nội dung
 */
function renderContentGate(status) {
    const message = status === 'pending'
        ? "⏳ Yêu cầu tham gia của bạn đang chờ quản trị viên duyệt. Sau khi được duyệt, nội dung sẽ hiển thị ở đây."
        : "🔒 Nội dung Page này chỉ hiển thị khi bạn tham gia nhóm thành công.";

    // Nút tham gia nhóm sẽ được render bởi renderGroupActions

    return `
        <div class="p-8 text-center bg-gray-100 rounded-lg text-secondary border border-dashed border-gray-300">
            <h4 class="font-semibold mb-2">Truy cập bị hạn chế</h4>
            <p>${message}</p>
        </div>
    `;
}

/** * [NEW HELPER] Hàm render nội dung Group nếu đã được duyệt
 * Bao gồm Form đăng bài và container Feed
 */
function renderGroupPostAndFeed(groupId, status, primaryColor) {
    return `
        ${renderGroupPostForm(groupId, status, primaryColor)}
        <div id="groupPosts">Đang tải bài viết Group...</div>
    `;
}

/**
 * @route GET /api/groups/:id
 * @desc Hiển thị chi tiết Group và Feed của Group (MODIFIED: Kiểm soát quyền truy cập nội dung)
 */
export async function renderGroupDetail(groupId) {
    const main = document.getElementById('mainContent');
    const config = getConfig();

    main.innerHTML = '<div class="p-8 text-center text-gray-500">Đang tải Group...</div>';

    try {
        const res = await apiFetch(`/groups/${groupId}?user_id=${window.currentUser.userId}`);
        if (!res) return;

        if (!res.ok) throw new Error('Không tìm thấy Group');

        const data = await res.json();
        const group = data.group;
        const status = data.membership_status; // creator, admin, member, pending, not_member

        window.currentGroupMembershipStatus = status;

        // Xác định quyền xem nội dung: Approved members only
        const canViewContent = status === 'creator' || status === 'admin' || status === 'member';


        // Render Group Shell
        main.innerHTML = `
            <div class="max-w-4xl mx-auto surface rounded-lg shadow p-6 border border-base bg-white dark:bg-slate-900 dark:border-slate-800 transition-colors duration-300">
                 
                <h1 class="text-2xl font-bold text-slate-800 dark:text-white mb-3">${group.name}</h1>
                <div class="text-slate-500 dark:text-slate-400 mb-4">${group.description}</div>
                <div class="text-sm text-slate-700 dark:text-slate-300">👥 ${group.member_count} thành viên</div>

                <div id="groupActions" class="mt-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                    ${renderGroupActions(group.id, status, config.primaryAction, group.name)}
                </div>

                <div id="groupContent" class="mt-6 flex gap-4">
                    <div class="flex-1" id="groupFeedContainer">
                        ${canViewContent
                ? renderGroupPostAndFeed(group.id, status, config.primaryAction) // HIỂN THỊ NỘI DUNG NẾU CÓ QUYỀN
                : renderContentGate(status) // HIỂN THỊ CỔNG CHẶN NẾU KHÔNG CÓ QUYỀN
            }
                    </div>
                    
                    <div class="w-1/4 space-y-4">
                        ${status === 'creator' || status === 'admin' ? renderAdminSidebar(group.id, group.pending_count, status) : ''}
                        ${renderGroupInfoSidebar(group)}
                    </div>
                </div>
            </div>
        `;

        // TẢI BÀI ĐĂNG CHỈ KHI CÓ QUYỀN TRUY CẬP ĐƯỢC DUYỆT
        if (canViewContent && window.NewsfeedModule && window.NewsfeedModule.loadPosts) {
            window.NewsfeedModule.loadPosts(group.id, 'groupPosts');
        }

        window.currentView = `group_detail_${groupId}`;

    } catch (err) {
        main.innerHTML = `<div class="p-8 text-center text-red-500">Lỗi tải Group: ${err.message}</div>`;
    }
}

/** Helper: Form đăng bài Group */
function renderGroupPostForm(groupId, status, primaryColor) {
    if (status === 'member' || status === 'creator' || status === 'admin') {
        return `
            <div class="surface rounded-lg shadow p-3 mb-4 border border-base bg-white dark:bg-slate-900 dark:border-slate-800">
                <button onclick="window.GroupModule.showGroupCreatePostModal('${groupId}')"
                        class="w-full p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-left text-slate-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition">
                    Đăng bài trong ${status === 'creator' ? 'nhóm quản lý' : 'nhóm'}...
                </button>
            </div>
        `;
    }
    return '';
}

/** Helper: Sidebar Admin - Thêm nút Duyệt Thành Viên */
function renderAdminSidebar(groupId, pendingCount, status) {
    let html = `
        <div class="surface rounded-lg shadow p-4 border border-base bg-white dark:bg-slate-900 dark:border-slate-800">
            <h4 class="font-bold mb-3 text-slate-800 dark:text-white">🛠️ Quản lý</h4>
    `;

    // Duyệt thành viên và Xem thành viên (Chung cho Creator và Admin)
    if (status === 'creator' || status === 'admin') {
        html += `
            <div onclick="window.GroupModule.renderGroupMembers('${groupId}')"
                 class="p-2 hover:bg-gray-100 rounded cursor-pointer flex justify-between items-center">
                <span>Danh sách thành viên</span>
            </div>
            <div onclick="window.GroupModule.renderPendingRequests('${groupId}')"
                 class="p-2 hover:bg-gray-100 rounded cursor-pointer flex justify-between items-center">
                <span>Duyệt yêu cầu</span>
                ${pendingCount > 0 ? `<span class="bg-red-500 text-white text-xs px-2 py-1 rounded-full">${pendingCount}</span>` : ''}
            </div>
        `;
    }

    // Chức năng độc quyền cho CREATOR (Chủ Page)
    if (status === 'creator') {
        html += `
            <div onclick="window.switchView('settings', 'group_${groupId}')" class="p-2 hover:bg-gray-100 rounded cursor-pointer">
                Cài đặt Group
            </div>
            <div onclick="window.GroupModule.deleteGroup('${groupId}')" class="p-2 hover:bg-red-100 text-red-500 rounded cursor-pointer">
                ❌ Xóa Group/Page
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

/** Helper: Sidebar Info */
function renderGroupInfoSidebar(group) {
    return `
        <div class="surface rounded-lg shadow p-4 border border-base">
            <h4 class="font-bold mb-3">Thông tin</h4>
            <div class="text-sm text-secondary">
                <p>ID Group: ${group.id}</p>
                <p>Ngày tạo: ${group.created_at ? new Date(group.created_at).toLocaleDateString() : 'N/A'}</p>
            </div>
        </div>
    `;
}

/** Helper: Nút hành động Group */
function renderGroupActions(groupId, status, primaryColor, groupName) {
    let html = '';

    switch (status) {
        case 'creator':
        case 'admin':
        case 'member':
            html += `
                <button onclick="window.GroupModule.manageMembership('${groupId}', 'leave')" 
                        class="px-5 py-2 border rounded">
                    💔 Rời Group
                </button>
            `;
            break;
        case 'pending':
            html += `<button disabled class="px-5 py-2 bg-gray-200 rounded">⏳ Đang chờ duyệt</button>`;
            break;
        case 'not_member':
        default:
            html += `
                <button onclick="window.GroupModule.manageMembership('${groupId}', 'request')" 
                        class="btn-primary px-5 py-2 rounded text-white" 
                        style="background:${primaryColor};">
                    ➕ Tham gia Group
                </button>
            `;
            break;
    }
    return html;
}


// ============================================
// 3. LOGIC TƯƠNG TÁC GROUP
// ============================================

/** Hiển thị modal tạo Group */
export function showCreateGroupModal() {
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div class="p-4">
            <h3 class="font-bold text-lg mb-4">Tạo Page/Group mới</h3>
            <input type="text" id="groupName" placeholder="Tên Page/Group" class="w-full p-2 border rounded mb-3">
            <textarea id="groupDescription" placeholder="Mô tả" rows="3" class="w-full p-2 border rounded mb-4"></textarea>
            
            <button onclick="window.GroupModule.submitCreateGroup()" 
                    id="submitGroupBtn"
                    class="btn-primary w-full p-2 text-white rounded"
                    style="background:${getConfig().primaryAction}">
                Tạo
            </button>
        </div>
    `;
    document.getElementById('appModal')?.classList.remove('hidden');
}

/** [NEW] Xử lý submit tạo Group */
export async function submitCreateGroup() {
    const name = document.getElementById('groupName').value.trim();
    const description = document.getElementById('groupDescription').value.trim();
    const btn = document.getElementById('submitGroupBtn');

    if (!name) {
        return showToast('Tên Group không được trống.', 'error');
    }

    btn.disabled = true;
    btn.textContent = 'Đang tạo...';

    try {
        const res = await apiFetch(`/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description,
                creator_id: window.currentUser.userId
            })
        });
        if (!res) return;

        const data = await res.json();

        if (res.ok && data.success) {
            showToast(data.message, 'success');
            window.closeModal();
            renderGroupList();
        } else {
            showToast(data.message || 'Tạo Group thất bại.', 'error');
        }

    } catch (err) {
        showToast('Lỗi kết nối server.', 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Tạo';
}

/** Gửi yêu cầu tham gia/Rời Group */
export async function manageMembership(groupId, action) {
    if (!window.currentUser) return;

    if (action === 'leave') {
        const isConfirmed = await new Promise(resolve => {
            if (window.currentGroupMembershipStatus === 'admin' || window.currentGroupMembershipStatus === 'creator') {
                window.showConfirmDialog(
                    'Bạn là Admin/Creator. Nếu bạn là Admin cuối cùng, bạn cần chuyển giao quyền trước khi rời nhóm. Bạn có chắc chắn muốn rời nhóm?',
                    () => resolve(true),
                    () => resolve(false)
                );
            } else {
                resolve(confirm('Bạn có chắc muốn rời Group này?'));
            }
        });
        if (!isConfirmed) return;
    }


    try {
        const res = await apiFetch(`/groups/membership`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group_id: groupId,
                user_id: window.currentUser.userId,
                action: action // 'request', 'leave'
            })
        });
        if (!res) return;

        const data = await res.json();

        if (res.ok && data.success) {
            showToast(data.message, 'success');

            if (action === 'leave' && res.status !== 403) { // Chuyển về trang danh sách nếu rời thành công
                window.switchView('pages');
            } else {
                renderGroupDetail(groupId);
            }
        } else if (res.status === 403 && data.message.includes('Admin cuối cùng')) {
            // Trường hợp Admin cuối cùng cần chuyển quyền (Backend trả 403)
            showToast(data.message, 'error');
            window.GroupModule.renderAdminTransfer(groupId);
        }
        else {
            showToast(data.message || 'Thao tác thất bại.', 'error');
        }

    } catch (err) {
        showToast('Không thể kết nối server.', 'error');
    }
}

/** [NEW] Xử lý xóa Group (Chỉ Creator/Admin cao nhất) */
export async function deleteGroup(groupId) {
    // Sử dụng window.showConfirmDialog nếu có
    const confirmed = await new Promise(resolve => {
        window.showConfirmDialog(
            'CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn Group và toàn bộ nội dung. Bạn có chắc chắn?',
            () => resolve(true),
            () => resolve(false)
        );
    });
    if (!confirmed) return;

    try {
        const res = await apiFetch(`/groups/${groupId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                admin_id: window.currentUser.userId // Người dùng hiện tại
            })
        });
        if (!res) return;

        const data = await res.json();

        if (res.ok && data.success) {
            showToast(data.message, 'success');
            // Chuyển về trang danh sách Groups
            window.switchView('pages');
        } else {
            showToast(data.message || 'Xóa Group thất bại.', 'error');
        }
    } catch (err) {
        showToast('Lỗi kết nối server.', 'error');
    }
}


/** Render trang duyệt yêu cầu tham gia (Admin Only) */
export async function renderPendingRequests(groupId) {
    const main = document.getElementById('mainContent');
    const adminId = window.currentUser.userId;
    const config = getConfig();

    main.innerHTML = `<div class="max-w-xl mx-auto"><h2 class="text-xl font-bold mb-4">Duyệt yêu cầu Group</h2><div class="p-8 text-center text-gray-500">Đang tải yêu cầu...</div></div>`;

    try {
        const res = await apiFetch(`/groups/${groupId}/pending?admin_id=${adminId}`);
        if (!res) return;
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Bạn không có quyền xem trang này.');
        }

        const requests = data;

        const requestsHtml = requests.map(req => `
            <div class="surface p-3 mb-2 rounded-lg flex justify-between items-center border border-base">
                <div class="flex items-center gap-3">
                    <div class="avatar-small rounded-full bg-blue-400 w-8 h-8 flex items-center justify-center text-white text-sm">${req.full_name.charAt(0).toUpperCase()}</div>
                    <span class="font-semibold">${req.full_name}</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.GroupModule.approveRejectMember('${groupId}', '${req.user_id}', 'approve')" 
                            class="px-3 py-1 text-white rounded" style="background:${config.primaryAction}">✅ Duyệt</button>
                    <button onclick="window.GroupModule.approveRejectMember('${groupId}', '${req.user_id}', 'reject')" 
                            class="px-3 py-1 border rounded">❌ Từ chối</button>
                </div>
            </div>
        `).join('');

        main.innerHTML = `
            <div class="max-w-xl mx-auto">
                <h2 class="text-xl font-bold mb-4">Duyệt yêu cầu Group</h2>
                ${requests.length === 0 ? '<div class="p-4 text-center text-secondary">Không có yêu cầu nào đang chờ.</div>' : requestsHtml}
                <button onclick="window.GroupModule.renderGroupDetail('${groupId}')" class="mt-4 px-4 py-2 border rounded">
                    ← Quay lại Group
                </button>
            </div>
        `;

    } catch (err) {
        main.innerHTML = `<div class="p-8 text-center text-red-500">${err.message}</div>`;
    }
}

/** [NEW] Admin Duyệt/Từ chối thành viên */
export async function approveRejectMember(groupId, userIdToManage, action) {
    // Logic của hàm này giữ nguyên

    try {
        const res = await apiFetch(`/groups/members/manage`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group_id: groupId,
                admin_id: window.currentUser.userId,
                user_id_to_manage: userIdToManage,
                action: action // 'approve' hoặc 'reject'
            })
        });
        if (!res) return;

        const data = await res.json();

        if (res.ok && data.success) {
            showToast(data.message, 'success');
            renderPendingRequests(groupId);
        } else {
            showToast(data.message || 'Thao tác thất bại.', 'error');
        }

    } catch (err) {
        showToast('Lỗi kết nối server.', 'error');
    }
}

// ============================================
// 4. QUẢN LÝ THÀNH VIÊN
// ============================================

/** [NEW] Render trang danh sách thành viên (Admin only) */
export async function renderGroupMembers(groupId) {
    const main = document.getElementById('mainContent');
    const adminId = window.currentUser.userId;
    const config = getConfig();

    main.innerHTML = `<div class="max-w-xl mx-auto"><h2 class="text-xl font-bold mb-4">Danh sách thành viên</h2><div class="p-8 text-center text-gray-500">Đang tải thành viên...</div></div>`;

    try {
        const res = await apiFetch(`/groups/${groupId}/members?admin_id=${adminId}`);
        if (!res) return;
        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Lỗi tải danh sách thành viên. (Kiểm tra quyền Admin)');
        }

        const members = data.members || [];
        const creatorId = data.creator_id;
        const isCurrentUserCreator = String(adminId) === String(creatorId);

        const membersHtml = members.map(member => {
            const isCreator = String(member.user_id) === String(creatorId);
            const isSelf = String(member.user_id) === String(adminId);

            let actionsHtml = '';

            // Chỉ Creator mới có thể chuyển quyền Admin/Xóa Admin khác
            if (isCurrentUserCreator && !isSelf) {
                // Thăng cấp lên Admin (chỉ khi chưa phải admin)
                if (member.role === 'member') {
                    actionsHtml += `<button onclick="window.GroupModule.manageMemberRole('${groupId}', '${member.user_id}', 'promote')" 
                                            class="text-xs px-2 py-1 bg-green-500 text-white rounded">⬆️ Thăng cấp</button>`;
                }
                // Giáng cấp xuống Member (chỉ khi đang là admin)
                else if (member.role === 'admin') {
                    actionsHtml += `<button onclick="window.GroupModule.manageMemberRole('${groupId}', '${member.user_id}', 'demote')" 
                                            class="text-xs px-2 py-1 border rounded">⬇️ Giáng cấp</button>`;
                }
            }

            // Xóa thành viên: Creator/Admin xóa Member thường, Creator xóa được Admin khác
            if (!isSelf && (isCurrentUserCreator || (member.role === 'member' && !isCreator))) {
                // [NEW] Nút xóa thành viên
                actionsHtml += `<button onclick="window.GroupModule.removeMember('${groupId}', '${member.user_id}')" 
                                        class="text-xs px-2 py-1 text-red-500 border rounded ml-2">❌ Xóa</button>`;
            }


            return `
                <div class="surface p-3 mb-2 rounded-lg flex justify-between items-center border border-base">
                    <div class="flex items-center gap-3 cursor-pointer" onclick="window.switchView('profile', '${member.user_id}')">
                        ${getAvatarWithStatusHtml(member.user_id, member.avatar, member.gender, 'w-10 h-10')}
                        <div>
                            <div class="font-bold text-gray-800">${member.full_name} ${isSelf ? '(Bạn)' : ''}</div>
                            <div class="text-xs text-gray-500">
                                ${isCreator ? '👑 Chủ Page' : member.role === 'admin' ? '🛡️ Admin' : '👤 Thành viên'}
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }).join('');

        main.innerHTML = `
            <div class="max-w-xl mx-auto">
                <h2 class="text-xl font-bold mb-4">Danh sách thành viên (${members.length})</h2>
                ${membersHtml}
                <button onclick="window.GroupModule.renderGroupDetail('${groupId}')" class="mt-4 px-4 py-2 border rounded">
                    ← Quay lại Group
                </button>
            </div>
        `;

    } catch (err) {
        main.innerHTML = `<div class="p-8 text-center text-red-500">${err.message}</div>`;
    }
}

/** [NEW] Xử lý xóa thành viên (gọi lại manageGroupMembers) */
export function removeMember(groupId, userIdToManage) {
    // [NEW] Sử dụng showConfirmDialog để hiển thị modal xác nhận
    window.showConfirmDialog('Bạn có chắc chắn muốn xóa thành viên này khỏi nhóm?', () => {
        window.GroupModule.manageGroupMembersAPI(groupId, userIdToManage, 'remove');
    });
}

/** [NEW] API: Xử lý xóa thành viên sau khi xác nhận */
export async function manageGroupMembersAPI(groupId, userIdToManage, action) {
    try {
        const res = await apiFetch(`/groups/members/manage`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group_id: groupId,
                admin_id: window.currentUser.userId,
                user_id_to_manage: userIdToManage,
                action: action // 'remove'
            })
        });
        if (!res) return;

        const data = await res.json();

        if (res.ok && data.success) {
            showToast(data.message, 'success');
            renderGroupMembers(groupId); // Tải lại danh sách thành viên
        } else {
            showToast(data.message || 'Xóa thành viên thất bại.', 'error');
        }

    } catch (err) {
        showToast('Lỗi kết nối server.', 'error');
    }
}


/** [NEW] Xử lý Promote/Demote (Gọi API manage-role) */
export async function manageMemberRole(groupId, userIdToManage, action) {
    // Logic của hàm này giữ nguyên

    try {
        const res = await apiFetch(`/groups/members/manage-role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group_id: groupId,
                admin_id: window.currentUser.userId, // Creator ID
                user_id_to_manage: userIdToManage,
                action: action // 'promote' hoặc 'demote'
            })
        });
        if (!res) return;

        const data = await res.json();

        if (res.ok && data.success) {
            showToast(data.message, 'success');
            renderGroupMembers(groupId); // Tải lại danh sách
        } else {
            showToast(data.message || 'Thao tác thất bại.', 'error');
        }

    } catch (err) {
        showToast('Lỗi kết nối server.', 'error');
    }
}


/** [NEW] Render trang chuyển giao quyền Admin (Khi Admin cuối cùng rời nhóm) */
export async function renderAdminTransfer(groupId) {
    const main = document.getElementById('mainContent');
    const adminId = window.currentUser.userId;
    const config = getConfig();

    // Tải danh sách thành viên hiện tại (trừ bản thân)
    try {
        const res = await apiFetch(`/groups/${groupId}/members?admin_id=${adminId}`);
        if (!res) return;
        const data = await res.json();

        if (!res.ok || !data.success) throw new Error('Không thể tải thành viên để chuyển quyền.');

        // Chỉ lọc ra các thành viên (role=member, không phải Admin/Creator) để chuyển giao quyền Creator
        const members = data.members.filter(m => String(m.user_id) !== String(adminId) && m.role === 'member');

        main.innerHTML = `
            <div class="max-w-xl mx-auto surface p-6 rounded-lg shadow-xl">
                <h2 class="text-xl font-bold mb-4 text-red-500">🚨 Yêu cầu Chuyển Giao Quyền Admin/Xóa Page</h2>
                <p class="mb-4">Bạn là Admin/Creator cuối cùng và nhóm vẫn còn thành viên. Vui lòng chọn một **Thành viên** để chuyển giao quyền Admin và quyền Xóa Page trước khi rời nhóm.</p>
                
                <div id="transferMembersList" class="space-y-3 max-h-60 overflow-y-auto">
                    ${members.length === 0
                ? '<div class="p-4 text-center text-secondary">Không có Thành viên nào đủ điều kiện để chuyển quyền.</div>'
                : members.map(m => `
                            <div class="p-3 border rounded flex justify-between items-center bg-gray-50">
                                <span>${m.full_name} (${m.role})</span>
                                <button onclick="window.GroupModule.confirmAdminTransfer('${groupId}', '${m.user_id}')" 
                                        class="text-xs px-3 py-1 bg-blue-500 text-white rounded">
                                    Chuyển giao
                                </button>
                            </div>
                        `).join('')
            }
                </div>
                <button onclick="window.GroupModule.manageMembership('${groupId}', 'leave')" class="mt-4 px-4 py-2 border rounded">
                    ← Thử Rời Group lại (Nếu đã chuyển giao ở nơi khác)
                </button>
            </div>
        `;

    } catch (err) {
        main.innerHTML = `<div class="p-8 text-center text-red-500">Lỗi tải trang chuyển quyền: ${err.message}</div>`;
    }
}

/** [NEW] Xử lý xác nhận chuyển giao quyền Admin */
export async function confirmAdminTransfer(groupId, newAdminId) {
    const isConfirmed = confirm(`Bạn có chắc chắn muốn chuyển giao quyền Admin và quyền Xóa Page cho người này và rời nhóm?`);
    if (!isConfirmed) return;

    try {
        // [NEW API] Gọi API chuyển quyền (PUT /groups/members/transfer-admin)
        const res = await apiFetch(`/groups/members/transfer-admin`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group_id: groupId,
                old_admin_id: window.currentUser.userId, // Người chuyển giao
                new_admin_id: newAdminId, // Người nhận quyền
            })
        });
        if (!res) return;

        const data = await res.json();

        if (res.ok && data.success) {
            showToast(data.message, 'success');
            window.switchView('pages'); // Quay về trang danh sách Page
        } else {
            showToast(data.message || 'Chuyển giao quyền thất bại.', 'error');
        }

    } catch (err) {
        showToast('Lỗi kết nối server.', 'error');
    }
}


export function showGroupCreatePostModal(groupId) {
    if (window.NewsfeedModule && window.NewsfeedModule.showCreatePostModal) {
        window.NewsfeedModule.showCreatePostModal(groupId);
    } else {
        showToast("Lỗi: Module Newsfeed chưa sẵn sàng.", 'error');
    }
}


// ============================================
// EXPOSE TO WINDOW
// ============================================

window.GroupModule = {
    renderGroupList,
    renderGroupDetail,
    showCreateGroupModal,
    submitCreateGroup,
    manageMembership,
    renderPendingRequests,
    approveRejectMember,
    deleteGroup,
    showGroupCreatePostModal,
    // Chức năng quản lý thành viên
    renderGroupMembers,
    manageMemberRole,
    removeMember,
    manageGroupMembersAPI, // API gọi để remove
    renderAdminTransfer,
    confirmAdminTransfer,
    // Hàm Helper
    renderContentGate,
    renderGroupPostAndFeed
};