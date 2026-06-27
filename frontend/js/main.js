export const IO_URL = 'http://localhost:3000';
export const API_URL = `${IO_URL}/api`;

// Khởi tạo Socket.io instance duy nhất
export const io = window.io ? window.io(IO_URL) : null;
//tạo kết nối socket để sau này hiển thị console bắt lỗi routes và kiểm tra logic
window.IO_URL = IO_URL;
window.API_URL = API_URL;

// Biến trạng thái toàn cục
window.currentUser = null; // Biến lưu thông tin người dùng hiện tại
window.currentView = 'login'; // Mặc định là login
window.activeChat = null; // ID người đang chat
window.onlineUsersSet = new Set(); // Global Set to track online user IDs

export let chatWidth = 33.33; // Chiều rộng mặc định của chat sidebar
export let isDarkMode = false; // Biến lưu trạng thái mode
export let showOnlineStatus = true; // Hiển thị trạng thái online
export let allowNonFriendsViewProfile = true; // Cho phép xem profile của người không phải bạn bè

export const defaultConfig = {
    site_name: "Mini Social Network", // Tên website
    welcome_message: "Kết nối và chia sẻ với mọi người", // Tin chào mừng
    primary_action: "#3b82f6", // Màu chính
    fontSize: 16 // Kích thước font
};

// --- THEME logic ---
export function initTheme() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {// Kiểm tra theme trong localStorage hoặc hệ thống
        document.documentElement.classList.add('dark'); // Thêm class dark vào document
        document.body.classList.add('dark-mode'); // Thêm class dark-mode vào body
        isDarkMode = true;
    } else {
        document.documentElement.classList.remove('dark'); // Xóa class dark khỏi document
        document.body.classList.remove('dark-mode'); // Xóa class dark-mode khỏi body
        isDarkMode = false;
    }
    updateThemeIcon();// Cập nhật icon theme
}
// --- THEME TOGGLE ---
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
window.toggleTheme = toggleTheme;

// Global Error Handling for Images (Moved from index.html)
document.addEventListener('error', function (e) {
    if (e.target.tagName.toLowerCase() === 'img') {
        const src = e.target.getAttribute('src');
        if (src && src.includes('default')) return; // Prevent infinite loop

        // Avatar fallback
        if (e.target.id === 'userAvatar' || e.target.classList.contains('avatar')) {
            e.target.src = 'images/default.png';
        }
        // Cover fallback
        else if (e.target.id === 'coverImg') {
            e.target.src = 'images/default_cover.png';
        }
    }
}, true);

/** 
 * Wrapper cho fetch để tự động đính kèm JWT Token vào Header 
 */
export async function apiFetch(endpoint, options = {}) {// Wrapper cho fetch để tự động đính kèm JWT Token vào Header
    // Tự động thêm dấu / nếu thiếu
    const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    options.headers = options.headers || {};// Khởi tạo headers

    const token = window.authToken || localStorage.getItem('token');// Lấy token từ window hoặc localStorage
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;// Đính kèm token vào header
    }

    if (options.body && typeof options.body === 'string' && !options.headers['Content-Type']) {// Tự động set Content-Type là JSON nếu body là string
        options.headers['Content-Type'] = 'application/json';//
    }

    try {
        const response = await fetch(url, options);// Gọi API

        // Xử lý lỗi xác thực (401 hoặc 403)
        if (response.status === 401 || response.status === 403) {
            console.warn("Lỗi xác thực, đang đăng xuất...");
            localStorage.removeItem('currentUser');// Xóa thông tin người dùng khỏi localStorage
            localStorage.removeItem('token');// Xóa token khỏi localStorage
            window.currentUser = null;// Xóa thông tin người dùng khỏi window
            window.authToken = null;// Xóa token khỏi window
            window.renderLogin();
            return null;
        }

        // Xử lý lỗi bảo trì (503)
        if (response.status === 503) {
            const data = await response.json();// Lấy dữ liệu từ response
            window.renderMaintenance(data.message);// Hiển thị thông báo bảo trì
            return null;
        }

        return response;
    } catch (error) {
        console.error("API Fetch Error:", error);
        throw error;
    }
}
window.apiFetch = apiFetch;


//2. MODULE IMPORTS (CẬP NHẬT CẤU TRÚC TÁCH NHỎ) ---
import * as AuthModule from './modules/auth.js';//
import * as NewsfeedModule from './modules/newsfeed.js';
import * as ChatModule from './modules/chat.js';
import * as SearchModule from './modules/search.js';
import * as GroupModule from './modules/group.js';
import * as NotificationModule from './modules/notification.js';
import * as ProfileModule from './modules/profile.js';
import * as FriendRequestModule from './modules/friendRequest.js';
import * as SettingModule from './modules/setting.js';


//3. UI UTILITIES ---
export function showToast(message, type = 'info') {// Hiển thị thông báo Toast
    const toast = document.createElement('div');// Tạo element toast
    toast.className = 'surface fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity duration-300';// Set class cho toast
    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
            <span>${message}</span>
        </div>
    `;// Set nội dung cho toast
    document.body.appendChild(toast);// Thêm toast vào body

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
window.showToast = showToast;

export function showConfirmDialog(message, onConfirm) {// Hiển thị dialog xác nhận
    const modal = document.createElement('div');// Tạo element modal
    modal.className = 'modal-backdrop fixed inset-0 flex items-center justify-center z-50 bg-black/50';// Set class cho modal
    modal.innerHTML = `
        <div class="surface p-6 max-w-sm rounded-lg shadow-xl bg-white">
            <p class="mb-4 text-slate-700 font-medium">${message}</p>
            <div class="flex gap-2 justify-end">
                <button id="btnConfirm" class="px-4 py-2 bg-red-500 text-white rounded-lg font-bold">Xác nhận</button>
                <button id="btnCancel" class="px-4 py-2 border rounded-lg font-bold">Hủy</button>
            </div>
        </div>
    `;// Set nội dung cho modal
    document.body.appendChild(modal);// Thêm modal vào body

    document.getElementById('btnConfirm').onclick = () => {
        onConfirm();
        modal.remove();
    };// Xử lý sự kiện khi nhấn xác nhận
    document.getElementById('btnCancel').onclick = () => modal.remove();// Xử lý sự kiện khi nhấn hủy
}
window.showConfirmDialog = showConfirmDialog;

export function openModal(title, contentHTML) {// Mở modal hệ thống
    const modal = document.getElementById('appModal');// Lấy element modal
    const modalBody = document.getElementById('modalBody');// Lấy element modal body
    const modalContent = modal?.querySelector('.modal-content');// Lấy element modal content

    if (modal && modalBody && modalContent) {// Kiểm tra element modal, modal body và modal content có tồn tại không
        let modalTitle = modalContent.querySelector('h3');// Lấy element modal title
        if (!modalTitle) {
            modalTitle = document.createElement('h3');// Tạo element modal title
            modalTitle.className = 'text-2xl font-bold mb-4 border-b pb-2';// Set class cho modal title
            modalContent.insertBefore(modalTitle, modalBody);// Thêm modal title vào modal content
        }

        modalTitle.textContent = title;// Set nội dung cho modal title
        modalBody.innerHTML = contentHTML;// Set nội dung cho modal body
        modal.classList.remove('hidden');// Hiển thị modal
    }
}
window.openModal = openModal;

export function closeModal() {// Đóng modal hệ thống
    const modal = document.getElementById('appModal');// Lấy element modal
    if (modal) modal.classList.add('hidden');// Ẩn modal
    const modalBody = document.getElementById('modalBody');// Lấy element modal body
    if (modalBody) modalBody.innerHTML = '';// Xóa nội dung modal body
}
window.closeModal = closeModal;

export function getTimeAgo(timestamp) {// Tính thời gian đã trôi qua
    const now = new Date();// Lấy thời gian hiện tại
    const time = new Date(timestamp);// Lấy thời gian từ timestamp
    const diff = Math.floor((now - time) / 1000);// Tính số giây đã trôi qua

    const MINUTE = 60;// Số giây trong 1 phút
    const HOUR = 3600;// Số giây trong 1 giờ
    const DAY = 86400;// Số giây trong 1 ngày

    if (diff < MINUTE) return 'Vừa xong';// Nếu số giây đã trôi qua nhỏ hơn 1 phút
    if (diff < HOUR) return Math.floor(diff / 60) + ' phút trước';// Nếu số giây đã trôi qua nhỏ hơn 1 giờ
    if (diff < DAY) return Math.floor(diff / 3600) + ' giờ trước';// Nếu số giây đã trôi qua nhỏ hơn 1 ngày
    if (diff < 604800) return Math.floor(diff / 86400) + ' ngày trước';// Nếu số giây đã trôi qua nhỏ hơn 1 tuần
    return time.toLocaleDateString('vi-VN');// Nếu số giây đã trôi qua lớn hơn 1 tuần
}
window.getTimeAgo = getTimeAgo;

export function getAvatarUrl(avatarPath, gender = 'male') {// Lấy đường dẫn Avatar chuẩn hóa (Global Helper)
    if (!avatarPath) {// Nếu không có avatar path
        // Fallback theo giới tính
        const genderStr = String(gender).toLowerCase();// Chuyển giới tính thành chữ thường
        if (genderStr === 'female' || genderStr === 'nữ') {// Nếu giới tính là nữ
            return './images/default_avatar_female.png';// Trả về avatar nữ
        }
        return './images/default_avatar_male.png';// Trả về avatar nam
    }

    if (avatarPath.startsWith('http') || avatarPath.startsWith('//')) {// Nếu avatar path bắt đầu bằng http hoặc //
        return avatarPath;// Trả về avatar path
    }

    if (avatarPath.includes('frontend/images/') || avatarPath.startsWith('images/')) {// Nếu avatar path chứa frontend/images/ hoặc bắt đầu bằng images/
        // Extract filename and point to local images folder
        return avatarPath;
    }

    if (avatarPath.includes('frontend/images/') || avatarPath.startsWith('images/')) {// Nếu avatar path chứa frontend/images/ hoặc bắt đầu bằng images/
        const filename = avatarPath.split('/').pop(); // Lấy tên file
        return `./images/${filename}`;// Trả về avatar path
    }

    let cleanPath = avatarPath.replace(/\\/g, '/').replace(/^\/+/, '');// Chuẩn hóa đường dẫn (thay thế backslash cho Windows, bỏ dấu / ở đầu)

    cleanPath = cleanPath.replace('uploads/avatars/', 'uploads/');// Xử lý đường dẫn cũ bị thừa thư mục con
    cleanPath = cleanPath.replace('uploads/covers/', 'uploads/');// Xử lý đường dẫn cũ bị thừa thư mục con

    if (!cleanPath.startsWith('uploads/')) {// Đảm bảo đường dẫn bắt đầu bằng 'uploads/' nếu là file từ server
        cleanPath = `uploads/${cleanPath}`;// Trả về avatar path
    }

    const backendDomain = API_URL.replace('/api', ''); // http://localhost:3000
    return `${backendDomain}/${cleanPath}`;// Trả về avatar path
}
window.getAvatarUrl = getAvatarUrl;

export function getAvatarWithStatusHtml(userId, avatarPath, gender, sizeClass = 'w-10 h-10') {// Trình trợ giúp để lấy HTML của Avatar kèm theo điểm trạng thái online (Global Helper)
    const avatarUrl = getAvatarUrl(avatarPath, gender);// Lấy avatar url
    const isOnline = window.onlineUsersSet && window.onlineUsersSet.has(String(userId));// Kiểm tra user online

    return `
        <div class="relative ${sizeClass} flex-shrink-0 avatar-wrapper-user-${userId}">
            <img src="${avatarUrl}" class="w-full h-full rounded-full object-cover border border-gray-100 dark:border-slate-800" onerror="this.src='./images/default_avatar_male.png'">
            <div class="status-dot-user-${userId} absolute bottom-0 right-0 w-[25%] h-[25%] bg-green-500 border-2 border-white dark:border-slate-900 rounded-full ${isOnline ? '' : 'hidden'}"></div>
        </div>
    `;// Trả về HTML của avatar kèm theo điểm trạng thái online
}
window.getAvatarWithStatusHtml = getAvatarWithStatusHtml;

export function updateGlobalOnlineStatus(userId, status) {// Cập nhật trạng thái hiển thị của tất cả các avatar của một user trên toàn trang
    if (status === 'online') {
        window.onlineUsersSet.add(String(userId));// Thêm user vào set
    } else {
        window.onlineUsersSet.delete(String(userId));// Xóa user khỏi set
    }

    const dots = document.querySelectorAll(`.status-dot-user-${userId}`);// Lấy tất cả các điểm trạng thái online
    if (status === 'online') {
        dots.forEach(dot => dot.classList.remove('hidden'));// Hiển thị điểm trạng thái online
    } else {
        dots.forEach(dot => dot.classList.add('hidden'));// Ẩn điểm trạng thái online
    }
}
window.updateGlobalOnlineStatus = updateGlobalOnlineStatus;


//4. VIEW MANAGEMENT
export function switchView(view, id = null) {// Chuyển đổi giữa các View
    if (view === 'profile' && id) {// Nếu view là profile và có id
        window.currentView = `profile_${id}`;// Cập nhật view
    }
    else if (view === 'post' && id) {// Nếu view là post và có id
        window.currentView = `post_${id}`;// Cập nhật view
    }
    else if (view === 'group' && id) {// Nếu view là group và có id
        window.currentView = `group_detail_${id}`;// Cập nhật view
    } else {
        window.currentView = view;// Cập nhật view
    }

    renderCurrentView();// Render nội dung dựa trên trạng thái window.currentView
    updateHeaderActiveState(view);// Cập nhật header active state
    document.getElementById('searchDropdown')?.classList.add('hidden');// Ẩn search dropdown
}
window.switchView = switchView;

export function renderCurrentView() {// Render nội dung dựa trên trạng thái window.currentView
    // 1. Kiểm tra quyền truy cập (Nếu chưa login chỉ được xem login/register)
    if (!window.currentUser && window.currentView !== 'login' && window.currentView !== 'register') {// Nếu chưa login và không phải view login/register
        window.currentView = 'login';// Cập nhật view
        AuthModule.renderLogin();
        return;
    }
    else if (window.currentUser && (window.currentView === 'login' || window.currentView === 'register')) {// Nếu đã login và view là login/register
        window.currentView = 'home';// Cập nhật view
    }

    const mainContent = document.getElementById('mainContent');// Lấy main content
    if (!mainContent && window.currentView !== 'login' && window.currentView !== 'register') {// Nếu không có main content và không phải view login/register
        return;
    }

    const viewName = window.currentView.split('_')[0];// Lấy view name

    // 2. Định tuyến View
    switch (viewName) {
        case 'login':// Nếu view là login
            loadAuthShell();
            AuthModule.renderLogin();
            break;
        case 'register':// Nếu view là register
            loadAuthShell();
            AuthModule.renderRegister();
            break;
        case 'home':// Nếu view là home
            NewsfeedModule.renderHome();
            break;
        case 'pages':// Nếu view là pages
            GroupModule.renderGroupList();
            break;
        case 'notifications':// Nếu view là notifications
            NotificationModule.renderNotificationsPage();
            break;
        case 'settings':// Nếu view là settings
            SettingModule.renderSettings();
            break;
        case 'archive':// Nếu view là archive
            NewsfeedModule.renderArchivePage();
            break;
        case 'friendRequests':// Nếu view là friendRequests
            FriendRequestModule.renderFriendRequests();
            break;
        case 'profile':// Nếu view là profile
            const userId = window.currentView.substring('profile_'.length);
            ProfileModule.renderProfile(userId);
            break;
        case 'group':// Nếu view là group
            if (window.currentView.startsWith('group_detail_')) {// Nếu view là group_detail
                const groupId = window.currentView.substring('group_detail_'.length);
                GroupModule.renderGroupDetail(groupId);
            }
            break;
        case 'post':// Nếu view là post
            (async () => {
                const postId = window.currentView.substring('post_'.length);// Lấy post id
                try {
                    const res = await apiFetch(`/posts/${postId}/check`);// Kiểm tra post tồn tại
                    if (!res) return;
                    const data = await res.json();// Lấy data

                    if (!data.exists) {
                        showToast("Bài viết này không còn tồn tại!", "error");// Hiển thị thông báo
                        switchView('home');
                        return;
                    }

                    if (data.groupId) {
                        // Post in group
                        const memberRes = await apiFetch(`/groups/${data.groupId}/check-member?user_id=${window.currentUser.userId}`);// Kiểm tra user có trong group không
                        if (!memberRes) return;
                        const memberData = await memberRes.json();// Lấy data

                        switchView('group', data.groupId);// Chuyển view
                        if (memberData.isMember) {// Nếu user có trong group
                            setTimeout(() => {
                                const el = document.getElementById(`post-${postId}`);// Lấy post
                                if (el) {// Nếu post tồn tại
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });// Scroll vào post
                                    el.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');// Thêm hiệu ứng
                                    setTimeout(() => el.classList.remove('ring-4', 'ring-blue-500'), 3000);// Loại bỏ hiệu ứng
                                }
                            }, 1500);
                        } else {
                            showToast("Bài viết nằm trong nhóm. Hãy tham gia để xem chi tiết!", "info");// Hiển thị thông báo
                        }
                    } else {
                        switchView('profile', data.ownerId);// Chuyển view
                        setTimeout(() => {
                            const el = document.getElementById(`post-${postId}`);// Lấy post
                            if (el) {// Nếu post tồn tại
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });// Scroll vào post
                                el.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');// Thêm hiệu ứng
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
                mainContent.innerHTML = `<div class="p-8 text-center text-gray-500 italic">Tính năng ${window.currentView} đang phát triển...</div>`;// Hiển thị thông báo
            }
            break;
    }
}

export function loadAuthShell() {// Nạp khung HTML cho Auth (Sử dụng khi logout hoặc khởi tạo)
    const app = document.getElementById('app');// Lấy app
    app.innerHTML = `
        <div id="authTemplate" class="h-full w-full flex items-center justify-center bg-slate-50">
            <div id="authContainer" class="surface w-full max-w-md p-8 rounded-2xl shadow-xl bg-white animate-fade-in">
                </div>
        </div>

        <template id="loginTemplate">
            <div class="text-center mb-8">
                <div class="text-5xl mb-4">🌐</div>
                <h1 class="text-2xl font-black text-slate-800">Mini Social Network</h1>
                <p class="text-slate-500 mt-2">Kết nối và chia sẻ với mọi người</p>
            </div>
            <form id="loginForm" class="space-y-4">
                <input type="text" id="loginEmail" placeholder="Email hoặc Username" required 
                       class="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none transition">
                <input type="password" id="loginPassword" placeholder="Mật khẩu" required 
                       class="w-full p-3 border-2 border-slate-100 rounded-xl focus:border-blue-500 outline-none transition">
                <button type="submit" class="w-full p-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition">Đăng nhập</button>
            </form>
            <div class="mt-6 flex flex-col gap-3 text-center">
                <button onclick="window.renderForgotPassword()" class="text-slate-500 text-sm hover:text-blue-600 transition">Quên mật khẩu?</button>
                <button onclick="window.renderRegister()" class="text-blue-600 font-extrabold hover:underline">Tạo tài khoản mới</button>
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

function loadNewsfeedShell() {// Nạp Newsfeed Shell Template
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

export function renderApp() {// Render App Shell (Header, Sidebar, Content)
    const config = window.elementSdk ? window.elementSdk.config : defaultConfig;

    document.getElementById('app').innerHTML = `
        <header id="mainHeader" class="surface shadow-md p-4 sticky top-0 z-[1000] bg-white dark:bg-slate-900 border-b dark:border-slate-800 transition-colors duration-300">
            <div class="flex items-center justify-between max-w-7xl mx-auto">
                <div class="flex items-center gap-4 cursor-pointer" onclick="window.switchView('home')">
                    <div class="text-3xl">🌐</div>
                    <h1 class="site-name text-content font-bold dark:text-white" style="font-size:${config.fontSize * 1.5}px;">Mini Social Network</h1>
                </div>

                <div class="flex-1 max-w-xl mx-4 relative group">
                    <!-- Bẫy lỗi autofill của trình duyệt -->
                    <input type="text" style="display:none" aria-hidden="true">
                    <input type="password" style="display:none" aria-hidden="true">
                    
                    <input type="text" id="globalSearchInput" placeholder="🔍 Tìm kiếm bạn bè, nhóm..." autocomplete="chrome-off"
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
    if (window.ChatModule?.switchChatTab) {// Kiểm tra tồn tại
        window.ChatModule.switchChatTab('friends');// Khởi tạo trạng thái chat mặc định
    }

    // Tải thông báo & lời mời ban đầu
    if (NotificationModule.loadInitialUnreadCount) NotificationModule.loadInitialUnreadCount();// Tải thông báo
    if (FriendRequestModule.loadBadgeCount) FriendRequestModule.loadBadgeCount();// Tải lời mời
}
window.renderApp = renderApp;


function setupResizer() {// Cài đặt resizer hay chia layout
    const resizer = document.getElementById('splitter');// Lấy resizer
    const chatSidebar = document.getElementById('chatSidebar');// Lấy chat sidebar
    const mainLayout = document.getElementById('mainLayout');// Lấy main layout
    if (!resizer || !chatSidebar) return;// Kiểm tra tồn tại

    let isResizing = false;// Cài đặt trạng thái resizer

    resizer.addEventListener('mousedown', () => { isResizing = true; document.body.style.cursor = 'col-resize'; });// Cài đặt sự kiện mousedown
    document.addEventListener('mousemove', (e) => {// Cài đặt sự kiện mousemove
        if (!isResizing) return;
        const containerWidth = mainLayout.offsetWidth;
        const newWidth = (e.clientX / containerWidth) * 100;
        if (newWidth >= 20 && newWidth <= 50) {// Kiểm tra width
            chatWidth = newWidth;
            chatSidebar.style.width = `${chatWidth}%`;
        }
    });
    document.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = 'default'; });// Cài đặt sự kiện mouseup
}


export function setupSocketHandlers() {// Cài đặt socket handlers
    if (!window.currentUser) return;// Kiểm tra tồn tại
    io.emit('register_user', window.currentUser.userId);// Gửi yêu cầu đăng ký

    //Kiểm tra trạng thái Online ban đầu của bạn bè sau khi đã nạp sidebar
    setTimeout(() => {
        const friendIds = Array.from(document.querySelectorAll('[id^="chat-item-"]')).map(el => el.id.replace('chat-item-', ''));// Lấy danh sách bạn bè
        if (friendIds.length > 0) {// Kiểm tra tồn tại
            io.emit('check_online_status', friendIds, (statusMap) => {// Gửi yêu cầu kiểm tra trạng thái Online
                Object.keys(statusMap).forEach(uid => {// Duyệt qua danh sách
                    if (window.updateGlobalOnlineStatus) {// Cập nhật trạng thái global
                        window.updateGlobalOnlineStatus(uid, statusMap[uid]);
                    }
                    if (window.ChatModule && window.ChatModule.updateOnlineStatus) {// Cập nhật trạng thái chat
                        window.ChatModule.updateOnlineStatus(uid, statusMap[uid]);
                    }
                });
            });
        }
    }, 2000);

    // Trạng thái Online/Offline Realtime
    io.on('user_status_changed', (data) => {
        if (window.updateGlobalOnlineStatus) {
            window.updateGlobalOnlineStatus(data.userId, data.status);
        }
        // Giữ lại callback cho ChatModule nếu cần logic đặc thù (ví dụ cập nhật sidebar list)
        if (window.ChatModule && window.ChatModule.updateOnlineStatus) {
            window.ChatModule.updateOnlineStatus(data.userId, data.status);
        }
    });

    // Bài viết mới Realtime (Newsfeed thời gian thực)
    io.on('new_post', (fullPost) => {
        if (window.NewsfeedModule && window.NewsfeedModule.handleNewPostRealtime) {
            window.NewsfeedModule.handleNewPostRealtime(fullPost);
        }
    });

    // Tin nhắn riêng tư
    io.on('receive_private_message', (data) => {
        if (typeof ChatModule.displayMessage === 'function') {// Kiểm tra tồn tại
            const isSelf = String(data.senderId) === String(window.currentUser.userId);// Kiểm tra người gửi
            ChatModule.displayMessage(data, isSelf);// Hiển thị tin nhắn
        }
    });

    // Thông báo realtime
    io.on('new_notification', (data) => {
        showToast(data.content, 'info');
        if (NotificationModule.updateUnreadCount) {
            NotificationModule.updateUnreadCount('increment');
        }
        // Cập nhật list thông báo nếu đang mở trang thông báo
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


// 7. INITIALIZE APP 
function initializeApp() {
    const storedUser = localStorage.getItem('currentUser');
    const storedToken = localStorage.getItem('token');

    if (storedUser && storedToken) {
        window.currentUser = JSON.parse(storedUser);
        window.authToken = storedToken; // [NEW] Nạp token

        // Redirect Admin to Dashboard immediately (Check role or username fallback)
        console.log("Checking Admin Redirect:", window.currentUser);
        if (['admin', 'super_admin'].includes(window.currentUser.role) || window.currentUser.username === 'admin') {
            console.log("Redirecting to Admin Dashboard...");
            window.location.href = 'admin.html';
            return;
        }

        setupSocketHandlers();
        renderApp();

        // Xóa triệt để autofill của trình duyệt trên thanh tìm kiếm
        setTimeout(() => {
            const searchInput = document.getElementById('globalSearchInput');
            if (searchInput) searchInput.value = '';
        }, 500);
    } else {
        AuthModule.renderLogin();
    }
}

// 8. GLOBAL HOOKS & EXPORTS 

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

window.openReportModal = function (targetType, targetId) {
    const htmlContent = `
        <div class="p-6">
            <h3 class="text-xl font-bold bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent mb-4">
                📢 Báo cáo vi phạm</h3>
            <form id="reportForm" onsubmit="window.handleReportSubmit(event)">
                <input type="hidden" id="reportTargetType" value="${targetType}">
                <input type="hidden" id="reportTargetId" value="${targetId}">

                <div class="space-y-3 mb-4 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    <p class="font-medium text-slate-700 dark:text-slate-300">Vui lòng chọn lý do vi phạm:</p>

                    <label class="flex items-start p-3 border dark:border-slate-600 rounded-lg cursor-pointer hover:bg-red-50 dark:hover:bg-slate-700 transition group">
                        <input type="radio" name="reason" value="spam" class="mt-1 w-4 h-4 text-red-600 focus:ring-red-500" checked>
                        <div class="ml-3">
                            <div class="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-red-700 dark:group-hover:text-red-400">
                                🚫 Nội dung rác (Spam)</div>
                            <div class="text-xs text-slate-500 dark:text-slate-400">Đăng tải quá nhiều nội dung lặp lại, quảng cáo trái phép</div>
                        </div>
                    </label>

                    <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-red-50 transition">
                        <input type="radio" name="reason" value="hate_speech" class="mt-1 w-4 h-4 text-red-600">
                        <div class="ml-3">
                            <div class="font-bold text-sm text-slate-800">😡 Ngôn từ gây thù ghét</div>
                            <div class="text-xs text-slate-500">Phân biệt đối xử về chủng tộc, tôn giáo, giới tính</div>
                        </div>
                    </label>

                    <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-red-50 transition">
                        <input type="radio" name="reason" value="harassment" class="mt-1 w-4 h-4 text-red-600">
                        <div class="ml-3">
                            <div class="font-bold text-sm text-slate-800">⚠️ Quấy rối và bắt nạt</div>
                            <div class="text-xs text-slate-500">Đe dọa, làm phiền người dùng khác</div>
                        </div>
                    </label>

                    <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-red-50 transition">
                        <input type="radio" name="reason" value="sensitive_content" class="mt-1 w-4 h-4 text-red-600">
                        <div class="ml-3">
                            <div class="font-bold text-sm text-slate-800">🔞 Nội dung nhạy cảm/Bạo lực</div>
                            <div class="text-xs text-slate-500">Hình ảnh khiêu dâm, bạo lực máu me</div>
                        </div>
                    </label>

                    <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-red-50 transition">
                        <input type="radio" name="reason" value="impersonation" class="mt-1 w-4 h-4 text-red-600">
                        <div class="ml-3">
                            <div class="font-bold text-sm text-slate-800">👤 Mạo danh</div>
                            <div class="text-xs text-slate-500">Giả mạo tài khoản người khác</div>
                        </div>
                    </label>

                    <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-red-50 transition">
                        <input type="radio" name="reason" value="privacy_violation" class="mt-1 w-4 h-4 text-red-600">
                        <div class="ml-3">
                            <div class="font-bold text-sm text-slate-800">🔒 Vi phạm quyền riêng tư</div>
                            <div class="text-xs text-slate-500">Chia sẻ thông tin cá nhân khi chưa được phép (Doxxing)</div>
                        </div>
                    </label>
                </div>

                <div class="mb-4">
                    <label for="reportDescription" class="block mb-2 text-sm font-medium text-slate-700">Mô tả chi tiết (Tùy chọn):</label>
                    <textarea id="reportDescription" rows="3" class="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-red-500 focus:border-red-500" placeholder="Hãy mô tả thêm về vấn đề bạn gặp phải..."></textarea>
                </div>

                <div class="flex justify-end gap-2">
                    <button type="button" onclick="window.closeModal()" class="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Hủy</button>
                    <button type="submit" class="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 shadow-md transition transform active:scale-95">Gửi báo cáo</button>
                </div>
            </form>
        </div>
    `;

    window.openModal('Báo cáo vi phạm', htmlContent);
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

//7. MAINTENANCE MODE UTILS
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

// Active State Logic
export function updateHeaderActiveState(view) {// Cập nhật trạng thái header
    if (!view) return;
    const viewName = view.split('_')[0];// Lấy tên view
    const mapping = {// Tạo mapping
        'home': 'nav-btn-home',
        'pages': 'nav-btn-pages',
        'notifications': 'nav-btn-notifications',
        'friendRequests': 'nav-btn-friendRequests',
        'profile': 'nav-btn-profile',
        'settings': 'nav-btn-settings'
    };

    document.querySelectorAll('.nav-btn').forEach(btn => {// Reset tất cả
        btn.classList.remove('bg-blue-100', 'text-blue-600', 'dark:bg-blue-900', 'dark:text-white', 'shadow-inner');
        btn.classList.add('hover:bg-slate-100', 'dark:hover:bg-slate-800', 'text-slate-600', 'dark:text-slate-400');
    });

    const activeBtnId = mapping[viewName];// Lấy id button active
    if (activeBtnId) {// Nếu có id button active
        const btn = document.getElementById(activeBtnId);// Lấy button active
        if (btn) {// Nếu có button active
            btn.classList.remove('hover:bg-slate-100', 'dark:hover:bg-slate-800', 'text-slate-600', 'dark:text-slate-400');
            btn.classList.add('bg-blue-100', 'text-blue-600', 'dark:bg-blue-900', 'dark:text-white', 'shadow-inner');
        }
    }
}
window.updateHeaderActiveState = updateHeaderActiveState;

// Close modal on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeModal();
});

document.addEventListener('DOMContentLoaded', initializeApp);