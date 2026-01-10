import { API_URL, io, showToast, openModal, closeModal } from '../main.js';

const getFullUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    return `${API_URL.replace('/api', '')}/${path.replace(/^\//, '')}`;
};

// Helpers xác định ảnh mặc định theo giới tính
const getAvatar = (user) => {
    if (user.avatar) return getFullUrl(user.avatar);
    return user.gender === 'Female' ? 'images/default_avatar_female.png' : 'images/default_avatar_male.png';
};

const getCover = (user) => {
    if (user.cover_img) return getFullUrl(user.cover_img);
    return user.gender === 'Female' ? 'images/default_cover_female.png' : 'images/default_cover_male.png';
};

/**
 * @desc Render trang cá nhân hoàn chỉnh với logic Quyền riêng tư (Lock Profile)
 */
export async function renderProfile(userId) {
    const mainContent = document.getElementById('mainContent');
    const viewerId = window.currentUser.userId;
    const isOwnProfile = String(userId) === String(viewerId);

    // Hiệu ứng Loading
    mainContent.innerHTML = `
        <div class="flex items-center justify-center p-20">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>`;

    try {
        // 1. Fetch thông tin Profile & Trạng thái quan hệ & Quyền riêng tư
        const profileRes = await apiFetch(`/users/${userId}?viewer_id=${viewerId}`);
        if (!profileRes) return;
        const profileData = await profileRes.json();

        if (!profileData.success) throw new Error(profileData.message);

        const user = profileData.user;
        const relStatus = profileData.relationshipStatus;
        const isLocked = profileData.isLocked;

        // Parse cấu hình hiển thị từ database (JSON user_info)
        const privacy = user.user_info ? (typeof user.user_info === 'string' ? JSON.parse(user.user_info) : user.user_info) : {};

        // 2. Fetch bài đăng (Luôn tải vì Privacy đã chuyển sang Settings)
        let postsData = [];
        const postsRes = await apiFetch(`/posts?user_id=${viewerId}&target_user_id=${userId}&target_type=profile`);
        if (!postsRes) return;
        postsData = await postsRes.json();

        // 3. Render Giao diện chính
        mainContent.innerHTML = `
            <div class="profile-container max-w-4xl mx-auto pb-10 fade-in">
                <div class="relative mb-16">
                    <div class="h-64 bg-slate-200 dark:bg-slate-800 rounded-b-[2.5rem] overflow-hidden relative group shadow-inner">
                        <img id="coverImg" src="${getCover(user)}" 
                             class="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                             onerror="this.src='${user.gender === 'Female' ? 'images/default_cover_female.png' : 'images/default_cover_male.png'}'">
                        ${isOwnProfile ? `
                            <button onclick="window.ProfileModule.triggerUpload('cover')" 
                                    class="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition duration-300 flex items-center gap-2 shadow-lg">
                                📷 <span class="text-xs font-black uppercase">Thay ảnh bìa</span>
                            </button>` : ''}
                    </div>
                    
                    <div class="absolute -bottom-12 left-8 flex items-end gap-6">
                        <div class="relative group">
                            <div class="relative w-40 h-40 flex-shrink-0">
                                <img id="userAvatar" src="${getAvatar(user)}" 
                                     class="w-full h-full rounded-full border-4 border-white dark:border-slate-900 shadow-2xl object-cover bg-white"
                                     onerror="this.src='${user.gender === 'Female' ? 'images/default_avatar_female.png' : 'images/default_avatar_male.png'}'">
                                <div class="status-dot-user-${userId} absolute bottom-2 right-2 w-8 h-8 bg-green-500 border-4 border-white dark:border-slate-900 rounded-full ${window.onlineUsersSet.has(String(userId)) ? '' : 'hidden'}"></div>
                            </div>
                            ${isOwnProfile ? `
                                <button onclick="window.ProfileModule.triggerUpload('avatar')" 
                                        class="absolute inset-0 bg-black/40 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300">
                                    <span class="font-black uppercase text-xs">Sửa</span>
                                </button>` : ''}
                        </div>
                        <div class="mb-4">
                            <h2 class="text-3xl font-black text-slate-800 dark:text-white">${user.full_name}</h2>
                            <p class="text-slate-500 dark:text-slate-400 font-medium italic" id="userBio">
                                ${user.bio || (isOwnProfile ? 'Thêm tiểu sử của bạn...' : '')}
                            </p>
                        </div>
                    </div>
                </div>

                <div class="flex flex-wrap items-center justify-between mb-8 border-b dark:border-slate-800 pb-6 px-4">
                    <div class="flex gap-10 items-center">
                        <div class="text-center cursor-pointer group" onclick="window.ProfileModule.showFriendsList('${userId}')">
                            <span class="block font-black text-2xl text-slate-800 dark:text-white group-hover:text-blue-600 transition">${profileData.friend_count || 0}</span>
                            <span class="text-slate-400 text-[10px] font-black uppercase tracking-widest">Bạn bè</span>
                        </div>
                        <div class="text-center">
                            <span class="block font-black text-2xl text-slate-800 dark:text-white">${postsData.length || 0}</span>
                            <span class="text-slate-400 text-[10px] font-black uppercase tracking-widest">Bài viết</span>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        ${isOwnProfile ? `
                            <button onclick="window.ProfileModule.showEditProfileModal()" class="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-black text-xs uppercase tracking-widest transition shadow-sm">
                                ⚙️ Sửa hồ sơ
                            </button>
                        ` : `
                            ${renderRelationshipButton(userId, relStatus)}
                            <button onclick="window.ProfileModule.goToMessage('${userId}')" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition shadow-lg shadow-blue-100 dark:shadow-none flex items-center gap-2">
                                💬 Nhắn tin
                            </button>
                        `}
                        <button onclick="window.ProfileModule.showShareModal('${userId}')" class="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition shadow-sm" title="Chia sẻ">🔗</button>
                        <button onclick="window.openReportModal('user', '${userId}')" class="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition shadow-sm text-red-500" title="Báo cáo">🚩</button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
                    <div class="md:col-span-1 space-y-6">
                        <div class="surface p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 sticky top-24">
                            <h3 class="font-black text-sm uppercase tracking-[0.2em] mb-6 text-slate-800 dark:text-white">Giới thiệu</h3>
                            
                            ${isLocked ? `
                                <div class="py-4 text-center">
                                    <span class="text-3xl block mb-2">🔒</span>
                                    <p class="text-[11px] text-slate-400 italic">Thông tin đã được ẩn</p>
                                </div>
                            ` : `
                                <ul class="space-y-5 text-slate-600 dark:text-slate-400 text-sm font-medium">
                                    ${privacy.show_work !== false && user.work_place ? `<li class="flex items-center gap-3">💼 <span>Làm việc tại <b class="text-slate-800 dark:text-slate-200">${user.work_place}</b></span></li>` : ''}
                                    ${privacy.show_school !== false && user.education ? `<li class="flex items-center gap-3">🎓 <span>Từng học tại <b class="text-slate-800 dark:text-slate-200">${user.education}</b></span></li>` : ''}
                                    ${privacy.show_location !== false && user.location ? `<li class="flex items-center gap-3">📍 <span>Đến từ <b class="text-slate-800 dark:text-slate-200">${user.location}</b></span></li>` : ''}
                                    ${privacy.show_birthday !== false && user.birthday ? `<li class="flex items-center gap-3">🎂 <span>Sinh nhật <b class="text-slate-800 dark:text-slate-200">${new Date(user.birthday).toLocaleDateString('vi-VN')}</b></span></li>` : ''}
                                    ${user.gender ? `<li class="flex items-center gap-3">⚧ <span>Giới tính <b class="text-slate-800 dark:text-slate-200">${user.gender === 'Other' ? 'Khác' : (user.gender === 'Male' ? 'Nam' : 'Nữ')}</b></span></li>` : ''}
                                    <li class="text-slate-400 dark:text-slate-600 italic flex items-center gap-3 pt-2 border-t dark:border-slate-800">📅 <span>Thành viên SocialVN</span></li>
                                </ul>
                            `}
                        </div>
                    </div>

                    <div class="md:col-span-2 space-y-6">
                        <h3 class="font-black text-sm uppercase tracking-[0.2em] text-slate-800 dark:text-white px-2">Dòng thời gian</h3>
                        <div id="profilePostsContainer" class="space-y-6">
                        <div id="profilePostsContainer" class="space-y-6">
                            ${postsData.length > 0 ? postsData.map(post => window.NewsfeedModule.renderPost(post)).join('') : renderEmptyPosts()}
                        </div>
                        </div>
                    </div>
                </div>
            </div>`;
    } catch (error) {
        console.error(error);
        showToast('Lỗi tải dữ liệu trang cá nhân', 'error');
    }
}

/**
 * @desc Modal Chỉnh sửa hồ sơ đầy đủ
 */
export async function showEditProfileModal() {
    try {
        const res = await apiFetch(`/users/${window.currentUser.userId}?viewer_id=${window.currentUser.userId}`);
        if (!res) return;
        const data = await res.json();
        const user = data.user;
        const privacy = user.user_info ? (typeof user.user_info === 'string' ? JSON.parse(user.user_info) : user.user_info) : {};

        const content = `
            <form id="editProfileForm" class="space-y-6">
                <div class="grid grid-cols-1 gap-5">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tiểu sử cá nhân</label>
                        <textarea name="bio" class="w-full border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-[1.5rem] p-4 focus:border-blue-500 outline-none transition" rows="2">${user.bio || ''}</textarea>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <input type="text" name="work_place" value="${user.work_place || ''}" placeholder="Nơi làm việc" class="border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl p-3 focus:border-blue-500 outline-none">
                        <input type="text" name="education" value="${user.education || ''}" placeholder="Trường học" class="border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl p-3 focus:border-blue-500 outline-none">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <input type="text" name="location" value="${user.location || ''}" placeholder="Vị trí hiện tại" class="border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl p-3 focus:border-blue-500 outline-none">
                        <select name="gender" class="border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl p-3 focus:border-blue-500 outline-none">
                            <option value="Male" ${user.gender === 'Male' ? 'selected' : ''}>Nam</option>
                            <option value="Female" ${user.gender === 'Female' ? 'selected' : ''}>Nữ</option>
                            <option value="Other" ${user.gender === 'Other' || !user.gender ? 'selected' : ''}>Khác</option>
                        </select>
                        <input type="date" name="birthday" value="${user.birthday ? user.birthday.substring(0, 10) : ''}" class="border-2 border-slate-100 dark:border-slate-800 dark:bg-slate-900 rounded-2xl p-3 focus:border-blue-500 outline-none">
                    </div>
                </div>

                <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2rem]">
                    <h4 class="font-black text-slate-800 dark:text-white text-xs uppercase tracking-widest mb-4">Cài đặt hiển thị</h4>
                    <div class="grid grid-cols-2 gap-4">
                        ${[
                { id: 'work', label: 'Việc làm' },
                { id: 'school', label: 'Học vấn' },
                { id: 'location', label: 'Vị trí' },
                { id: 'birthday', label: 'Sinh nhật' }
            ].map(f => `
                            <label class="flex items-center gap-3 cursor-pointer group">
                                <div class="relative">
                                    <input type="checkbox" name="show_${f.id}" class="sr-only peer" ${privacy[`show_${f.id}`] !== false ? 'checked' : ''}>
                                    <div class="w-10 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-blue-500 transition shadow-inner"></div>
                                    <div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition shadow-md"></div>
                                </div>
                                <span class="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tighter">${f.label}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="space-y-2 hidden">
                    <input type="hidden" name="privacy_setting" value="${user.privacy_setting}">
                </div>

                <button type="submit" class="w-full bg-blue-600 text-white font-black py-4 rounded-[1.5rem] hover:bg-blue-700 transition shadow-xl uppercase text-xs tracking-[0.2em]">Lưu thay đổi</button>
            </form>`;

        openModal('Thiết lập hồ sơ', content);

        document.getElementById('editProfileForm').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);

            const updateData = {
                user_id: window.currentUser.userId,
                bio: formData.get('bio'),
                work_place: formData.get('work_place'),
                education: formData.get('education'),
                location: formData.get('location'),
                gender: formData.get('gender'),
                birthday: formData.get('birthday'),
                privacy_setting: parseInt(formData.get('privacy_setting')),
                user_info: {
                    show_work: e.target.show_work.checked,
                    show_school: e.target.show_school.checked,
                    show_location: e.target.show_location.checked,
                    show_birthday: e.target.show_birthday.checked
                }
            };

            const response = await apiFetch(`/users`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
            if (!response) return;

            const result = await response.json();
            if (result.success) {
                showToast('Cập nhật hồ sơ thành công!', 'success');
                closeModal();
                renderProfile(window.currentUser.userId);
            } else {
                showToast(result.message || 'Cập nhật thất bại', 'error');
            }
        };
    } catch (err) {
        console.error(err);
        showToast('Lỗi tải form', 'error');
    }
}

/**
 * @desc Xử lý Tải ảnh Avatar và Ảnh bìa
 */
export function triggerUpload(type) {
    let fileInput = document.getElementById('profileFileInput');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.id = 'profileFileInput';
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) return showToast('Ảnh không được vượt quá 5MB', 'error');

        const formData = new FormData();
        formData.append('image', file);
        formData.append('user_id', window.currentUser.userId);
        formData.append('type', type);

        try {
            showToast(`Đang tải ${type === 'avatar' ? 'ảnh đại diện' : 'ảnh bìa'}...`, 'info');
            const response = await apiFetch(`/users/upload-image`, {
                method: 'POST',
                body: formData
            });
            if (!response) return;

            const result = await response.json();
            if (result.success) {
                showToast('Cập nhật ảnh thành công!', 'success');
                if (type === 'avatar') {
                    // Update ngay lập tức trên UI
                    document.getElementById('userAvatar').src = getFullUrl(result.url);
                    window.currentUser.avatar = result.url;
                    localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
                } else {
                    document.getElementById('coverImg').src = getFullUrl(result.url);
                }
            } else { showToast(result.message, 'error'); }
        } catch (err) { showToast('Lỗi khi tải ảnh lên', 'error'); }
    };
    fileInput.click();
}

export async function showShareModal(id, type = 'profile') {
    const shareLink = type === 'profile' ? `${window.location.origin}/#profile/${id}` : `${window.location.origin}/#post/${id}`;

    // [NEW] Fetch thông tin đối tượng đang chia sẻ (User hoặc Post Author) để gắn vào card
    let shareMetadata = { name: 'Nội dung', avatar: '', type: type.toUpperCase() };

    try {
        if (type === 'profile') {
            const uRes = await apiFetch(`/users/${id}?viewer_id=${window.currentUser.userId}`);
            if (uRes) {
                const uData = await uRes.json();
                if (uData.success) {
                    shareMetadata.name = uData.user.full_name;
                    shareMetadata.avatar = uData.user.avatar || '';
                    shareMetadata.gender = uData.user.gender;
                }
            }
        } else if (type === 'post') {
            // Với post, ta cần lấy thông tin người đăng (hoặc ảnh của bài viết?)
            // Để đơn giản, ta lấy thông tin người đăng bài
            const pRes = await apiFetch(`/posts/${id}/check`);
            if (pRes) {
                const pData = await pRes.json();
                // Vì API check chỉ trả về ownerId, ta cần fetch user info của ownerId
                // Tuy nhiên, để tối ưu, nếu pData có thông tin owner thì tốt.
                // Nếu không, ta sẽ fetch user.
                if (pData.ownerId) {
                    const oRes = await apiFetch(`/users/${pData.ownerId}?viewer_id=${window.currentUser.userId}`);
                    if (oRes) {
                        const oData = await oRes.json();
                        if (oData.success) {
                            shareMetadata.name = `Bài viết của ${oData.user.full_name}`;
                            shareMetadata.avatar = oData.user.avatar || '';
                            shareMetadata.gender = oData.user.gender;
                        }
                    }
                }
            }
        }
    } catch (e) { console.error("Lỗi lấy metadata chia sẻ", e); }

    window.openModal('Chia sẻ đến...', `
        <div class="p-4 space-y-4">
            <div class="bg-slate-50 p-3 rounded-xl border border-dashed border-slate-200 text-[11px] font-mono break-all text-blue-600">
                🔗 ${shareLink}
            </div>

            <div class="relative">
                <input type="text" id="shareSearch" placeholder="Tìm bạn bè, nhóm, người lạ..." 
                       class="w-full p-3 bg-slate-100 rounded-xl outline-none text-sm pl-10">
                <span class="absolute left-3 top-3">🔍</span>
            </div>

            <div id="shareUserList" class="max-h-64 overflow-y-auto space-y-1 py-2 custom-scrollbar">
                <p class="text-center text-slate-400 text-xs py-10 animate-pulse">Đang tìm kiếm danh sách...</p>
            </div>

            <div class="flex gap-2 pt-2">
                <button onclick="closeModal()" class="flex-1 p-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition">Hủy</button>
                <button id="btnConfirmShare" disabled 
                        class="flex-1 p-3 bg-blue-600 text-white rounded-xl font-bold text-sm opacity-50 cursor-not-allowed transition">
                    Gửi ngay
                </button>
            </div>
        </div>
    `);

    try {
        const res = await apiFetch(`/users/share-targets?user_id=${window.currentUser.userId}`);
        if (!res) return;
        const data = await res.json();
        const userListContainer = document.getElementById('shareUserList');

        const renderList = (targets) => {
            if (targets.length === 0) {
                userListContainer.innerHTML = `<p class="text-center text-slate-400 text-xs py-10">Không tìm thấy kết quả</p>`;
                return;
            }

            // [FIX] Sử dụng getAvatarUrl để hiển thị avatar đúng
            userListContainer.innerHTML = targets.map(t => `
                <label class="flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl cursor-pointer transition group border border-transparent hover:border-slate-100">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm overflow-hidden">
                            ${t.type === 'group'
                    ? '👥'
                    : `<img src="${getAvatarUrl(t.avatar, t.gender || 'Other')}" class="w-full h-full object-cover">`
                }
                        </div>
                        <div>
                            <div class="font-bold text-sm text-slate-700">${t.name}</div>
                            <div class="text-[10px] uppercase tracking-tighter text-slate-400 font-bold">
                                ${t.type === 'group' ? 'Nhóm' : 'Cá nhân'}
                            </div>
                        </div>
                    </div>
                    <input type="checkbox" value="${t.id}" data-type="${t.type}" class="share-checkbox w-5 h-5 rounded-full border-slate-300 text-blue-600">
                </label>
            `).join('');

            // Xử lý logic nút Gửi
            const checkBoxes = document.querySelectorAll('.share-checkbox');
            const btnSubmit = document.getElementById('btnConfirmShare');

            checkBoxes.forEach(cb => cb.onchange = () => {
                const selectedCount = Array.from(checkBoxes).filter(c => c.checked).length;
                btnSubmit.disabled = selectedCount === 0;
                btnSubmit.classList.toggle('opacity-50', selectedCount === 0);
                btnSubmit.classList.toggle('cursor-not-allowed', selectedCount === 0);
                btnSubmit.innerText = selectedCount > 0 ? `Gửi (${selectedCount})` : 'Gửi ngay';
            });

            // Pass metadata vào processShareAction
            btnSubmit.onclick = () => processShareAction(shareLink, type, shareMetadata);
        };

        renderList(data.targets);

        // Tìm kiếm nhanh (Filter client-side)
        document.getElementById('shareSearch').oninput = (e) => {
            const keyword = e.target.value.toLowerCase();
            const filtered = data.targets.filter(t => t.name.toLowerCase().includes(keyword));
            renderList(filtered);
        };

    } catch (err) {
        showToast("Lỗi tải danh sách chia sẻ", "error");
    }
}

/**
 * @desc Logic gửi tin nhắn chia sẻ qua Socket
 */
export function processShareAction(link, type, metadata = {}) {
    const selected = Array.from(document.querySelectorAll('.share-checkbox:checked')).map(cb => ({
        id: cb.value,
        type: cb.getAttribute('data-type')
    }));

    if (selected.length === 0) return showToast('Vui lòng chọn người nhận!', 'info');

    // [New Format] [SHARE_CARD|TYPE|LINK|AVATAR|NAME]
    const safeAvatar = metadata.avatar || 'default';
    const safeName = metadata.name || 'Nội dung';
    const messageContent = `[SHARE_CARD|${type.toUpperCase()}|${link}|${safeAvatar}|${safeName}]`;

    selected.forEach(target => {
        if (io && io.connected) {
            io.emit('send_message', {
                senderId: window.currentUser.userId,
                receiverId: target.id,
                message: messageContent,
                isGroup: target.type === 'group'
            });
        }
    });

    closeModal();
    showToast(`Đã chia sẻ thành công`, 'success');
}

export async function showFriendsList(userId) {
    try {
        const res = await apiFetch(`/users/${userId}/friends-list`);
        if (!res) return;
        const data = await res.json();
        const content = `
            <div class="space-y-3 max-h-[450px] overflow-auto pr-2">
                ${data.friends?.length > 0 ? data.friends.map(f => `
                    <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl transition border border-transparent hover:border-blue-100 group">
                        <div class="flex items-center gap-4 cursor-pointer" onclick="window.switchView('profile', '${f.id}'); window.closeModal();">
                            <div class="w-12 h-12 rounded-full bg-slate-200 overflow-hidden border border-gray-200 flex-shrink-0">
                                <img src="${getAvatarUrl(f.avatar, f.gender)}" class="w-full h-full object-cover">
                            </div>
                            <div>
                                <div class="font-black text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition">${f.full_name}</div>
                                <div class="text-[9px] text-slate-400 font-bold uppercase tracking-widest">@${f.username}</div>
                            </div>
                        </div>
                        <button onclick="window.switchView('profile', '${f.id}'); window.closeModal();" class="px-4 py-2 bg-white dark:bg-slate-900 text-blue-600 font-black text-[9px] uppercase tracking-widest rounded-xl shadow-sm border border-blue-100 hover:bg-blue-600 hover:text-white transition-all active:scale-95">Xem Profile</button>
                    </div>
                `).join('') : '<div class="py-10 text-center text-slate-400 italic font-medium">Chưa có bạn bè để hiển thị.</div>'}
            </div>`;
        openModal('Bạn bè', content);
    } catch (err) { showToast('Lỗi tải bạn bè', 'error'); }
}

/**
 * --- HELPER RENDER FUNCTIONS ---
 */

function renderLockedView(user, relStatus, userId) {
    return `
        <div class="col-span-3 surface p-16 text-center rounded-[2.5rem] border-2 border-dashed border-slate-100 dark:border-slate-800">
            <div class="text-5xl mb-6">🔒</div>
            <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">${user.full_name} đã khóa trang cá nhân</h3>
            <p class="text-slate-500 text-sm max-w-xs mx-auto">Chỉ bạn bè của họ mới có thể xem các thông tin giới thiệu, danh sách bạn bè và bài viết trên dòng thời gian.</p>
            ${relStatus === 'not_friends' ? `
                <button onclick="window.ProfileModule.handleFriendshipAction('${userId}', 'request')" class="mt-6 px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-100">
                    ➕ Gửi lời mời kết bạn
                </button>
            ` : ''}
        </div>`;
}

function renderEmptyPosts() {
    return `<div class="surface p-20 text-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2.5rem] italic font-medium">Chưa có bài viết nào để hiển thị.</div>`;
}

function renderRelationshipButton(userId, status) {
    const btnClass = "px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition shadow-sm flex items-center gap-2";
    switch (status) {
        case 'request_sent': return `<button onclick="window.ProfileModule.handleFriendshipAction('${userId}', 'cancel')" class="${btnClass} bg-amber-50 text-amber-600 hover:bg-amber-100">⏳ Hủy yêu cầu</button>`;
        case 'request_received': return `<button onclick="window.ProfileModule.handleFriendshipAction('${userId}', 'accept')" class="${btnClass} bg-emerald-600 text-white hover:bg-emerald-700">✅ Chấp nhận</button>`;
        case 'friends': return `<button onclick="window.ProfileModule.handleFriendshipAction('${userId}', 'remove')" class="${btnClass} bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-red-50 hover:text-red-600">🤝 Bạn bè</button>`;
        default: return `<button onclick="window.ProfileModule.handleFriendshipAction('${userId}', 'request')" class="${btnClass} bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 tracking-wide">➕ Kết bạn</button>`;
    }
}

export async function handleFriendshipAction(targetId, action) {
    try {
        const res = await apiFetch(`/users/friendship`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender_id: window.currentUser.userId, receiver_id: targetId, action: action })
        });
        if (!res) return;
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            renderProfile(targetId);
            if (window.FriendRequestModule?.loadBadgeCount) window.FriendRequestModule.loadBadgeCount();
            if (action === 'request' || action === 'accept') {
                io.emit('new_notification', { receiverId: targetId, content: `${window.currentUser.name} ${action === 'request' ? 'đã gửi lời mời kết bạn' : 'đã chấp nhận lời mời kết bạn'}`, type: 'friend_request' });
            }
        }
    } catch (err) { showToast('Thao tác thất bại', 'error'); }
}

export function goToMessage(userId) {
    window.switchView('home');
    setTimeout(() => { if (window.ChatModule?.openChat) window.ChatModule.openChat(userId); }, 150);
}

export async function handleShareClick(link) {
    const hash = link.split('#')[1];
    if (!hash) return;

    const [type, id] = hash.split('/');

    if (type === 'profile') {
        window.switchView('profile', id);
    } else if (type === 'post') {
        try {
            const res = await apiFetch(`/posts/${id}/check`);
            if (!res) return;
            const data = await res.json();
            if (!data.exists) return showToast("Bài viết không còn tồn tại!", "error");

            if (data.groupId) {
                // Kiểm tra quyền Page/Group
                const memberRes = await apiFetch(`/groups/${data.groupId}/check-member?user_id=${window.currentUser.userId}`);
                if (!memberRes) return;
                const memberData = await memberRes.json();

                window.switchView(`group_detail_${data.groupId}`);
                if (memberData.isMember) {
                    setTimeout(() => {
                        const el = document.getElementById(`post-${id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 1200);
                } else {
                    showToast("Hãy tham gia nhóm để xem chi tiết bài đăng!", "info");
                }
            } else {
                // Bài đăng cá nhân -> Dùng logic Settings để cuộn
                window.SettingModule?.goToPost(data.ownerId, id);
            }
        } catch (e) { showToast("Lỗi kiểm tra quyền truy cập", "error"); }
    }
}

// Cấu hình Global Exports
window.ProfileModule = {
    renderProfile,
    goToMessage,
    handleFriendshipAction,
    showEditProfileModal,
    showShareModal,
    showFriendsList,
    triggerUpload,
    handleShareClick,
    copyLink: (link) => {
        navigator.clipboard.writeText(link).then(() => showToast('Đã sao chép link!', 'success'));
    }
};