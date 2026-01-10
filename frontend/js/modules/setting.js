import { API_URL, showToast, openModal, closeModal, apiFetch } from '../main.js';

/**
 * @desc Render giao diện cài đặt chính
 */
export function renderSettings() {
    const main = document.getElementById('mainContent');
    if (!main) return;

    const isDark = localStorage.getItem('theme') === 'dark';

    main.innerHTML = `
        <div class="max-w-2xl mx-auto space-y-6 pb-10 animate-fade-in">
            <div class="surface rounded-[2rem] shadow-sm p-8 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300">
                <div class="mb-10 text-center md:text-left">
                    <h2 class="text-3xl font-black text-slate-800 dark:text-white tracking-tight flex items-center justify-center md:justify-start gap-4">
                        <span class="w-12 h-12 flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 rounded-2xl text-2xl">⚙️</span> 
                        Cài đặt hệ thống
                    </h2>
                    <p class="text-slate-400 dark:text-slate-500 mt-2 font-medium">Quản lý bảo mật và hoạt động của bạn</p>
                </div>
                
                <div class="space-y-3">
                    <div class="flex justify-between items-center p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-[1.5rem] transition-all group">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-lg">🌓</div>
                            <div>
                                <div class="font-bold text-slate-700 dark:text-slate-200">Chế độ tối</div>
                                <div class="text-xs text-slate-400 dark:text-slate-500">Giảm độ chói, bảo vệ mắt</div>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer scale-110">
                            <input type="checkbox" id="darkModeToggle" ${isDark ? 'checked' : ''} onchange="window.SettingModule.toggleDark()" class="sr-only peer">
                            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    <div class="flex justify-between items-center p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-[1.5rem] transition-all group">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center rounded-xl bg-green-50 dark:bg-green-900/20 text-green-500 text-lg">●</div>
                            <div>
                                <div class="font-bold text-slate-700 dark:text-slate-200">Trạng thái hoạt động</div>
                                <div class="text-xs text-slate-400 dark:text-slate-500">Hiển thị khi bạn đang hoạt động</div>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer scale-110">
                            <input type="checkbox" id="onlineStatusToggle" 
                                   ${((window.currentUser.user_info ? (typeof window.currentUser.user_info === 'string' ? JSON.parse(window.currentUser.user_info) : window.currentUser.user_info) : {}).online_status !== false) ? 'checked' : ''} 
                                   onchange="window.SettingModule.toggleOnlineStatus()" class="sr-only peer">
                            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                        </label>
                    </div>

                    <div class="flex justify-between items-center p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-[1.5rem] transition-all cursor-pointer group" onclick="window.SettingModule.openPrivacyModal()">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-lg">🔒</div>
                            <div>
                                <div class="font-bold text-slate-700 dark:text-slate-200">Quyền riêng tư Profile</div>
                                <div class="text-xs text-slate-400 dark:text-slate-500">
                                    Trạng thái: ${window.currentUser.privacy_setting == 1 ? '<span class="text-green-500 font-bold">Công khai</span>' : '<span class="text-blue-500 font-bold">Riêng tư</span>'}
                                </div>
                            </div>
                        </div>
                        <span class="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest bg-blue-50 dark:bg-blue-900/40 px-3 py-1.5 rounded-lg group-hover:scale-105 transition">Cấu hình</span>
                    </div>

                    <div class="py-4 px-2 italic text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-[0.2em]">Hoạt động & Bài viết</div>

                    <div class="flex justify-between items-center p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-[1.5rem] transition-all cursor-pointer group" onclick="window.SettingModule.openActivityModal('favorites')">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center rounded-xl bg-pink-50 dark:bg-pink-900/20 text-pink-500 text-lg">❤️</div>
                            <div>
                                <div class="font-bold text-slate-700 dark:text-slate-200">Bài viết yêu thích</div>
                                <div class="text-xs text-slate-400 dark:text-slate-500">Những nội dung bạn đã lưu lại</div>
                            </div>
                        </div>
                        <span class="text-slate-300 group-hover:translate-x-1 transition">➔</span>
                    </div>

                    <div class="flex justify-between items-center p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-[1.5rem] transition-all cursor-pointer group" onclick="window.SettingModule.openActivityModal('hidden')">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-lg">👁️‍🗨️</div>
                            <div>
                                <div class="font-bold text-slate-700 dark:text-slate-200">Bài viết đã ẩn</div>
                                <div class="text-xs text-slate-400 dark:text-slate-500">Quản lý nội dung bạn không muốn thấy</div>
                            </div>
                        </div>
                        <span class="text-slate-300 group-hover:translate-x-1 transition">➔</span>
                    </div>

                    <div class="flex justify-between items-center p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-[1.5rem] transition-all cursor-pointer group" onclick="window.switchView('archive')">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-500 text-lg">📂</div>
                            <div>
                                <div class="font-bold text-slate-700 dark:text-slate-200">Kho lưu trữ</div>
                                <div class="text-xs text-slate-400 dark:text-slate-500">Quản lý bài viết đã xóa</div>
                            </div>
                        </div>
                        <span class="text-slate-300 group-hover:translate-x-1 transition">➔</span>
                    </div>

                    <div class="py-4 px-2 italic text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-[0.2em]">Bảo mật tài khoản</div>

                    <div class="flex justify-between items-center p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-[1.5rem] transition-all cursor-pointer group" onclick="window.SettingModule.openChangeEmailModal()">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-lg">📧</div>
                            <div>
                                <div class="font-bold text-slate-700 dark:text-slate-200">Email đăng nhập</div>
                                <div class="text-xs text-slate-400 dark:text-slate-500">${window.currentUser.email}</div>
                            </div>
                        </div>
                        <span class="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase italic group-hover:text-blue-500 transition">Sửa</span>
                    </div>

                    <div class="flex justify-between items-center p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-[1.5rem] transition-all cursor-pointer group" onclick="window.SettingModule.openChangeNameModal()">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-lg">👤</div>
                            <div>
                                <div class="font-bold text-slate-700 dark:text-slate-200">Họ và tên</div>
                                <div class="text-xs text-slate-400 dark:text-slate-500">${window.currentUser.name}</div>
                            </div>
                        </div>
                        <span class="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase italic group-hover:text-blue-500 transition">Sửa</span>
                    </div>

                    <div class="flex justify-between items-center p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-[1.5rem] transition-all cursor-pointer group" onclick="window.SettingModule.openChangePasswordModal()">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-lg">🔑</div>
                            <div>
                                <div class="font-bold text-slate-700 dark:text-slate-200">Mật khẩu</div>
                                <div class="text-xs text-slate-400 dark:text-slate-500">Thay đổi định kỳ để bảo mật</div>
                            </div>
                        </div>
                        <span class="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase italic group-hover:text-blue-500 transition">Đổi</span>
                    </div>
                </div>

                <div class="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-center">
                    <button onclick="window.handleLogout()" class="px-10 py-4 bg-red-50 dark:bg-red-900/10 text-red-500 dark:text-red-400 rounded-[1.25rem] font-black text-xs hover:bg-red-500 hover:text-white transition-all duration-500 shadow-sm active:scale-95 uppercase tracking-widest">
                        🚪 Đăng xuất khỏi thiết bị
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * @desc Mở Modal xem danh sách bài viết (Yêu thích/Đã ẩn)
 */
export async function openActivityModal(type) {
    const title = type === 'favorites' ? 'Bài viết yêu thích' : 'Bài viết đã ẩn';
    const endpoint = type === 'favorites' ? 'favorites' : 'hidden';

    openModal(title, `<div class="p-10 text-center animate-pulse text-slate-400 font-medium">Đang tải danh sách...</div>`);

    try {
        const res = await apiFetch(`/posts/${endpoint}?user_id=${window.currentUser.userId}`);
        if (!res) return;
        const posts = await res.json();

        const modalBody = document.getElementById('modalBody');
        if (!posts || posts.length === 0) {
            modalBody.innerHTML = `<div class="p-12 text-center text-slate-400 italic font-medium">Bạn chưa có bài viết nào trong mục này.</div>`;
            return;
        }

        modalBody.innerHTML = `
            <div class="max-h-[60vh] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                ${posts.map(post => `
                    <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-blue-500 hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer group"
                         onclick="window.SettingModule.goToPost('${post.user_id}', '${post.id}')">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
                                <img src="${post.avatar ? (post.avatar.startsWith('http') ? post.avatar : API_URL.replace('/api', '') + '/' + post.avatar) : 'images/default.png'}" 
                                     class="w-full h-full object-cover" onerror="this.src='images/default.png'">
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-black text-sm text-slate-800 dark:text-slate-200">${post.full_name}</div>
                                <div class="text-xs text-slate-500 truncate mt-0.5">${post.content || '[Hình ảnh / Video]'}</div>
                            </div>
                            <div class="text-[10px] text-slate-400 font-black uppercase group-hover:text-blue-500 group-hover:translate-x-1 transition">Xem ➔</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (e) {
        showToast("Lỗi khi tải dữ liệu hoạt động", "error");
    }
}

/**
 * @desc Điều hướng đến trang cá nhân và cuộn đến bài viết
 */
export function goToPost(ownerId, postId) {
    closeModal();
    // Chuyển hướng tới trang cá nhân của người đăng
    window.switchView('profile', ownerId);

    // Đợi 1 giây để trang profile load xong bài viết
    setTimeout(() => {
        const postElement = document.getElementById(`post-${postId}`);
        if (postElement) {
            postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Hiệu ứng nhấp nháy để người dùng chú ý
            postElement.classList.add('ring-2', 'ring-blue-500', 'animate-pulse');
            setTimeout(() => postElement.classList.remove('ring-2', 'ring-blue-500', 'animate-pulse'), 2000);
        } else {
            showToast("Không tìm thấy bài viết này trên trang cá nhân.", "info");
        }
    }, 1000);
}

// --- CÁC HÀM XỬ LÝ NAME ---

export function openChangeNameModal() {
    openModal('Cập nhật Họ và tên', `
        <div class="space-y-5 p-2">
            <div class="text-[11px] text-slate-500 px-1">Lưu ý: Tên hiển thị sẽ giúp bạn bè dễ nhận ra bạn hơn.</div>
            <input type="text" id="newName" class="w-full p-4 border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl outline-none focus:border-blue-500" placeholder="Họ và tên mới" value="${window.currentUser.name}">
            <input type="password" id="confirmPassForName" class="w-full p-4 border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl outline-none focus:border-blue-500" placeholder="Nhập mật khẩu để xác nhận">
            <button onclick="window.SettingModule.saveName()" class="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">Lưu thay đổi</button>
        </div>
    `);
}

export async function saveName() {
    const newName = document.getElementById('newName').value.trim();
    const password = document.getElementById('confirmPassForName').value;

    if (!newName || !password) return showToast("Vui lòng điền đủ thông tin", "error");

    try {
        const res = await apiFetch(`/users/update-name`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.currentUser.userId,
                new_name: newName,
                password: password
            })
        });
        if (!res) return;
        const data = await res.json();
        if (data.success) {
            window.currentUser.name = newName;
            localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
            showToast("Đổi tên thành công!", "success");
            closeModal();
            renderSettings();
            if (document.getElementById('headerUserName')) document.getElementById('headerUserName').innerText = newName;
        } else {
            showToast(data.message, "error");
        }
    } catch (e) { showToast("Lỗi hệ thống", "error"); }
}

// --- CÁC HÀM XỬ LÝ PRIVACY ---

export function openPrivacyModal() {
    const currentPrivacy = window.currentUser.privacy_setting;
    openModal('Quyền riêng tư Profile', `
        <div class="space-y-6 p-2">
            <div class="grid grid-cols-1 gap-3">
                <div class="p-4 rounded-2xl border-2 ${currentPrivacy == 1 ? 'border-blue-500 bg-blue-50/30' : 'border-slate-100'} transition-all cursor-pointer" onclick="document.getElementById('p_public').checked = true">
                    <div class="flex items-center gap-3 mb-2">
                        <input type="radio" name="priv" id="p_public" value="1" ${currentPrivacy == 1 ? 'checked' : ''} class="w-5 h-5">
                        <label for="p_public" class="font-black text-slate-700 dark:text-slate-200">🌍 Chế độ Công khai</label>
                    </div>
                    <p class="text-[11px] text-slate-500 ml-8 leading-relaxed">Mọi thành viên trong cộng đồng đều có thể xem bài viết, thông tin giới thiệu và danh sách bạn bè của bạn.</p>
                </div>

                <div class="p-4 rounded-2xl border-2 ${currentPrivacy == 0 ? 'border-blue-500 bg-blue-50/30' : 'border-slate-100'} transition-all cursor-pointer" onclick="document.getElementById('p_private').checked = true">
                    <div class="flex items-center gap-3 mb-2">
                        <input type="radio" name="priv" id="p_private" value="0" ${currentPrivacy == 0 ? 'checked' : ''} class="w-5 h-5">
                        <label for="p_private" class="font-black text-slate-700 dark:text-slate-200">🔒 Chế độ Riêng tư (Lock Profile)</label>
                    </div>
                    <p class="text-[11px] text-slate-500 ml-8 leading-relaxed">Chỉ những người đã là <b>Bạn bè</b> mới xem được thông tin chi tiết. <br>Người lạ chỉ thấy được: Tên, Avatar, Ảnh bìa và nút Kết bạn.</p>
                </div>
            </div>
            <button onclick="window.SettingModule.savePrivacy()" class="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-all uppercase text-xs tracking-widest">XÁC NHẬN THAY ĐỔI</button>
        </div>
    `);
}

export async function savePrivacy() {
    const val = document.querySelector('input[name="priv"]:checked').value; // '1' là Công khai, '0' là Riêng tư
    try {
        const res = await apiFetch(`/users/privacy`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.currentUser.userId,
                setting_value: parseInt(val)
            })
        });
        if (!res) return;
        const data = await res.json();
        if (data.success) {
            window.currentUser.privacy_setting = parseInt(val);
            localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
            showToast("Đã cập nhật quyền riêng tư!", "success");
            closeModal();
            renderSettings();
        }
    } catch (e) { showToast("Lỗi kết nối", "error"); }
}

// --- CÁC HÀM TIỆN ÍCH KHÁC ---

export function toggleDark() {
    const isDark = document.body.classList.toggle('dark-mode');
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    showToast(`Giao diện: ${isDark ? 'Tối' : 'Sáng'}`);
}

export function openChangeEmailModal() {
    openModal('Cập nhật Email', `
        <div class="space-y-5 p-2">
            <input type="email" id="newEmail" class="w-full p-4 border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl outline-none focus:border-blue-500" placeholder="Địa chỉ Email mới">
            <input type="password" id="confirmPassForEmail" class="w-full p-4 border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl outline-none focus:border-blue-500" placeholder="Mật khẩu xác nhận">
            <button onclick="window.SettingModule.saveEmail()" class="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest">Cập nhật ngay</button>
        </div>
    `);
}

export async function saveEmail() {
    const newEmail = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('confirmPassForEmail').value;
    if (!newEmail || !password) return showToast("Vui lòng điền đủ thông tin", "error");

    try {
        const res = await apiFetch(`/users/update-email`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId, new_email: newEmail, password: password })
        });
        if (!res) return;
        const data = await res.json();
        if (data.success) {
            window.currentUser.email = newEmail;
            localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
            showToast("Đổi email thành công!", "success");
            closeModal();
            renderSettings();
        } else {
            showToast(data.message, "error");
        }
    } catch (e) { showToast("Lỗi hệ thống", "error"); }
}

export function openChangePasswordModal() {
    openModal('Đổi mật khẩu', `
        <div class="space-y-4 p-2">
            <input type="password" id="oldPass" class="w-full p-4 border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl outline-none focus:border-blue-500" placeholder="Mật khẩu cũ">
            <input type="password" id="newPass" class="w-full p-4 border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl outline-none focus:border-blue-500" placeholder="Mật khẩu mới">
            <input type="password" id="confirmPass" class="w-full p-4 border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl outline-none focus:border-blue-500" placeholder="Xác nhận mật khẩu mới">
            <button onclick="window.SettingModule.savePassword()" class="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg active:scale-95 transition-all uppercase text-xs tracking-widest">Đổi mật khẩu</button>
        </div>
    `);
}

export async function savePassword() {
    const old_password = document.getElementById('oldPass').value;
    const new_password = document.getElementById('newPass').value;
    const confirm = document.getElementById('confirmPass').value;
    if (new_password !== confirm) return showToast("Mật khẩu mới không khớp", "error");

    try {
        const res = await apiFetch(`/auth/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId, old_password, new_password })
        });
        if (!res) return;
        const data = await res.json();
        if (data.success) {
            showToast("Thành công!", "success");
            closeModal();
        } else {
            showToast(data.message, "error");
        }
    } catch (e) { showToast("Lỗi kết nối", "error"); }
}

export async function toggleOnlineStatus() {
    const isVisible = document.getElementById('onlineStatusToggle').checked;

    // Cập nhật local state
    let userInfo = window.currentUser.user_info;
    if (typeof userInfo === 'string') userInfo = JSON.parse(userInfo);
    if (!userInfo) userInfo = {};

    userInfo.online_status = isVisible;
    window.currentUser.user_info = userInfo;
    localStorage.setItem('currentUser', JSON.stringify(window.currentUser));

    try {
        await apiFetch(`/users`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.currentUser.userId,
                user_info: JSON.stringify(userInfo)
            })
        });
        showToast(`Trạng thái hoạt động: ${isVisible ? 'Bật' : 'Tắt'}`);

        // Thông báo cho socket (re-register để server cập nhật preference)
        io.emit('register_user', window.currentUser.userId);

    } catch (e) {
        showToast("Lỗi khi cập nhật trạng thái", "error");
    }
}

// Khởi tạo Global Module
window.SettingModule = {
    renderSettings, toggleDark, openPrivacyModal, savePrivacy,
    openChangeEmailModal, saveEmail, openChangePasswordModal, savePassword,
    openChangeNameModal, saveName, openActivityModal, goToPost, toggleOnlineStatus
};