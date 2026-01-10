// --- 1. CONFIGURATION AND CORE STATE ---

export const IO_URL = 'http://localhost:3000';
export const API_URL = `${IO_URL}/api`;

// Khởi tạo Socket.io
export const io = window.io(IO_URL);

// Biến trạng thái toàn cục
window.currentUser = null;
window.currentView = 'login'; // Mặc định là login
window.activeChat = null; // ID người đang chat
window.onlineUsersSet = new Set(); // [NEW] Global Set to track online user IDs

export let chatWidth = 33.33; // Chiều rộng mặc định của chat sidebar
export let isDarkMode = false;
export let showOnlineStatus = true;
export let allowNonFriendsViewProfile = true;

export const defaultConfig = {
    site_name: "SocialVN",
    welcome_message: "Kết nối và chia sẻ với mọi người",
    primary_action: "#3b82f6",
    fontSize: 16
};

// --- THEME LOGIC ---
export function initTheme() {
    // Check localStorage or System Preference
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark-mode');
        isDarkMode = true;
    } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark-mode');
        isDarkMode = false;
    }
    updateThemeIcon();
}

export function toggleTheme() {
    if (isDarkMode) {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark-mode');
        localStorage.theme = 'light';
        isDarkMode = false;
    } else {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark-mode');
        localStorage.theme = 'dark';
        isDarkMode = true;
    }
    updateThemeIcon();
}

function updateThemeIcon() {
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) {
        icon.textContent = isDarkMode ? '☀️' : '🌙';
    }
}

// Auto init on load
initTheme();
window.toggleTheme = toggleTheme; // Bind to window for HTML access

/** 
 * Wrapper cho fetch để tự động đính kèm JWT Token vào Header 
 */
export async function apiFetch(endpoint, options = {}) {
    // Tự động thêm dấu / nếu thiếu
    const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    // Khởi tạo headers
    options.headers = options.headers || {};

    // Đính kèm token nếu có
    const token = window.authToken || localStorage.getItem('token');
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    // [FIX] Tự động set Content-Type là JSON nếu body là string
    if (options.body && typeof options.body === 'string' && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(url, options);

        // Xử lý lỗi xác thực (401 hoặc 403)
        if (response.status === 401 || response.status === 403) {
            console.warn("Lỗi xác thực, đang đăng xuất...");
            localStorage.removeItem('currentUser');
            localStorage.removeItem('token');
            window.currentUser = null;
            window.authToken = null;
            window.renderLogin();
            return null;
        }

        // [NEW] Xử lý lỗi bảo trì (503)
        if (response.status === 503) {
            const data = await response.json();
            window.renderMaintenance(data.message);
            return null;
        }

        return response;
    } catch (error) {
        console.error("API Fetch Error:", error);
        throw error;
    }
}
window.apiFetch = apiFetch;


// --- 2. MODULE IMPORTS (CẬP NHẬT CẤU TRÚC TÁCH NHỎ) ---

import * as AuthModule from './modules/auth.js';
import * as NewsfeedModule from './modules/newsfeed.js';
import * as ChatModule from './modules/chat.js';
import * as SearchModule from './modules/search.js';
import * as GroupModule from './modules/group.js';
import * as NotificationModule from './modules/notification.js';

// Các module mới được tách ra
import * as ProfileModule from './modules/profile.js';
import * as FriendRequestModule from './modules/friendRequest.js';
import * as SettingModule from './modules/setting.js';


// --- 3. UI UTILITIES ---

/** Hiển thị thông báo Toast */
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'surface fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity duration-300';
    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
window.showToast = showToast;

/** Hiển thị dialog xác nhận */
export function showConfirmDialog(message, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop fixed inset-0 flex items-center justify-center z-50 bg-black/50';
    modal.innerHTML = `
        <div class="surface p-6 max-w-sm rounded-lg shadow-xl bg-white">
            <p class="mb-4 text-slate-700 font-medium">${message}</p>
            <div class="flex gap-2 justify-end">
                <button id="btnConfirm" class="px-4 py-2 bg-red-500 text-white rounded-lg font-bold">Xác nhận</button>
                <button id="btnCancel" class="px-4 py-2 border rounded-lg font-bold">Hủy</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btnConfirm').onclick = () => {
        onConfirm();
        modal.remove();
    };
    document.getElementById('btnCancel').onclick = () => modal.remove();
}
window.showConfirmDialog = showConfirmDialog;

/** Mở modal hệ thống */
export function openModal(title, contentHTML) {
    const modal = document.getElementById('appModal');
    const modalBody = document.getElementById('modalBody');
    const modalContent = modal?.querySelector('.modal-content');

    if (modal && modalBody && modalContent) {
        let modalTitle = modalContent.querySelector('h3');
        if (!modalTitle) {
            modalTitle = document.createElement('h3');
            modalTitle.className = 'text-2xl font-bold mb-4 border-b pb-2';
            modalContent.insertBefore(modalTitle, modalBody);
        }

        modalTitle.textContent = title;
        modalBody.innerHTML = contentHTML;
        modal.classList.remove('hidden');
    }
}
window.openModal = openModal;

/** Đóng modal hệ thống */
export function closeModal() {
    const modal = document.getElementById('appModal');
    if (modal) modal.classList.add('hidden');
    const modalBody = document.getElementById('modalBody');
    if (modalBody) modalBody.innerHTML = '';
}
window.closeModal = closeModal;

/** Tính thời gian đã trôi qua */
export function getTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now - time) / 1000);

    const MINUTE = 60;
    const HOUR = 3600;
    const DAY = 86400;

    if (diff < MINUTE) return 'Vừa xong';
    if (diff < HOUR) return Math.floor(diff / 60) + ' phút trước';
    if (diff < DAY) return Math.floor(diff / 3600) + ' giờ trước';
    if (diff < 604800) return Math.floor(diff / 86400) + ' ngày trước';
    return time.toLocaleDateString('vi-VN');
}
window.getTimeAgo = getTimeAgo;

/** 
 * Lấy đường dẫn Avatar chuẩn hóa (Global Helper)
 * @param {string|null} avatarPath - Đường dẫn từ DB
 * @returns {string} - URL đầy đủ để hiển thị
 */
export function getAvatarUrl(avatarPath, gender = 'male') {
    if (!avatarPath) {
        // Fallback theo giới tính
        const genderStr = String(gender).toLowerCase();
        if (genderStr === 'female' || genderStr === 'nữ') {
            return './images/default_avatar_female.png';
        }
        return './images/default_avatar_male.png';
    }

    if (avatarPath.startsWith('http') || avatarPath.startsWith('//')) {
        return avatarPath;
    }

    // Chuẩn hóa đường dẫn (thay thế backslash cho Windows, bỏ dấu / ở đầu)
    let cleanPath = avatarPath.replace(/\\/g, '/').replace(/^\/+/, '');

    // [FIX] Xử lý đường dẫn cũ bị thừa thư mục con
    cleanPath = cleanPath.replace('uploads/avatars/', 'uploads/');
    cleanPath = cleanPath.replace('uploads/covers/', 'uploads/');

    // Đảm bảo đường dẫn bắt đầu bằng 'uploads/' nếu là file từ server
    if (!cleanPath.startsWith('uploads/')) {
        cleanPath = `uploads/${cleanPath}`;
    }

    const backendDomain = API_URL.replace('/api', ''); // http://localhost:3000
    return `${backendDomain}/${cleanPath}`;
}
window.getAvatarUrl = getAvatarUrl;

/**
 * Trình trợ giúp để lấy HTML của Avatar kèm theo điểm trạng thái online (Global Helper)
 * @param {string} userId - ID người dùng
 * @param {string} avatarUrl - URL avatar
 * @param {string} gender - Giới tính
 * @param {string} sizeClass - Class size (ví dụ: w-10 h-10)
 */
export function getAvatarWithStatusHtml(userId, avatarPath, gender, sizeClass = 'w-10 h-10') {
    const avatarUrl = getAvatarUrl(avatarPath, gender);
    const isOnline = window.onlineUsersSet && window.onlineUsersSet.has(String(userId));

    return `
        <div class="relative ${sizeClass} flex-shrink-0 avatar-wrapper-user-${userId}">
            <img src="${avatarUrl}" class="w-full h-full rounded-full object-cover border border-gray-100 dark:border-slate-800" onerror="this.src='./images/default_avatar_male.png'">
            <div class="status-dot-user-${userId} absolute bottom-0 right-0 w-[25%] h-[25%] bg-green-500 border-2 border-white dark:border-slate-900 rounded-full ${isOnline ? '' : 'hidden'}"></div>
        </div>
    `;
}
window.getAvatarWithStatusHtml = getAvatarWithStatusHtml;

/**
 * Cập nhật trạng thái hiển thị của tất cả các avatar của một user trên toàn trang
 */
export function updateGlobalOnlineStatus(userId, status) {
    if (status === 'online') {
        window.onlineUsersSet.add(String(userId));
    } else {
        window.onlineUsersSet.delete(String(userId));
    }

    const dots = document.querySelectorAll(`.status-dot-user-${userId}`);
    if (status === 'online') {
        dots.forEach(dot => dot.classList.remove('hidden'));
    } else {
        dots.forEach(dot => dot.classList.add('hidden'));
    }
}
window.updateGlobalOnlineStatus = updateGlobalOnlineStatus;


// --- 4. VIEW MANAGEMENT ---

/** Chuyển đổi giữa các View */
export function switchView(view, id = null) {
    if (view === 'profile' && id) {
        window.currentView = `profile_${id}`;
    }
    else if (view === 'post' && id) {
        window.currentView = `post_${id}`;
    }
    else if (view === 'group' && id) {
        window.currentView = `group_detail_${id}`;
    } else {
        window.currentView = view;
    }

    renderCurrentView();
    updateHeaderActiveState(view); // [NEW] Update Active Nav UI
    document.getElementById('searchDropdown')?.classList.add('hidden');
}
window.switchView = switchView;

/** Render nội dung dựa trên trạng thái window.currentView */
export function renderCurrentView() {
    // 1. Kiểm tra quyền truy cập (Nếu chưa login chỉ được xem login/register)
    if (!window.currentUser && window.currentView !== 'login' && window.currentView !== 'register') {
        window.currentView = 'login';
        AuthModule.renderLogin();
        return;
    }
    else if (window.currentUser && (window.currentView === 'login' || window.currentView === 'register')) {
        window.currentView = 'home';
    }

    const mainContent = document.getElementById('mainContent');
    if (!mainContent && window.currentView !== 'login' && window.currentView !== 'register') {
        return;
    }

    const viewName = window.currentView.split('_')[0];

    // 2. Định tuyến View
    switch (viewName) {
        case 'login':
            loadAuthShell();
            AuthModule.renderLogin();
            break;
        case 'register':
            loadAuthShell();
            AuthModule.renderRegister();
            break;
        case 'home':
            NewsfeedModule.renderHome();
            break;
        case 'pages':
            GroupModule.renderGroupList();
            break;
        case 'notifications':
            NotificationModule.renderNotificationsPage();
            break;
        case 'settings':
            SettingModule.renderSettings();
            break;
        case 'archive':
            NewsfeedModule.renderArchivePage();
            break;
        case 'friendRequests':
            FriendRequestModule.renderFriendRequests();
            break;
        case 'profile':
            const userId = window.currentView.substring('profile_'.length);
            ProfileModule.renderProfile(userId);
            break;
        case 'group':
            if (window.currentView.startsWith('group_detail_')) {
                const groupId = window.currentView.substring('group_detail_'.length);
                GroupModule.renderGroupDetail(groupId);
            }
            break;
        case 'post':
            // Handle post navigation - fetch post details and navigate to owner's profile
            (async () => {
                const postId = window.currentView.substring('post_'.length);
                try {
                    const res = await apiFetch(`/posts/${postId}/check`);
                    if (!res) return;
                    const data = await res.json();

                    if (!data.exists) {
                        showToast("Bài viết này không còn tồn tại!", "error");
                        switchView('home');
                        return;
                    }

                    if (data.groupId) {
                        // Post in group
                        const memberRes = await apiFetch(`/groups/${data.groupId}/check-member?user_id=${window.currentUser.userId}`);
                        if (!memberRes) return;
                        const memberData = await memberRes.json();

                        switchView('group', data.groupId);
                        if (memberData.isMember) {
                            setTimeout(() => {
                                const el = document.getElementById(`post-${postId}`);
                                if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    el.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');
                                    setTimeout(() => el.classList.remove('ring-4', 'ring-blue-500'), 3000);
                                }
                            }, 1500);
                        } else {
                            showToast("Bài viết nằm trong nhóm. Hãy tham gia để xem chi tiết!", "info");
                        }
                    } else {
                        // Personal post
                        switchView('profile', data.ownerId);
                        setTimeout(() => {
                            const el = document.getElementById(`post-${postId}`);
                            if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                el.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');
                                setTimeout(() => el.classList.remove('ring-4', 'ring-blue-500'), 3000);
                            }
                        }, 1500);
                    }
                } catch (e) {
                    console.error(e);
                    showToast("Lỗi kiểm tra bài viết", "error");
                    switchView('home');
                }
            })();
            break;
        default:
            if (mainContent) {
                mainContent.innerHTML = `<div class="p-8 text-center text-gray-500 italic">Tính năng ${window.currentView} đang phát triển...</div>`;
            }
            break;
    }
}

/** Nạp khung HTML cho Auth (Sử dụng khi logout hoặc khởi tạo) */
export function loadAuthShell() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div id="authTemplate" class="h-full w-full flex items-center justify-center bg-slate-50">
            <div id="authContainer" class="surface w-full max-w-md p-8 rounded-2xl shadow-xl bg-white animate-fade-in">
                </div>
        </div>

        <template id="loginTemplate">
            <div class="text-center mb-8">
                <div class="text-5xl mb-4">🌐</div>
                <h1 class="text-2xl font-black text-slate-800">SocialVN</h1>
                <p class="text-slate-500 mt-2">Kết nối và chia sẻ với mọi người</p>
            </div>
            <form id="loginForm" class="space-y-4">
                <input type="text" id="loginEmail" placeholder="Email hoặc Username" required 
                       class="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none transition">
                <input type="password" id="loginPassword" placeholder="Mật khẩu" required 
                       class="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none transition">
                <button type="submit" class="w-full p-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition">Đăng nhập</button>
            </form>
            <div class="mt-6 text-center">
                <button onclick="window.renderRegister()" class="text-blue-600 font-bold hover:underline">Tạo tài khoản mới</button>
            </div>
        </template>
        
        <template id="registerTemplate">
            <div class="text-center mb-6">
                <h1 class="text-2xl font-black text-slate-800">Đăng ký tài khoản</h1>
            </div>
            <form id="registerForm" class="grid grid-cols-1 gap-3">
                <input id="regName" type="text" placeholder="Họ và tên" class="p-3 border-2 border-slate-100 rounded-xl outline-none" required>
                <input id="regEmail" type="text" placeholder="Username/Email" class="p-3 border-2 border-slate-100 rounded-xl outline-none" required>
                <input id="regPassword" type="password" placeholder="Mật khẩu" class="p-3 border-2 border-slate-100 rounded-xl outline-none" required>
                <div class="grid grid-cols-2 gap-3">
                    <input id="regBirthday" type="date" class="p-3 border-2 border-slate-100 rounded-xl outline-none" required title="Ngày sinh">
                    <select id="regGender" class="p-3 border-2 border-slate-100 rounded-xl outline-none" required>
                        <option value="" disabled selected>Giới tính</option>
                        <option value="Male">Nam</option>
                        <option value="Female">Nữ</option>
                        <option value="Other">Khác</option>
                    </select>
                </div>
                
                <div class="grid grid-cols-2 gap-3">
                    <input id="regSchool" type="text" placeholder="Trường học" class="p-3 border-2 border-slate-100 rounded-xl outline-none">
                    <input id="regWork" type="text" placeholder="Nơi làm việc" class="p-3 border-2 border-slate-100 rounded-xl outline-none">
                </div>

                <input id="regLocation" type="text" placeholder="Địa điểm (Thành phố/Quốc gia)" class="p-3 border-2 border-slate-100 rounded-xl outline-none" required>
                
                <div class="space-y-2 pt-2">
                    <div class="text-xs font-bold text-slate-400 ml-1 uppercase">Ảnh đại diện & Ảnh bìa (Không bắt buộc)</div>
                    <div class="grid grid-cols-2 gap-3">
                        <label class="block cursor-pointer">
                            <span class="sr-only">Avatar</span>
                            <input id="regAvatar" type="file" accept="image/*" class="block w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                        </label>
                        <label class="block cursor-pointer">
                            <span class="sr-only">Cover</span>
                            <input id="regCover" type="file" accept="image/*" class="block w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"/>
                        </label>
                    </div>
                </div>

                <button type="submit" class="p-3 bg-blue-600 text-white rounded-xl font-bold mt-4 shadow-lg shadow-blue-100 hover:bg-blue-700 transition">Đăng ký ngay</button>
            </form>
            <div class="mt-4 text-center">
                <button onclick="window.renderLogin()" class="text-slate-500 font-bold hover:underline">Đã có tài khoản? Đăng nhập</button>
            </div>
        </template>
    `;
}
window.loadAuthShell = loadAuthShell;

/** Nạp Newsfeed Shell Template */
function loadNewsfeedShell() {
    return `
        <template id="newsfeedTemplate">
            <div class="max-w-2xl mx-auto">
                <div class="surface rounded-lg shadow p-4 mb-4 border border-base bg-white dark:bg-slate-900 dark:border-slate-800 transition-colors duration-300">
                    <div class="flex items-center gap-3">
                        <div id="currentUserAvatar" class="avatar-small rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-lg">
                            ${window.currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <button onclick="window.NewsfeedModule.showCreatePostModal()" class="flex-1 p-3 bg-slate-100 dark:bg-slate-800 rounded-full text-left text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition">Bạn đang nghĩ gì, ${window.currentUser?.name || 'bạn'}?</button>
                    </div>
                </div>
                <div id="postsFeed">
                    <div class="p-8 text-center text-secondary dark:text-slate-500">Đang tải bài viết...</div>
                </div>
            </div>
        </template>
    `;
}

/** Render App Shell (Header, Sidebar, Content) */
export function renderApp() {
    const config = window.elementSdk ? window.elementSdk.config : defaultConfig;

    document.getElementById('app').innerHTML = `
        <header id="mainHeader" class="surface shadow-md p-4 sticky top-0 z-[1000] bg-white dark:bg-slate-900 border-b dark:border-slate-800 transition-colors duration-300">
            <div class="flex items-center justify-between max-w-7xl mx-auto">
                <div class="flex items-center gap-4 cursor-pointer" onclick="window.switchView('home')">
                    <div class="text-3xl">🌐</div>
                    <h1 class="site-name text-content font-bold dark:text-white" style="font-size:${config.fontSize * 1.5}px;">SocialVN</h1>
                </div>

                <div class="flex-1 max-w-xl mx-4 relative group">
                    <input type="text" id="globalSearchInput" placeholder="🔍 Tìm kiếm bạn bè, nhóm..." 
                           class="w-full p-2.5 pr-10 bg-slate-100 dark:bg-slate-800 dark:text-white rounded-full outline-none focus:bg-white dark:focus:bg-slate-700 border dark:border-slate-700 focus:border-blue-500 transition shadow-sm"
                           onfocus="window.SearchModule.handleSearchFocus()" oninput="window.SearchModule.handleSearchInput(this.value)">
                    <button onclick="window.SearchModule.clearGlobalSearch()" 
                            class="absolute right-3 top-2.5 text-slate-300 hover:text-slate-500 text-xl hidden group-focus-within:block transition">×</button>
                    <div id="searchDropdown" class="search-dropdown surface absolute w-full mt-2 rounded-xl shadow-2xl hidden z-[2000] bg-white dark:bg-slate-800 border dark:border-slate-700 animate-fade-in"></div>
                </div>

                <div class="flex items-center gap-2 md:gap-4">
                    <!-- THEME TOGGLE -->
                    <button onclick="window.toggleTheme()" id="theme-toggle-btn" class="p-2 text-2xl hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition" title="Giao diện Sáng/Tối">
                        <span id="theme-toggle-icon">${isDarkMode ? '☀️' : '🌙'}</span>
                    </button>

                    <button onclick="window.switchView('home')" id="nav-btn-home" class="nav-btn p-2 text-2xl hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition" title="Trang chủ">🏠</button>
                    <button onclick="window.switchView('pages')" id="nav-btn-pages" class="nav-btn p-2 text-2xl hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition" title="Nhóm">📄</button>
                    
                    <button onclick="window.switchView('notifications')" id="nav-btn-notifications" class="nav-btn p-2 text-2xl relative hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition" title="Thông báo">
                        🔔 <span id="notificationBadge" class="absolute top-1 right-1 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center hidden font-bold">0</span>
                    </button>
                    
                    <button onclick="window.switchView('friendRequests')" id="nav-btn-friendRequests" class="nav-btn p-2 text-2xl relative hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition" title="Lời mời kết bạn">
                        👥 <span id="friendRequestCount" class="absolute top-1 right-1 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center hidden font-bold">0</span>
                    </button>
                    
                    <button onclick="window.switchView('profile', '${window.currentUser?.userId}')" id="nav-btn-profile" class="nav-btn p-2 text-2xl hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition" title="Trang cá nhân">👤</button>
                    <button onclick="window.switchView('settings')" id="nav-btn-settings" class="nav-btn p-2 text-2xl hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition" title="Cài đặt">⚙️</button>
                </div>
            </div>
        </header>

        <main class="flex-1 flex overflow-hidden bg-slate-50 dark:bg-slate-950" id="mainLayout">
            <div id="chatSidebar" class="chat-container surface border-r dark:border-slate-800 overflow-hidden flex flex-col bg-white dark:bg-slate-900 transition-colors duration-300" style="width:${chatWidth}%;">
                <div class="p-4 border-b dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                    <h2 class="text-content font-bold text-lg dark:text-white">Trò chuyện</h2>
                    <div class="flex gap-1">
                        <button onclick="window.ChatModule.toggleChatSearch()" class="text-lg hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-300 p-1.5 rounded-full transition" title="Tìm kiếm">🔍</button>
                        <button onclick="window.ChatModule.showCreateGroupModal()" class="text-xl hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-300 p-1.5 rounded-full transition" title="Tạo nhóm">➕</button>
                    </div>
                </div>

                <div class="flex border-b dark:border-slate-800 text-sm font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900">
                    <button onclick="window.ChatModule.switchChatTab('friends')" id="chatTabFriends" class="flex-1 p-3 border-b-2 border-transparent transition hover:bg-slate-50 dark:hover:bg-slate-800">Bạn bè</button>
                    <button onclick="window.ChatModule.switchChatTab('groups')" id="chatTabGroups" class="flex-1 p-3 border-b-2 border-transparent transition hover:bg-slate-50 dark:hover:bg-slate-800">Nhóm</button>
                    <button onclick="window.ChatModule.switchChatTab('strangers')" id="chatTabStrangers" class="flex-1 p-3 border-b-2 border-transparent transition hover:bg-slate-50 dark:hover:bg-slate-800">Người lạ</button>
                </div>

                <!-- Chat Sidebar Search (Hidden by default) -->
                <div id="chatSearchContainer" class="hidden p-3 border-b bg-blue-50/30 animate-fade-in">
                    <div class="relative">
                        <input type="text" id="chatSidebarSearch" placeholder="Tìm kiếm tên người dùng, nhóm..." 
                               class="w-full p-2.5 pl-10 bg-white border border-blue-100 rounded-2xl text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition shadow-sm"
                               oninput="window.ChatModule.handleChatSidebarSearch(this.value)">
                        <span class="absolute left-3.5 top-3 text-slate-400">🔍</span>
                        <button onclick="window.ChatModule.toggleChatSearch()" class="absolute right-3 top-2.5 text-slate-300 hover:text-slate-500 text-lg">×</button>
                    </div>
                </div>

                <div id="chatList" class="flex-1 overflow-auto"></div>
                <div id="activeChatOverlay" class="hidden fixed inset-0 surface z-[100] bg-white"></div>
            </div>

            <div class="resizer w-1 bg-slate-100 hover:bg-blue-400 cursor-col-resize transition" id="splitter"></div>

            <div id="mainContent" class="main-content-container flex-1 overflow-auto p-4 bg-slate-50"></div>
        </main>

        <div id="appModal" class="modal-backdrop fixed inset-0 flex items-center justify-center z-[2000] hidden bg-black/60">
            <div class="modal-content bg-white rounded-2xl shadow-2xl p-0 relative w-full max-w-xl overflow-hidden animate-fade-in">
                <span class="close-btn absolute top-4 right-4 text-2xl cursor-pointer hover:text-red-500 z-50" onclick="window.closeModal()">&times;</span>
                <div id="modalBody" class="p-0"></div>
            </div>
        </div>
        ${loadNewsfeedShell()} 
    `;

    setupResizer();
    renderCurrentView();

    // Khởi tạo trạng thái chat mặc định
    if (window.ChatModule?.switchChatTab) {
        window.ChatModule.switchChatTab('friends');
    }

    // Tải thông báo & lời mời ban đầu
    if (NotificationModule.loadInitialUnreadCount) NotificationModule.loadInitialUnreadCount();
    if (FriendRequestModule.loadBadgeCount) FriendRequestModule.loadBadgeCount();
}
window.renderApp = renderApp;


// --- 5. RESIZER LOGIC ---
function setupResizer() {
    const resizer = document.getElementById('splitter');
    const chatSidebar = document.getElementById('chatSidebar');
    const mainLayout = document.getElementById('mainLayout');
    if (!resizer || !chatSidebar) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', () => { isResizing = true; document.body.style.cursor = 'col-resize'; });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerWidth = mainLayout.offsetWidth;
        const newWidth = (e.clientX / containerWidth) * 100;
        if (newWidth >= 20 && newWidth <= 50) {
            chatWidth = newWidth;
            chatSidebar.style.width = `${chatWidth}%`;
        }
    });
    document.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = 'default'; });
}


// --- 6. SOCKET HANDLERS ---
export function setupSocketHandlers() {
    if (!window.currentUser) return;
    io.emit('register_user', window.currentUser.userId);

    // [NEW] Kiểm tra trạng thái Online ban đầu của bạn bè sau khi đã nạp sidebar
    setTimeout(() => {
        const friendIds = Array.from(document.querySelectorAll('[id^="chat-item-"]')).map(el => el.id.replace('chat-item-', ''));
        if (friendIds.length > 0) {
            io.emit('check_online_status', friendIds, (statusMap) => {
                Object.keys(statusMap).forEach(uid => {
                    if (window.updateGlobalOnlineStatus) {
                        window.updateGlobalOnlineStatus(uid, statusMap[uid]);
                    }
                    if (window.ChatModule && window.ChatModule.updateOnlineStatus) {
                        window.ChatModule.updateOnlineStatus(uid, statusMap[uid]);
                    }
                });
            });
        }
    }, 2000);

    // [NEW] Trạng thái Online/Offline Realtime
    io.on('user_status_changed', (data) => {
        if (window.updateGlobalOnlineStatus) {
            window.updateGlobalOnlineStatus(data.userId, data.status);
        }
        // Giữ lại callback cho ChatModule nếu cần logic đặc thù (ví dụ cập nhật sidebar list)
        if (window.ChatModule && window.ChatModule.updateOnlineStatus) {
            window.ChatModule.updateOnlineStatus(data.userId, data.status);
        }
    });

    // [NEW] Bài viết mới Realtime (Newsfeed thời gian thực)
    io.on('new_post', (fullPost) => {
        if (window.NewsfeedModule && window.NewsfeedModule.handleNewPostRealtime) {
            window.NewsfeedModule.handleNewPostRealtime(fullPost);
        }
    });

    // Tin nhắn riêng tư
    io.on('receive_private_message', (data) => {
        if (typeof ChatModule.displayMessage === 'function') {
            const isSelf = String(data.senderId) === String(window.currentUser.userId);
            ChatModule.displayMessage(data, isSelf);
        }
    });

    // Thông báo realtime
    io.on('new_notification', (data) => {
        showToast(data.content, 'info');
        if (NotificationModule.updateUnreadCount) {
            NotificationModule.updateUnreadCount('increment');
        }
        // [NEW] Cập nhật list thông báo nếu đang mở trang thông báo
        if (NotificationModule.handleNewIncomingNotification) {
            NotificationModule.handleNewIncomingNotification(data);
        }
        // Nếu là yêu cầu kết bạn, cập nhật badge của nó
        if (data.type === 'friend_request' && FriendRequestModule.loadBadgeCount) {
            FriendRequestModule.loadBadgeCount();
        }
    });
}
window.setupSocketHandlers = setupSocketHandlers;


// --- 7. INITIALIZE APP ---
function initializeApp() {
    const storedUser = localStorage.getItem('currentUser');
    const storedToken = localStorage.getItem('token');

    if (storedUser && storedToken) {
        window.currentUser = JSON.parse(storedUser);
        window.authToken = storedToken; // [NEW] Nạp token

        // [NEW] Redirect Admin to Dashboard immediately (Check role or username fallback)
        console.log("Checking Admin Redirect:", window.currentUser);
        if (['admin', 'super_admin'].includes(window.currentUser.role) || window.currentUser.username === 'admin') {
            console.log("Redirecting to Admin Dashboard...");
            window.location.href = 'admin.html';
            return;
        }

        setupSocketHandlers();
        renderApp();
    } else {
        AuthModule.renderLogin();
    }
}


// --- 8. GLOBAL HOOKS & EXPORTS ---

// Gán toàn bộ Module vào window để gọi từ HTML/Templates
window.AuthModule = AuthModule;
window.ChatModule = ChatModule;
window.NewsfeedModule = NewsfeedModule;
window.SearchModule = SearchModule;
window.GroupModule = GroupModule;
window.NotificationModule = NotificationModule;
window.ProfileModule = ProfileModule;
window.FriendRequestModule = FriendRequestModule;
window.SettingModule = SettingModule;

// Gán hàm bổ trợ
window.handleLogout = AuthModule.handleLogout;
window.renderCurrentView = renderCurrentView;
window.switchView = switchView;
window.handleSearchFocus = SearchModule.handleSearchFocus;
window.handleSearchInput = SearchModule.handleSearchInput;

// [NEW] REPORT MODAL LOGIC (Appended)
window.openReportModal = function (targetType, targetId) {
    const tpl = document.getElementById('tpl-report-modal');
    if (!tpl) {
        console.error("Report template not found!");
        return;
    }

    // Convert DocumentFragment to HTML string
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(tpl.content.cloneNode(true));
    const htmlContent = tempDiv.innerHTML;

    // Open modal with HTML string
    window.openModal('Báo cáo vi phạm', htmlContent);

    // Set hidden values after modal is rendered
    setTimeout(() => {
        const targetTypeInput = document.getElementById('reportTargetType');
        const targetIdInput = document.getElementById('reportTargetId');
        if (targetTypeInput) targetTypeInput.value = targetType;
        if (targetIdInput) targetIdInput.value = targetId;
    }, 0);
};

window.handleReportSubmit = async function (e) {
    e.preventDefault();
    const targetType = document.getElementById('reportTargetType').value;
    const targetId = document.getElementById('reportTargetId').value;
    const reason = document.querySelector('input[name="reason"]:checked')?.value || 'other';
    const description = document.getElementById('reportDescription').value;

    if (!targetType || !targetId) return window.closeModal();

    try {
        const res = await apiFetch('/report', {
            method: 'POST',
            body: JSON.stringify({
                target_type: targetType,
                target_id: targetId,
                reason: reason,
                description: description
            })
        });

        if (!res) return;
        const data = await res.json();

        if (data.success) {
            window.showToast("Đã gửi báo cáo thành công!", 'success');
            window.closeModal();
        } else {
            window.showToast(data.message || "Lỗi gửi báo cáo", 'error');
        }
    } catch (err) {
        console.error(err);
        window.showToast("Lỗi kết nối", 'error');
    }
};

// --- 7. MAINTENANCE MODE UTILS ---
window.renderMaintenance = function (message) {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div class="fixed inset-0 bg-slate-900 flex items-center justify-center z-[9000]">
            <div class="text-center p-8 max-w-md">
                <div class="mb-6 text-6xl">🚧</div>
                <h1 class="text-3xl font-bold text-white mb-4">Hệ Thống Bảo Trì</h1>
                <p class="text-slate-300 mb-8">${message || 'Hệ thống đang được nâng cấp để phục vụ bạn tốt hơn. Vui lòng quay lại sau ít phút!'}</p>
                <div class="animate-pulse w-32 h-1 bg-blue-500 rounded-full mx-auto"></div>
                <button onclick="window.location.reload()" class="mt-8 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition">
                    Thử lại
                </button>
            </div>
        </div>
    `;
};

// Listen for maintenance events
io.on('maintenance_mode', (isActive) => {
    console.log("Maintenance Mode:", isActive);
    if (isActive) {
        // Force logout if not admin (client-side check strictly for UX, server will block anyway)
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('token');
            window.currentUser = null;
            window.authToken = null;
            window.renderMaintenance();
        }
    } else {
        // If maintenance is OFF, and we are showing maintenance screen, reload
        if (document.querySelector('.fixed.inset-0.bg-slate-900')) {
            window.location.reload();
        }
    }
});

// [NEW] Active State Logic
export function updateHeaderActiveState(view) {
    if (!view) return;
    const viewName = view.split('_')[0];
    const mapping = {
        'home': 'nav-btn-home',
        'pages': 'nav-btn-pages',
        'notifications': 'nav-btn-notifications',
        'friendRequests': 'nav-btn-friendRequests',
        'profile': 'nav-btn-profile',
        'settings': 'nav-btn-settings'
    };

    // Reset all
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-blue-100', 'text-blue-600', 'dark:bg-blue-900', 'dark:text-white', 'shadow-inner');
        btn.classList.add('hover:bg-slate-100', 'dark:hover:bg-slate-800', 'text-slate-600', 'dark:text-slate-400');
    });

    // Set active
    const activeBtnId = mapping[viewName];
    if (activeBtnId) {
        const btn = document.getElementById(activeBtnId);
        if (btn) {
            btn.classList.remove('hover:bg-slate-100', 'dark:hover:bg-slate-800', 'text-slate-600', 'dark:text-slate-400');
            btn.classList.add('bg-blue-100', 'text-blue-600', 'dark:bg-blue-900', 'dark:text-white', 'shadow-inner');
        }
    }
}
window.updateHeaderActiveState = updateHeaderActiveState;

document.addEventListener('DOMContentLoaded', initializeApp);