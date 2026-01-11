// ADMIN DASHBOARD LOGIC

const API_BASE = 'http://localhost:3000/api';
let currentUser = null;
try {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) currentUser = JSON.parse(storedUser);
} catch (e) { console.error("Error loading user", e); }
window.AdminModule = window.AdminModule || {}; // [FIX] Initialize immediately

// Helper: Fetch with Auth
async function authFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
        alert("Phiên đăng nhập hết hạn hoặc bạn không có quyền Admin.");
        handleLogout(); // Clean up storage
        return null;
    }
    return res;
}

// LOGOUT LOGIC
window.handleLogout = function () {
    if (confirm("Bạn có chắc chắn muốn đăng xuất?")) {
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('user'); // Clean up potential legacy keys
        window.location.href = 'index.html';
    }
}

// AVATAR HELPER
function getAvatar(path, gender) {
    if (!path || path === 'null' || path === 'undefined' || path === '') {
        const g = String(gender).toLowerCase();
        if (g === 'female' || g === 'nữ') return 'images/default_avatar_female.png';
        return 'images/default_avatar_male.png';
    }
    if (path.startsWith('http')) return path;

    // If it's already a local path (images/...), return as is
    if (path.startsWith('images/')) return path;

    // Clean path if it double includes 'uploads/'
    let cleanPath = path.replace(/\\/g, '/');
    if (cleanPath.startsWith('uploads/')) cleanPath = cleanPath.substring(8);

    return `http://localhost:3000/uploads/${cleanPath}`;
}


// ============================================
// MAIN APP & ROUTING
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verify Admin & Load User Info
    const token = localStorage.getItem('token');
    if (!token) return window.location.href = 'index.html';

    // Check both keys common in this app
    const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (userStr) {
        currentUser = JSON.parse(userStr);
        // Correcting property mismatch if it exists
        const adminDisplayName = currentUser.name || currentUser.full_name || "Admin";
        const adminId = currentUser.userId || currentUser.id;

        document.getElementById('adminName').innerText = adminDisplayName;
        document.getElementById('adminAvatar').src = currentUser.avatar || 'images/default_admin.png';

        // Update role display
        const roleDisplay = document.querySelector('.text-xs.text-slate-500');
        if (roleDisplay) {
            roleDisplay.innerText = currentUser.role === 'super_admin' ? 'Super Administrator' : 'Administrator';
        }

        // Strict Client check (Backend will enforce too)
        if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
            alert("Truy cập bị từ chối.");
            window.location.href = 'index.html';
        }
    }

    // 2. Load Default Module
    switchModule('overview');

    // 3. Socket.IO for Admin - Connect to backend server explicitly
    const socket = io('http://localhost:3000');
    socket.emit('register_user', currentUser.id); // Identifying as admin

    socket.on('admin_online_count', (count) => {
        const el = document.getElementById('stat-online');
        if (el) el.innerText = count;
    });
});

window.switchModule = async function (moduleName) {
    // Update Active Nav
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('bg-slate-800', 'text-white'));
    const navItem = document.getElementById(`nav-${moduleName}`);
    if (navItem) navItem.classList.add('bg-slate-800', 'text-white');

    const contentArea = document.getElementById('contentArea');
    const pageTitle = document.getElementById('pageTitle');

    // Render Logic
    if (moduleName === 'overview') {
        pageTitle.innerText = "Tổng quan hệ thống";
        await renderOverview(contentArea);
    } else if (moduleName === 'users') {
        pageTitle.innerText = "Quản lý người dùng";
        renderUsersTemplate(contentArea);
        loadUsers();
    } else if (moduleName === 'reports') {
        pageTitle.innerText = "Quản lý báo cáo";
        renderReportsTemplate(contentArea);
        loadReports();
    } else if (moduleName === 'content') {
        pageTitle.innerText = "Kiểm duyệt nội dung";
        renderContentTemplate(contentArea);
        window.AdminModule.loadPosts();
    } else if (moduleName === 'settings') {
        pageTitle.innerText = "Cấu hình hệ thống";
        renderSettingsTemplate(contentArea);
        window.AdminModule.loadSettings();
    } else if (moduleName === 'profile') {
        pageTitle.innerText = "Hồ sơ của tôi";
        window.AdminModule.loadMyProfile(contentArea);
    } else {
        contentArea.innerHTML = `<div class="p-10 text-center text-gray-400">Module chưa sẵn sàng.</div>`;
    }
};

// ============================================
// MODULE 4: CONTENT
// ============================================
function renderContentTemplate(container) {
    const tpl = document.getElementById('tpl-content').content.cloneNode(true);
    container.innerHTML = '';
    container.appendChild(tpl);
}

window.AdminModule.loadPosts = async function () {
    const tbody = document.getElementById('posts-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Đang tải...</td></tr>';

    const res = await authFetch('/admin/posts');
    if (!res) return;
    const data = await res.json();

    if (data.success && data.posts.length > 0) {
        tbody.innerHTML = data.posts.map(p => `
             <tr class="bg-white border-b hover:bg-slate-50 transition" id="row-post-${p.id}">
                <td class="px-6 py-4 flex items-center">
                    <img class="w-8 h-8 rounded-full mr-2 object-cover" src="${getAvatar(p.avatar, p.gender)}" onerror="this.src='images/default.png'">
                    <span class="font-bold text-sm text-slate-700">${p.full_name}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm text-slate-700 max-w-md truncate">${p.content || '[Chỉ có ảnh]'}</div>
                    ${p.image_url ? `<img src="http://localhost:3000/${p.image_url}" class="h-10 mt-1 rounded border">` : ''}
                </td>
                <td class="px-6 py-4 text-xs text-slate-500">
                    ${new Date(p.created_at).toLocaleString()}
                </td>
                <td class="px-6 py-4 text-xs">
                    👍 ${p.like_count} • 💬 ${p.comment_count}
                </td>
                <td class="px-6 py-4 text-right">
                    <button onclick="window.AdminModule.deletePost(${p.id})" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-3 py-2 rounded-lg">Xóa bài</button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Không có bài viết mới.</td></tr>';
    }
}

window.AdminModule.deletePost = async function (postId) {
    if (!confirm("Bạn có chắc chắn muốn XÓA VĨNH VIỄN bài viết này?")) return;

    const res = await authFetch(`/admin/posts/${postId}`, { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
        alert("Đã xóa bài viết.");
        document.getElementById(`row-post-${postId}`)?.remove();
    } else {
        alert("Lỗi: " + data.message);
    }
}

// ============================================
// MODULE 5: SETTINGS
// ============================================
function renderSettingsTemplate(container) {
    const tpl = document.getElementById('tpl-settings').content.cloneNode(true);
    container.innerHTML = '';
    container.appendChild(tpl);

    // Initial Load
    if (typeof loadSettings === 'function') loadSettings();
    if (typeof loadAdmins === 'function') loadAdmins();
    if (typeof loadSystemLogs === 'function') loadSystemLogs();
}

// ============================================
// MODULE 1: OVERVIEW
// ============================================
async function renderOverview(container) {
    const tpl = document.getElementById('tpl-overview').content.cloneNode(true);
    container.innerHTML = '';
    container.appendChild(tpl);

    const res = await authFetch('/admin/stats');
    if (!res) return;
    const data = await res.json();
    if (data.success) {
        document.getElementById('stat-users').innerText = data.stats.users;
        document.getElementById('stat-posts').innerText = data.stats.new_posts;
        document.getElementById('stat-reports').innerText = data.stats.pending_reports;

        if (data.stats.pending_reports > 0) {
            const badge = document.getElementById('badge-reports');
            badge.innerText = data.stats.pending_reports;
            badge.classList.remove('hidden');
        }

        // RENDER CHART
        const ctx = document.getElementById('growthChart')?.getContext('2d');
        if (ctx && data.chart) {
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.chart.map(d => new Date(d.date).toLocaleDateString()),
                    datasets: [
                        {
                            label: 'Người dùng mới',
                            data: data.chart.map(d => d.new_users),
                            borderColor: '#3b82f6',
                            tension: 0.4
                        },
                        {
                            label: 'Tương tác',
                            data: data.chart.map(d => d.interactions),
                            borderColor: '#10b981',
                            tension: 0.4
                        }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const list = document.getElementById('activity-list');
        list.innerHTML = data.activities.map(a => `
            <li class="flex items-center text-sm p-2 hover:bg-slate-50 rounded-lg">
                <span class="w-2 h-2 rounded-full bg-blue-500 mr-3"></span>
                <span class="flex-1 text-slate-700">${a.message}</span>
                <span class="text-xs text-slate-400">${new Date(a.time).toLocaleTimeString()}</span>
            </li>
        `).join('');
    }
}

// ============================================
// ADMIN MANAGEMENT (In Settings)
// ============================================
window.AdminModule.loadSettings = async function () {
    // 1. Load Logs
    const logContainer = document.getElementById('audit-logs-container');
    const resLogs = await authFetch('/admin/logs');
    if (resLogs) {
        const data = await resLogs.json();
        if (data.success && data.logs.length > 0) {
            logContainer.innerHTML = data.logs.map(l => `
                <div class="border-b border-slate-700 pb-1 mb-1">
                    <span class="text-blue-400">[${new Date(l.time).toLocaleTimeString()}]</span>
                    <span class="text-yellow-500">${l.admin}</span>: 
                    <span class="text-slate-300">${l.action}</span>
                </div>
            `).join('');
        }
    }

    // 2. Load Admins
    loadAdmins();
}

async function loadAdmins() {
    const tbody = document.getElementById('admin-list-table');
    if (!tbody) return;
    const res = await authFetch('/admin/admins');
    if (!res) return;
    const data = await res.json();

    if (data.success) {
        tbody.innerHTML = data.admins.map(a => {
            const isSelf = String(a.id) === String(currentUser.id);
            const isSuper = currentUser.role === 'super_admin';
            const isAdmin = currentUser.role === 'admin';
            const targetIsSuper = a.role === 'super_admin';

            let canEdit = false;
            let canDelete = false;

            // Permission Logic
            if (isSelf) {
                canEdit = true; // Edit Profile
                canDelete = false; // Never delete self
            } else {
                if (isSuper) {
                    canEdit = true;
                    canDelete = true;
                } else if (isAdmin) {
                    // [REQ] Admin can ONLY VIEW other admins. No Edit, No Delete.
                    canEdit = false;
                    canDelete = false;
                }
            }

            let buttonsHtml = '';
            if (canEdit) {
                buttonsHtml += `<button onclick="window.AdminModule.editAdmin(${a.id}, '${a.username}', '${a.full_name}', '${a.role}')" class="text-blue-500 hover:text-blue-700 font-bold text-xs border border-blue-200 px-2 py-1 rounded hover:bg-blue-50 mr-1">Sửa</button>`;
            }
            if (canDelete) {
                buttonsHtml += `<button onclick="window.AdminModule.deleteAdmin(${a.id})" class="text-red-500 hover:text-red-700 font-bold text-xs border border-red-200 px-2 py-1 rounded hover:bg-red-50">Xóa</button>`;
            }
            if (!canEdit && !canDelete) {
                buttonsHtml = '<span class="text-slate-300 text-xs">(Chỉ xem)</span>';
            }

            // Avatar Logic
            let avatarSrc = getAvatar(a.avatar, a.gender);
            let fallbackAvatar = 'images/default_admin.png';

            if (a.role === 'super_admin') {
                fallbackAvatar = 'images/default_super_admin.png';
                // If avatar is missing, force default super admin
                if (!a.avatar) avatarSrc = fallbackAvatar;
            } else {
                // Admin
                if (!a.avatar) avatarSrc = fallbackAvatar;
            }

            return `
            <tr class="border-b hover:bg-slate-50 ${isSelf ? 'bg-blue-50/30' : ''}">
                <td class="px-4 py-3 font-medium flex items-center gap-3">
                    <img src="${avatarSrc}" onerror="this.src='${fallbackAvatar}'" class="w-8 h-8 rounded-full border">
                    <div>
                        <div class="font-bold text-slate-700">
                            ${a.username}
                            ${isSelf ? '<span class="text-xs text-blue-500 font-normal ml-1">(Bạn)</span>' : ''}
                        </div>
                        <div class="text-xs text-slate-400">${a.email || 'N/A'}</div>
                    </div>
                </td>
                <td class="px-4 py-3">${a.full_name}</td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded text-xs font-bold ${a.role === 'super_admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
                        ${a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                </td>
                <td class="px-4 py-3 text-right">
                    ${buttonsHtml}
                </td>
            </tr>
        `}).join('');
    }
}

window.AdminModule.showAddAdminModal = function () {
    // Remove existing if any
    document.getElementById('addAdminModal')?.remove();

    const isSuper = currentUser && currentUser.role === 'super_admin';

    const modalHtml = `
    <div id="addAdminModal" class="fixed inset-0 z-[3000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="this.parentElement.remove()"></div>
        <div class="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div class="bg-gradient-to-r from-slate-800 to-slate-900 p-4 border-b border-slate-700">
                <h3 class="text-lg font-bold text-white flex items-center gap-2">
                    <span>🛡️</span> Thêm Quản trị viên mới
                </h3>
            </div>
            
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Username (Tên đăng nhập)</label>
                    <input type="text" id="newAdminUsername" class="w-full p-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="VD: admin_moi">
                </div>

                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Họ tên đầy đủ</label>
                    <input type="text" id="newAdminFullname" class="w-full p-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="VD: Nguyễn Văn A">
                </div>

                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Mật khẩu</label>
                    <input type="password" id="newAdminPassword" class="w-full p-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="********">
                </div>

                ${isSuper ? `
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-2">Vai trò (Role)</label>
                    <div class="flex gap-4">
                        <label class="flex items-center cursor-pointer">
                            <input type="radio" name="newAdminRole" value="admin" checked class="w-4 h-4 text-blue-600">
                            <span class="ml-2 text-sm text-slate-700">Admin (Thường)</span>
                        </label>
                        <label class="flex items-center cursor-pointer">
                            <input type="radio" name="newAdminRole" value="super_admin" class="w-4 h-4 text-purple-600">
                            <span class="ml-2 text-sm text-purple-700 font-bold">Super Admin</span>
                        </label>
                    </div>
                </div>
                ` : ''}

                <div class="pt-2 flex gap-3">
                    <button onclick="document.getElementById('addAdminModal').remove()" class="flex-1 py-2 bg-gray-100 text-slate-600 rounded-lg font-medium hover:bg-gray-200 transition">Hủy</button>
                    <button onclick="window.AdminModule.submitAddAdmin()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 transition">Thêm mới</button>
                </div>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('newAdminUsername').focus();
}

window.AdminModule.submitAddAdmin = function () {
    const username = document.getElementById('newAdminUsername').value.trim();
    const full_name = document.getElementById('newAdminFullname').value.trim();
    const password = document.getElementById('newAdminPassword').value.trim();

    // Default to 'admin' if role radio is hidden (regular admin adding admin?)
    // Note: Conceptually regular admin usually shouldn't create other admins, but if permitted, role is 'admin'.
    const roleRadio = document.querySelector('input[name="newAdminRole"]:checked');
    const role = roleRadio ? roleRadio.value : 'admin';

    if (!username || !full_name || !password) {
        alert("Vui lòng nhập đầy đủ thông tin.");
        return;
    }

    createAdmin({ username, full_name, password, role });
    document.getElementById('addAdminModal').remove();
}

async function createAdmin(payload) {
    const res = await authFetch('/admin/admins', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
        alert("Đã tạo Admin thành công!");
        loadAdmins();
    } else {
        alert("Lỗi: " + data.message);
    }
}

window.AdminModule.deleteAdmin = async function (id) {
    if (!confirm("CẢNH BÁO: Bạn có chắc chắn muốn xóa tài khoản Admin này không?")) return;

    const res = await authFetch(`/admin/admins/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
        alert("Đã xóa Admin.");
        loadAdmins();
    } else {
        alert("Lỗi: " + data.message);
    }
}

window.AdminModule.loadMyProfile = function (container) {
    const tpl = document.getElementById('tpl-profile').content.cloneNode(true);
    container.innerHTML = '';

    // Fill Data
    const u = currentUser;
    if (!u) return;

    const displayName = u.name || u.full_name || "Admin";
    const username = u.username;

    tpl.getElementById('my-profile-name').innerText = displayName;
    tpl.getElementById('my-profile-username').innerText = '@' + username;
    tpl.getElementById('my-profile-role').innerText = u.role === 'super_admin' ? 'Super Administrator' : 'Administrator';
    tpl.getElementById('my-profile-joined').innerText = new Date(u.created_at || Date.now()).toLocaleDateString('vi-VN');

    // Avatar Logic
    let avatarSrc = getAvatar(u.avatar, u.gender);
    let fallbackAvatar = 'images/default_admin.png';
    if (u.role === 'super_admin') {
        fallbackAvatar = 'images/default_super_admin.png';
        if (!u.avatar) avatarSrc = fallbackAvatar;
    }

    const imgEl = tpl.getElementById('my-profile-avatar');
    imgEl.src = avatarSrc;
    imgEl.onerror = function () { this.src = fallbackAvatar; };

    container.appendChild(tpl);
}

window.AdminModule.editMyProfile = function () {
    const u = currentUser;
    if (!u) return;
    const adminId = u.userId || u.id;
    const adminName = u.name || u.full_name;
    window.AdminModule.editAdmin(adminId, u.username, adminName, u.role);
}

// Global variable to track editing
let currentEditId = null;
let tempVerifiedCredentials = null; // Store { current_username, current_password } after verification

window.AdminModule.editAdmin = function (id, username, fullName, role) {
    currentEditId = id;
    const myId = currentUser.userId || currentUser.id;
    const isSelf = String(id) === String(myId);
    tempVerifiedCredentials = null; // Reset

    // Remove old modal
    document.getElementById('editAdminModal')?.remove();

    if (isSelf) {
        // Stage 1: Verification Form
        renderVerificationModal(username); // Pass current username to prefill if reasonable, or leave blank? User said "nhập đúng tên". Let's leave blank or prefill? Usually prefill username is fine.
    } else {
        // Edit Role Form (Standard)
        renderRoleEditModal(id, username, fullName, role);
    }
}

// Helper: Stage 1 Modal
function renderVerificationModal(currentUsername) {
    const modalHtml = `
    <div id="editAdminModal" class="fixed inset-0 z-[3000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="this.parentElement.remove()"></div>
        <div class="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div class="bg-gradient-to-r from-slate-700 to-slate-800 p-4 border-b border-slate-600">
                <h3 class="text-lg font-bold text-white flex items-center gap-2">
                    <span>🔒</span> Xác thực tài khoản
                </h3>
            </div>
            
            <div class="p-6 space-y-4">
                <p class="text-sm text-slate-500 mb-4">Vui lòng nhập thông tin đăng nhập hiện tại để tiếp tục chỉnh sửa.</p>
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Tên đăng nhập hiện tại</label>
                    <input type="text" id="verifyUsername" value="${currentUsername}" class="w-full p-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Mật khẩu hiện tại</label>
                    <input type="password" id="verifyPassword" class="w-full p-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="********">
                </div>

                <div class="pt-4 flex gap-3">
                    <button onclick="document.getElementById('editAdminModal').remove()" class="flex-1 py-2 bg-gray-100 text-slate-600 rounded-lg font-medium hover:bg-gray-200 transition">Hủy</button>
                    <button onclick="window.AdminModule.verifyAndNext(${currentEditId})" class="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 transition">Tiếp tục ➡</button>
                </div>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setTimeout(() => document.getElementById('verifyPassword')?.focus(), 100);
}

// NEW: Verify and Transition
window.AdminModule.verifyAndNext = async function (id) {
    const username = document.getElementById('verifyUsername').value.trim();
    const password = document.getElementById('verifyPassword').value.trim();

    if (!username || !password) return alert("Vui lòng nhập đầy đủ thông tin.");

    try {
        const res = await authFetch('/admin/verify-credentials', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success) {
            // Success: Store creds and Show Stage 2
            tempVerifiedCredentials = { current_username: username, current_password: password };

            // Remove Stage 1 Modal
            document.getElementById('editAdminModal')?.remove();

            // Show Stage 2 Modal (Update Info)
            renderUpdateProfileModal(id);
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (e) {
        console.error(e);
        alert("Lỗi kết nối máy chủ.");
    }
}

// Helper: Stage 2 Modal
function renderUpdateProfileModal(id) {
    // We need current values to prefill. Since we might have verified verifyUsername != currentUser.username (unlikely but possible if admin changed someone else? No it's self), we use inputs.
    // Actually best to re-use currentUser object since `isSelf` implies it.

    // Note: We prefill NEW INFO with current values.
    const displayName = currentUser.name || currentUser.full_name || "";
    const modalHtml = `
    <div id="editAdminModal" class="fixed inset-0 z-[3000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="this.parentElement.remove()"></div>
        <div class="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div class="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 border-b border-blue-500">
                <h3 class="text-lg font-bold text-white flex items-center gap-2">
                    <span>✏️</span> Cập nhật thông tin
                </h3>
            </div>
            
            <div class="p-6 space-y-4">
                 <div class="bg-green-50 text-green-700 p-2 text-xs rounded mb-2 border border-green-100 flex items-center gap-2">
                    <span>✅</span> Đã xác thực bảo mật.
                </div>

                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Tên đăng nhập mới</label>
                    <input type="text" id="newUsername" value="${tempVerifiedCredentials.current_username}" class="w-full p-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-bold text-slate-700 mb-1">Họ tên hiển thị</label>
                    <input type="text" id="newFullName" value="${displayName}" class="w-full p-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-1">Mật khẩu mới</label>
                        <input type="password" id="newPassword" class="w-full p-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Để trống nếu giữ cũ">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-1">Nhập lại mật khẩu</label>
                        <input type="password" id="confirmNewPassword" class="w-full p-2.5 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="...">
                    </div>
                </div>

                <div class="pt-4 flex gap-3">
                    <button onclick="document.getElementById('editAdminModal').remove()" class="flex-1 py-2 bg-gray-100 text-slate-600 rounded-lg font-medium hover:bg-gray-200 transition">Hủy</button>
                    <button onclick="window.AdminModule.submitEditAdmin(true)" class="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 transition">Lưu thay đổi</button>
                </div>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function renderRoleEditModal(id, username, fullName, role) {
    const modalHtml = `
    <div id="editAdminModal" class="fixed inset-0 z-[3000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="this.parentElement.remove()"></div>
        <div class="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
             <div class="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 border-b border-blue-500">
                <h3 class="text-lg font-bold text-white flex items-center gap-2">
                    <span>⚖️</span> Phân quyền Admin
                </h3>
            </div>
            
            <div class="p-6 space-y-4">
                <div class="mb-4">
                    <p class="text-sm text-slate-500 mb-1">Đang sửa quyền hạn cho:</p>
                    <p class="font-bold text-lg text-slate-800">${fullName} (@${username})</p>
                </div>
                <div>
                     <label class="block text-sm font-bold text-slate-700 mb-2">Vai trò mới</label>
                    <div class="flex flex-col gap-2">
                        <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${role === 'admin' ? 'bg-blue-50 border-blue-200' : ''}">
                            <input type="radio" name="editRole" value="admin" ${role === 'admin' ? 'checked' : ''} class="w-4 h-4 text-blue-600">
                            <span class="ml-3 font-medium">Admin (Thường)</span>
                        </label>
                        <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${role === 'super_admin' ? 'bg-purple-50 border-purple-200' : ''}">
                            <input type="radio" name="editRole" value="super_admin" ${role === 'super_admin' ? 'checked' : ''} class="w-4 h-4 text-purple-600">
                            <span class="ml-3 font-medium text-purple-700">Super Admin</span>
                        </label>
                    </div>
                </div>

                <div class="pt-4 flex gap-3">
                    <button onclick="document.getElementById('editAdminModal').remove()" class="flex-1 py-2 bg-gray-100 text-slate-600 rounded-lg font-medium hover:bg-gray-200 transition">Hủy</button>
                    <button onclick="window.AdminModule.submitEditAdmin(false)" class="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 transition">Lưu thay đổi</button>
                </div>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}


window.AdminModule.submitEditAdmin = async function (isSelf) {
    if (!currentEditId) {
        console.error("Missing currentEditId");
        return;
    }

    if (isSelf) {
        if (!tempVerifiedCredentials) return alert("Phiên làm việc hết hạn. Vui lòng thử lại.");

        const new_username = document.getElementById('newUsername').value.trim();
        const full_name = document.getElementById('newFullName').value.trim();
        const new_password = document.getElementById('newPassword').value.trim();
        const confirm_new_password = document.getElementById('confirmNewPassword').value.trim();

        if (!new_username || !full_name) {
            return alert("Vui lòng nhập đầy đủ tên đăng nhập và họ tên.");
        }
        if (new_password && new_password !== confirm_new_password) {
            return alert("Mật khẩu mới và xác nhận mật khẩu không khớp.");
        }

        try {
            const res = await authFetch('/admin/admins/profile', {
                method: 'PUT',
                body: JSON.stringify({
                    ...tempVerifiedCredentials, // Pass the verified old credentials
                    new_username,
                    full_name,
                    new_password
                })
            });
            const data = await res.json();

            if (data.success) {
                alert(data.message);
                // Update local storage
                if (currentUser) {
                    currentUser.name = full_name; // Update 'name' property
                    currentUser.full_name = full_name;
                    currentUser.username = new_username;
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    localStorage.setItem('user', JSON.stringify(currentUser));
                    document.getElementById('adminName').innerText = full_name;

                    // Refresh Profile View if open
                    if (document.getElementById('my-profile-name')) {
                        window.AdminModule.loadMyProfile(document.getElementById('contentArea'));
                    }
                }

                document.getElementById('editAdminModal')?.remove();
                tempVerifiedCredentials = null; // Clear
                if (typeof loadAdmins === 'function') loadAdmins();
            } else {
                alert("Lỗi: " + data.message);
            }
        } catch (e) {
            console.error(e);
            alert("Lỗi kết nối máy chủ.");
        }

    } else {
        // Handle Role Update
        const role = document.querySelector('input[name="editRole"]:checked')?.value;
        if (!role) return;

        const res = await authFetch(`/admin/admins/${currentEditId}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            document.getElementById('editAdminModal')?.remove();
            if (typeof loadAdmins === 'function') loadAdmins();
        } else {
            alert("Lỗi: " + data.message);
        }
    }
};

// ============================================
// MODULE 2: USERS
// ============================================
function renderUsersTemplate(container) {
    const tpl = document.getElementById('tpl-users').content.cloneNode(true);
    container.innerHTML = '';
    container.appendChild(tpl);
}

// window.AdminModule = {}; // [FIX] Removed reset

window.AdminModule.loadUsers = loadUsers; // bind global
async function loadUsers(query = '') {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Đang tải...</td></tr>';

    const res = await authFetch(`/admin/users?q=${encodeURIComponent(query)}`);
    if (!res) return;
    const data = await res.json();

    if (data.success && data.users.length > 0) {
        tbody.innerHTML = data.users.map(u => {
            // RBAC Logic
            const isSelf = String(u.id) === String(currentUser.id);
            const isSuper = currentUser.role === 'super_admin';
            const isAdmin = currentUser.role === 'admin';

            let canLock = false;

            // Logig Khóa: "supper_admin có thể khóa admin và user, còn admin không thể khóa supper_admin chỉ có thể khóa user"
            if (isSelf) {
                canLock = false; // Không thể tự khóa chính mình
            } else if (isSuper) {
                // Super Admin can khóa tất cả (user, admin, super_admin khác)
                // Note: User didn't say Super Admin can't lock Super Admin, just "admin không thể khóa supper_admin"
                canLock = true;
            } else if (isAdmin) {
                // Admin chỉ có thể khóa User
                if (u.role === 'user') {
                    canLock = true;
                }
            }

            // Avatar Logic for Users List
            let avatarSrc = getAvatar(u.avatar, u.gender);
            let fallbackAvatar = 'images/default_avatar_male.png';

            if (u.role === 'super_admin') {
                fallbackAvatar = 'images/default_super_admin.png';
                if (!u.avatar) avatarSrc = fallbackAvatar;
            } else if (u.role === 'admin') {
                fallbackAvatar = 'images/default_admin.png';
                if (!u.avatar) avatarSrc = fallbackAvatar;
            } else {
                // Regular User - fallback handled by getAvatar usually, or default logic
                // If avatar is missing, getAvatar returns gender default.
                // We keep fallback as male/female?
                // Simple fallback:
                if (u.gender === 'female' || u.gender === 'Nữ') fallbackAvatar = 'images/default_avatar_female.png';
            }

            return `
            <tr class="bg-white border-b hover:bg-slate-50 transition ${isSelf ? 'bg-blue-50/50' : ''}">
                <td class="px-6 py-4 flex items-center whitespace-nowrap">
                    <img class="w-8 h-8 rounded-full mr-3 object-cover" 
                         src="${avatarSrc}" 
                         onerror="this.src='${fallbackAvatar}'">
                    <div>
                        <div class="font-bold text-slate-800">
                            ${u.full_name} 
                            ${isSelf ? '<span class="text-xs text-blue-500 font-normal">(Bạn)</span>' : ''}
                        </div>
                        <div class="text-xs text-slate-500">@${u.username}</div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-xs text-slate-400 mb-1">ID: ${u.id}</div>
                    <span class="text-xs font-bold uppercase ${u.role === 'admin' ? 'text-blue-600' : u.role === 'super_admin' ? 'text-purple-600' : 'text-gray-500'}">${u.role}</span>
                </td>
                <td class="px-6 py-4">
                    ${u.is_locked
                    ? '<span class="px-2 py-1 bg-red-100 text-red-600 text-xs rounded-full font-bold">Bị khóa</span>'
                    : '<span class="px-2 py-1 bg-green-100 text-green-600 text-xs rounded-full font-bold">Hoạt động</span>'}
                </td>
                <td class="px-6 py-4 text-xs text-slate-500">
                    ${new Date(u.created_at).toLocaleDateString()}
                </td>
                <td class="px-6 py-4 text-right">
                    ${canLock ? `
                        <button onclick="window.AdminModule.toggleLock(${u.id}, ${!u.is_locked})" 
                                class="font-bold hover:underline ${u.is_locked ? 'text-green-600' : 'text-red-600'} text-xs">
                            ${u.is_locked ? 'Mở khóa' : 'Khóa'}
                        </button>
                    ` : '<span class="text-slate-300">-</span>'}
                </td>
            </tr>
            `;
        }).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Không tìm thấy người dùng.</td></tr>';
    }
}

window.AdminModule.toggleLock = async function (userId, lock) {
    if (!confirm(lock ? "Bạn có chắc chắn muốn KHÓA tài khoản này?" : "Mở khóa tài khoản này?")) return;

    const res = await authFetch('/admin/users/lock', {
        method: 'POST',
        body: JSON.stringify({ userId, isLocked: lock })
    });
    const data = await res.json();
    if (data.success) {
        alert(data.message);
        loadUsers();
    } else {
        alert("Lỗi: " + data.message);
    }
};

// ============================================
// MODULE 3: REPORTS
// ============================================
function renderReportsTemplate(container) {
    const tpl = document.getElementById('tpl-reports').content.cloneNode(true);
    container.innerHTML = '';
    container.appendChild(tpl);
}

async function loadReports() {
    const tbody = document.getElementById('reports-table-body');
    const res = await authFetch('/admin/reports');
    if (!res) return;
    const data = await res.json();

    if (data.success && data.reports.length > 0) {
        tbody.innerHTML = data.reports.map(r => `
            <tr class="bg-white border-b hover:bg-slate-50">
                <td class="px-6 py-4 font-bold text-slate-700">
                    ${r.reporter_name || 'Unknown'}
                </td>
                <td class="px-6 py-4">
                    <div class="font-bold flex items-center gap-2">
                        ${r.target_type.toUpperCase()}
                        ${r.violation_count > 0 ?
                `<span class="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full border border-red-200" title="Đã vi phạm ${r.violation_count} lần">
                                ⚠️ ${r.violation_count}
                            </span>` : ''}
                    </div>
                    <div class="text-xs text-slate-500 truncate w-40" title="${r.post_content || r.target_name || ''}">
                        ${r.violation_count > 0 ? `<span class="text-red-500 font-bold">[${r.violator_name}]</span>` : ''} 
                        ${r.post_content || r.target_name || ''}
                    </div>
                </td>
                <td class="px-6 py-4 text-red-500 font-medium">
                    ${r.reason}
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs rounded-full font-bold 
                        ${r.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                r.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                        ${r.status}
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    ${r.status === 'pending' ? `
                        <button onclick="window.AdminModule.showEnforcementModal(${r.id}, ${r.violator_id}, '${r.target_type}')" 
                                class="text-white bg-orange-500 hover:bg-orange-600 text-xs px-3 py-1.5 rounded mr-1">
                            ⚖️ Xử lý
                        </button>
                        <button onclick="window.AdminModule.dismissReport(${r.id})" 
                                class="text-gray-500 hover:text-gray-700 text-xs border px-2 py-1 rounded">
                            Bỏ qua
                        </button>
                    ` : '<span class="text-xs text-gray-400">Đã xử lý</span>'}
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Không có báo cáo nào.</td></tr>';
    }
}

// [UPDATED] Resolve logic replaced by Enforcement System
window.AdminModule.dismissReport = async function (reportId) {
    if (!confirm("Bỏ qua báo cáo này?")) return;
    const res = await authFetch(`/admin/reports/${reportId}/dismiss`, { method: 'POST' });
    if (res) loadReports();
};

window.AdminModule.showEnforcementModal = async function (reportId, userId, targetType) {
    // If no userId (e.g. unknown violator), warn admin
    if (!userId || userId === 'null') {
        alert("Không xác định được người vi phạm (User ID null).");
        return;
    }

    // Fetch user's violation history
    const res = await authFetch(`/admin/users/${userId}/violations`);
    if (!res) return;
    const data = await res.json();
    const violationCount = data.violations?.length || 0;

    // Suggest penalty based on count (0-based index)
    // 1st offense (count 0) -> warning
    // 2nd offense (count 1) -> restricted_3d
    const suggestedPenalty = [
        'warning',
        'restricted_3d',
        'suspended_7d',
        'locked_30d',
        'banned_permanent'
    ][Math.min(violationCount, 4)];

    const penaltyNames = {
        'warning': 'Cảnh cáo',
        'restricted_3d': 'Hạn chế 3 ngày',
        'suspended_7d': 'Đình chỉ 7 ngày',
        'locked_30d': 'Khóa 30 ngày',
        'banned_permanent': 'Khóa vĩnh viễn'
    };

    // Use a simple prompt-based approach OR render a custom modal into the DOM
    // For better UX, let's inject a modal overlay

    // Remove existing modal if any
    document.getElementById('enforcementModal')?.remove();

    const modalHtml = `
    <div id="enforcementModal" class="fixed inset-0 z-[3000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="this.parentElement.remove()"></div>
        <div class="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
            <div class="p-6">
                <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
                    <span>⚖️</span> Xử lý vi phạm
                </h3>
                
                <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 rounded-r">
                    <p class="text-sm text-yellow-800"><strong>Người vi phạm ID:</strong> ${userId}</p>
                    <p class="text-sm text-yellow-800"><strong>Số lần vi phạm trước đây:</strong> ${violationCount} lần</p>
                    <p class="text-sm text-yellow-800 mt-1">
                        <strong>Đề xuất:</strong> <span class="font-bold underline">${penaltyNames[suggestedPenalty]}</span>
                    </p>
                </div>
                
                <div class="space-y-3 mb-4 max-h-60 overflow-y-auto pr-2">
                    <div class="font-medium text-sm text-slate-700 mb-2">Chọn hình phạt:</div>
                    
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${suggestedPenalty === 'warning' ? 'ring-2 ring-blue-500 bg-blue-50' : ''}">
                        <input type="radio" name="penalty" value="warning" ${suggestedPenalty === 'warning' ? 'checked' : ''} class="w-4 h-4 text-blue-600">
                        <span class="ml-3 font-bold text-sm">1️⃣ Cảnh cáo</span>
                        <span class="ml-auto text-xs text-slate-500">Nhắc nhở</span>
                    </label>
                    
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${suggestedPenalty === 'restricted_3d' ? 'ring-2 ring-blue-500 bg-blue-50' : ''}">
                        <input type="radio" name="penalty" value="restricted_3d" ${suggestedPenalty === 'restricted_3d' ? 'checked' : ''} class="w-4 h-4 text-blue-600">
                        <span class="ml-3 font-bold text-sm">2️⃣ Hạn chế 3 ngày</span>
                        <span class="ml-auto text-xs text-slate-500">Cấm đăng/chat</span>
                    </label>
                    
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${suggestedPenalty === 'suspended_7d' ? 'ring-2 ring-blue-500 bg-blue-50' : ''}">
                        <input type="radio" name="penalty" value="suspended_7d" ${suggestedPenalty === 'suspended_7d' ? 'checked' : ''} class="w-4 h-4 text-blue-600">
                        <span class="ml-3 font-bold text-sm">3️⃣ Đình chỉ 7 ngày</span>
                        <span class="ml-auto text-xs text-slate-500">Cấm nhóm/chat</span>
                    </label>
                    
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${suggestedPenalty === 'locked_30d' ? 'ring-2 ring-blue-500 bg-blue-50' : ''}">
                        <input type="radio" name="penalty" value="locked_30d" ${suggestedPenalty === 'locked_30d' ? 'checked' : ''} class="w-4 h-4 text-blue-600">
                        <span class="ml-3 font-bold text-sm">4️⃣ Khóa 30 ngày</span>
                        <span class="ml-auto text-xs text-slate-500">Lock Account</span>
                    </label>
                    
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-red-50 ${suggestedPenalty === 'banned_permanent' ? 'ring-2 ring-red-500 bg-red-50' : ''}">
                        <input type="radio" name="penalty" value="banned_permanent" ${suggestedPenalty === 'banned_permanent' ? 'checked' : ''} class="w-4 h-4 text-red-600">
                        <span class="ml-3 font-bold text-sm text-red-600">5️⃣ Khóa vĩnh viễn</span>
                        <span class="ml-auto text-xs text-red-500">Ban Account</span>
                    </label>
                </div>
                
                <textarea id="adminNote" class="w-full p-3 border rounded-lg mb-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none" rows="3" 
                          placeholder="Ghi chú lý do xử phạt (Bắt buộc)..."></textarea>
                
                <div class="flex gap-3">
                    <button onclick="document.getElementById('enforcementModal').remove()" class="flex-1 py-2.5 bg-gray-100 text-slate-600 rounded-lg font-bold hover:bg-gray-200 transition">Hủy</button>
                    <button onclick="window.AdminModule.submitEnforcement(${reportId}, ${userId})" 
                            class="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-lg font-bold shadow-lg hover:shadow-xl transition transform active:scale-95">
                        Xác nhận xử phạt
                    </button>
                </div>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.AdminModule.submitEnforcement = async function (reportId, userId) {
    const penalty = document.querySelector('input[name="penalty"]:checked')?.value;
    let adminNote = document.getElementById('adminNote').value;

    if (!penalty) {
        return alert('Vui lòng chọn hình phạt!');
    }

    if (!adminNote || adminNote.trim() === '') {
        adminNote = "Không có ghi chú";
    }

    const res = await authFetch('/admin/enforce-violation', {
        method: 'POST',
        body: JSON.stringify({ reportId, userId, penaltyLevel: penalty, adminNote })
    });

    if (!res) return;
    const data = await res.json();
    if (data.success) {
        alert(data.message);
        document.getElementById('enforcementModal').remove();
        loadReports(); // Reload reports list
    } else {
        alert('Lỗi: ' + data.message);
    }
};

// ============================================
// MODULE 5: SETTINGS
// ============================================




async function loadSettings() {
    const res = await authFetch('/admin/settings/system');
    if (!res) return;
    const data = await res.json();
    if (data.success && data.settings) {
        const toggle = document.getElementById('maintenanceToggle');
        if (toggle) {
            toggle.checked = data.settings.maintenance_mode === 'true';
        }
    }
}

async function toggleMaintenance(isChecked) {
    const res = await authFetch('/admin/settings/system', {
        method: 'POST',
        body: JSON.stringify({ key: 'maintenance_mode', value: isChecked })
    });

    if (res) {
        const data = await res.json();
        if (data.success) {
            window.showToast(isChecked ? "Đã BẬT chế độ bảo trì" : "Đã TẮT chế độ bảo trì", 'success');
        } else {
            // Revert if failed
            document.getElementById('maintenanceToggle').checked = !isChecked;
            alert("Lỗi: " + (data.message || "Không thể cập nhật"));
        }
    } else {
        document.getElementById('maintenanceToggle').checked = !isChecked;
    }
}



async function loadSystemLogs() {
    const res = await authFetch('/admin/logs');
    if (!res) return;
    const data = await res.json();
    const container = document.getElementById('audit-logs-container');
    if (!container) return;

    if (data.success && data.logs) {
        container.innerHTML = data.logs.map(log => `
            <div class="border-l-2 border-slate-700 pl-3 py-1 text-xs">
                <span class="text-blue-400">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span class="text-gray-500 italic">(${log.role})</span>
                <span class="text-yellow-500 font-bold">${log.user}</span>:
                <span class="text-slate-300">${log.action}</span>
            </div>
        `).join('') || '<div class="text-slate-500 italic">Chưa có nhật ký nào.</div>';
    }
}


// Ensure all functions are exposed
window.AdminModule.loadSettings = loadSettings;
window.AdminModule.toggleMaintenance = toggleMaintenance;
window.AdminModule.loadAdmins = loadAdmins;
window.AdminModule.loadSystemLogs = loadSystemLogs;

// Debugging
console.log("Admin Module Loaded. Methods:", window.AdminModule);
