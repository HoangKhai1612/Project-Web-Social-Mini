// TRONG frontend/js/modules/newsfeed.js

import { API_URL, showToast, getTimeAgo, showConfirmDialog, defaultConfig, io, getAvatarUrl, apiFetch } from '../main.js';

// Hàm helper để lấy cấu hình UI
const getConfig = () => window.elementSdk?.config || defaultConfig;

// Danh sách Reactions (Mã hóa: 1: Like, 2: Love, 3: Haha, ...)
const REACTIONS = [
    { type: 1, icon: '👍', name: 'Thích' },
    { type: 2, icon: '❤️', name: 'Yêu' },
    { type: 3, icon: '😂', name: 'Haha' },
    { type: 4, icon: '😮', name: 'Wow' },
    { type: 5, icon: '😢', name: 'Buồn' },
    { type: 6, icon: '😡', name: 'Giận' }
];

/** 
 * @desc Parse content for hashtags (#tag) and tagging (@user)
 */
function parseContent(text) {
    if (!text) return "";
    // Xử lý Hashtags: #hashtag -> Click để tìm kiếm
    let parsed = text.replace(/#(\w+)/g, (match, tag) => {
        return `<span class="text-blue-600 font-bold cursor-pointer hover:underline" onclick="event.stopPropagation(); window.NewsfeedModule.handleHashtagClick('${tag}')">#${tag}</span>`;
    });
    // Xử lý Tagging: @User -> Click để tìm kiếm người dùng đó
    parsed = parsed.replace(/@(\w+)/g, (match, name) => {
        return `<span class="text-indigo-600 font-black cursor-pointer hover:underline" onclick="event.stopPropagation(); window.NewsfeedModule.handleTagClick('${name}')">@${name}</span>`;
    });
    return parsed;
}

export function handleHashtagClick(tag) {
    // Chuyển sang view tìm kiếm với query là hashtag
    window.switchView('search');
    setTimeout(() => {
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) {
            searchInput.value = '#' + tag;
            // Kích hoạt tìm kiếm
            const event = new Event('input', { bubbles: true });
            searchInput.dispatchEvent(event);
        }
    }, 500);
}

export function handleTagClick(name) {
    // Chuyển sang view tìm kiếm để tìm người dùng này
    window.switchView('search');
    setTimeout(() => {
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) {
            searchInput.value = name;
            const event = new Event('input', { bubbles: true });
            searchInput.dispatchEvent(event);
        }
    }, 500);
}

/* ============================================================
    HÀM HỖ TRỢ
============================================================ */

/** Hiển thị ảnh/video trong modal tạo bài đăng */
export function previewMedia(input, type) {
    const file = input.files[0];
    const btn = document.getElementById('postButton');
    const mediaPreview = document.getElementById('mediaPreview');
    mediaPreview.innerHTML = '';

    if (!file) {
        // Kiểm tra xem nội dung đã có chưa, nếu chưa thì tắt nút Đăng
        const content = document.getElementById('postContent')?.value.trim();
        if (!content) {
            btn.disabled = true;
            btn.classList.add('opacity-50');
        }
        return;
    }

    // Giới hạn video 50MB
    if (type === 'video' && file.size > 50 * 1024 * 1024) {
        showToast('Video không được vượt quá 50MB', 'error');
        input.value = '';
        btn.disabled = true;
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        mediaPreview.innerHTML = type === 'image'
            ? `<img src="${e.target.result}" class="w-full rounded-lg post-image">`
            : `<video src="${e.target.result}" controls class="w-full rounded-lg"></video>`;

        btn.disabled = false;
        btn.classList.remove('opacity-50');
    };
    reader.readAsDataURL(file);
}

/** Mock thông tin user — Tạm thời dùng khi backend chưa trả user */
function getUserDataMock() {
    return {
        findUser: (userId) => {
            if (window.currentUser && String(userId) === String(window.currentUser.userId)) {
                return {
                    user_id: userId,
                    full_name: window.currentUser.name,
                    avatar: window.currentUser.avatar
                };
            }
            return { user_id: userId, full_name: 'User ' + userId, avatar: 'default.png' };
        }
    };
}


/* ============================================================
    RENDER BÀI ĐĂNG
============================================================ */

/** Hàm helper để render media dựa trên URL (FIXED) */
function renderMedia(url) {
    if (!url) return '';

    /**
     * Kiểm tra URL: 
     * 1. Nếu bắt đầu bằng 'http', dùng luôn (link tuyệt đối).
     * 2. Nếu bắt đầu bằng 'uploads/', ghép nối với Domain Backend (link tương đối).
     */
    const backendDomain = API_URL.replace('/api', ''); // Lấy link gốc http://localhost:3000
    const fullUrl = url.startsWith('http') ? url : `${backendDomain}/${url.replace(/^\//, '')}`;

    if (fullUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i))
        return `<img src="${fullUrl}" class="post-image w-full rounded-lg mb-3" alt="Post image" loading="lazy" onerror="this.style.display='none'">`;

    if (fullUrl.match(/\.(mp4|mov|avi|webm)$/i))
        return `<video src="${fullUrl}" controls class="w-full rounded-lg mb-3"></video>`;

    return '';
}

/** Hàm render một bài đăng cụ thể (MODIFIED: Hỗ trợ hiển thị Group Name và Phân quyền xóa) */
export function renderPost(post) {
    const config = getConfig();
    const isMyPost = String(post.user_id) === String(window.currentUser.userId);
    const timeAgo = getTimeAgo(post.created_at);

    // Logic phân quyền Admin Group
    const isAdmin = window.currentGroupMembershipStatus === 'creator' || window.currentGroupMembershipStatus === 'admin';

    const userReaction = REACTIONS.find(r => String(r.type) === String(post.user_reaction_type)) || { icon: '👍', name: 'Thích' };
    const visibilityIcon = post.visibility === 1 ? '🔒' : '🌍';
    const safeName = (post.full_name || '').replace(/"/g, '&quot;');

    return `
        <div id="post-${post.id}" class="surface rounded-lg shadow mb-4 p-4 border border-base relative bg-white dark:bg-slate-800 dark:border-slate-700 transition-colors duration-300">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3 cursor-pointer" onclick="window.switchView('profile', '${post.user_id}')">
                    ${getAvatarWithStatusHtml(post.user_id, post.avatar, post.gender, 'w-10 h-10')}
                    <div>
                        <div class="font-semibold text-content flex items-center gap-1 dark:text-gray-100">
                            ${post.group_id ? post.group_name : post.full_name}
                            ${isMyPost ? `<span class="text-xs" title="Chế độ hiển thị">${visibilityIcon}</span>` : ''}
                        </div>
                        <div class="text-sm text-secondary dark:text-gray-400">${post.group_id ? `Đăng bởi ${post.full_name} · ` : ''}${timeAgo}</div>
                    </div>
                </div>

                <div class="relative post-settings-container">
                    <button onclick="window.NewsfeedModule.togglePostMenu('${post.id}')" class="p-1 hover:bg-gray-200 rounded-full transition">
                        <span class="text-xl font-bold px-2 text-secondary">...</span>
                    </button>
                    <div id="postMenu-${post.id}" class="hidden absolute right-0 mt-2 w-56 surface shadow-xl rounded-xl border border-base z-50 py-2 animate-fade-in">
                        ${renderMenuItems(post, isMyPost, isAdmin)}
                    </div>
                </div>
            </div>

            <div class="text-content mb-3">${parseContent(post.content)}</div>
            ${renderMedia(post.media_url)}

            <div class="flex items-center justify-between py-2 border-t border-b border-base mb-3">
                <div class="text-sm text-secondary">${post.total_reactions || 0} phản ứng</div>
                <div class="text-sm text-secondary">${post.comment_count || 0} bình luận</div>
            </div>

            <div class="flex items-center gap-2">
                <div class="flex-1 relative reaction-container" onmouseenter="window.NewsfeedModule.showReactionPopup('${post.id}', event)" onmouseleave="window.NewsfeedModule.hideReactionPopup('${post.id}')">
                    <button onclick="window.NewsfeedModule.setReaction('${post.id}', 1)"
                            class="w-full p-2 rounded hover:bg-gray-100 flex items-center justify-center gap-1 text-secondary">
                        ${userReaction.icon} ${userReaction.name}
                    </button>
                    <div id="reactionPopup-${post.id}" 
                         onmouseenter="window.NewsfeedModule.showReactionPopup('${post.id}', event)"
                         onmouseleave="window.NewsfeedModule.hideReactionPopup('${post.id}')"
                         class="reaction-popup surface hidden absolute bottom-full left-0 mb-2 p-2 shadow-xl rounded-full flex gap-2 z-50 animate-scale-in bg-white dark:bg-slate-800 border dark:border-slate-700">
                        ${REACTIONS.map(r => `
                            <span class="reaction-icon cursor-pointer hover:scale-125 transition-transform text-2xl w-8 h-8 flex items-center justify-center" 
                                  onclick="window.NewsfeedModule.setReaction('${post.id}', ${r.type})">${r.icon}</span>
                        `).join('')}
                    </div>
                </div>
                <button onclick="window.NewsfeedModule.showComments('${post.id}')" class="flex-1 p-2 rounded hover:bg-gray-100 text-secondary">💬 Bình luận</button>
                <button onclick="window.NewsfeedModule.showShareModal('${post.id}', 'post', this.getAttribute('data-avatar'), this.getAttribute('data-name'))" 
                        data-avatar="${post.avatar || ''}" 
                        data-name="${safeName}"
                        class="flex-1 p-2 rounded hover:bg-gray-100 text-secondary">🔄 Chia sẻ</button>
            </div>
        </div>
    `;
}

function renderMenuItems(post, isMyPost, isAdmin) {
    if (isMyPost) {
        // Menu cho chính chủ
        return `
            <button onclick="window.NewsfeedModule.editPost('${post.id}')" class="...">✏️ Sửa bài viết</button>
            <button onclick="window.NewsfeedModule.toggleVisibility('${post.id}')" class="...">
                ${post.visibility === 1 ? '🌍 Chuyển sang Công khai' : '🔒 Chuyển sang Chỉ mình tôi'}
            </button>
            <hr class="...">
            <button onclick="window.NewsfeedModule.deletePost('${post.id}')" class="text-red-500 ...">🗑️ Xóa bài viết</button>
        `;
    } else {
        // Menu cho người xem
        // Kiểm tra quyền Admin/Creator Group
        const canDelete = isAdmin || (post.viewer_group_role === 'admin' || post.viewer_group_role === 'creator');

        return `
            <button onclick="window.NewsfeedModule.togglePersonalHide('${post.id}', ${post.is_hidden_by_me})">
                ${post.is_hidden_by_me ? '👁️ Mở ẩn bài viết này' : '🚫 Ẩn bài viết này'}
            </button>
            <button onclick="window.NewsfeedModule.toggleFavorite('${post.id}', ${post.is_favorite})">
                ${post.is_favorite ? '💔 Hủy yêu cầu yêu thích' : '⭐ Thêm vào yêu thích'}
            </button>
            <button onclick="window.openReportModal('post', '${post.id}')">🚩 Báo cáo</button>
            ${canDelete ? `<hr class="..."><button onclick="window.NewsfeedModule.deletePost('${post.id}')" class="text-red-500 ...">🗑️ Xóa bài viết (Admin)</button>` : ''}
        `;
    }
}

/* ============================================================
    LOGIC TƯƠNG TÁC MENU (API CALLS)
============================================================ */

export function togglePostMenu(postId) {
    const menu = document.getElementById(`postMenu-${postId}`);
    document.querySelectorAll('[id^="postMenu-"]').forEach(m => {
        if (m.id !== `postMenu-${postId}`) m.classList.add('hidden');
    });
    menu.classList.toggle('hidden');
}

export async function toggleVisibility(postId) {
    try {
        const res = await apiFetch(`/posts/${postId}/visibility`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId })
        });
        if (res && res.ok) {
            showToast('Đã cập nhật trạng thái hiển thị', 'success');
            loadPosts(window.currentUser.userId, 'postsFeed');
        }
    } catch (err) { showToast('Lỗi khi cập nhật', 'error'); }
}

export async function hidePostForMe(postId) {
    if (!confirm('Bạn sẽ không thấy bài viết này nữa?')) return;

    try {
        const res = await apiFetch(`/posts/${postId}/hide`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId })
        });
        if (!res) return;
        const data = await res.json();

        if (data.success) {
            showToast(data.message, 'success');
            // Xóa phần tử HTML của bài viết đó đi
            const postEl = document.getElementById(`post-${postId}`);
            if (postEl) postEl.remove();
        }
    } catch (err) {
        showToast('Lỗi khi ẩn bài viết', 'error');
    }
}

export async function toggleFavorite(postId, currentStatus) {
    try {
        const res = await apiFetch(`/posts/${postId}/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId })
        });
        if (!res) return;
        const data = await res.json();

        if (data.success) {
            showToast(data.message, 'success');

            // QUAN TRỌNG: Tải lại danh sách bài viết để cập nhật trạng thái hiển thị của nút Menu
            // Nếu bạn đang ở Newsfeed hoặc Profile, hãy gọi hàm load tương ứng
            if (window.currentView === 'home') {
                window.NewsfeedModule.loadPosts(window.currentUser.userId, 'postsFeed');
            } else if (window.currentView.startsWith('profile')) {
                const profileUserId = window.currentView.split('_')[1];
                window.NewsfeedModule.loadPosts(profileUserId, 'profilePostsContainer');
            }
        }
    } catch (err) {
        showToast('Lỗi khi thực hiện thao tác', 'error');
    }
}


export async function togglePersonalHide(postId) {
    if (!confirm('Bạn có muốn thực hiện thao tác ẩn/hiện bài viết này không?')) return;

    try {
        const res = await apiFetch(`/posts/${postId}/hide`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId })
        });
        if (!res) return;
        const data = await res.json();

        if (data.success) {
            showToast(data.message, 'success');
            // Nếu là hành động "Ẩn" (thành công), xóa bài viết khỏi giao diện ngay lập tức
            if (data.action === 'hidden') {
                const postEl = document.getElementById(`post-${postId}`);
                if (postEl) postEl.remove();
            } else {
                // Nếu là "Mở ẩn", tải lại trang để hiện lại (hoặc render lại feed)
                window.NewsfeedModule.loadPosts(window.currentUser.userId, 'postsFeed');
            }
        }
    } catch (err) {
        showToast('Lỗi khi thực hiện thao tác ẩn', 'error');
    }
}

export async function editPost(postId) {
    // Logic đơn giản: Hiện prompt để sửa nội dung (Bạn có thể làm modal xịn hơn sau)
    const newContent = prompt("Nhập nội dung mới cho bài viết:");
    if (!newContent) return;

    try {
        const res = await apiFetch(`/posts/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.currentUser.userId,
                content: newContent
            })
        });
        if (!res) return;
        const data = await res.json();
        if (data.success) {
            showToast('Đã cập nhật bài viết', 'success');
            loadPosts(window.currentUser.userId, 'postsFeed'); // Tải lại danh sách
        }
    } catch (err) {
        showToast('Lỗi khi sửa bài viết', 'error');
    }
}


export function showReportModal(postId) {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="p-5 surface rounded-xl shadow-lg">
            <h3 class="text-lg font-bold mb-4">Báo cáo vi phạm</h3>
            <select id="reportReason" class="w-full p-3 border rounded-lg mb-4 border-base text-content">
                <option value="spam">Nội dung rác (Spam)</option>
                <option value="harassment">Quấy rối/Xúc phạm</option>
                <option value="hate_speech">Ngôn từ thù ghét</option>
                <option value="fake_news">Thông tin sai sự thật</option>
            </select>
            <textarea id="reportDetail" class="w-full p-3 border rounded-lg border-base text-content mb-4" placeholder="Mô tả thêm chi tiết..."></textarea>
            <div class="flex gap-2">
                <button onclick="window.closeModal()" class="flex-1 p-3 bg-gray-100 rounded-lg">Hủy</button>
                <button onclick="window.NewsfeedModule.submitReport('${postId}')" class="flex-1 p-3 bg-red-500 text-white rounded-lg">Gửi báo cáo</button>
            </div>
        </div>
    `;
    window.openModal();
}

export async function submitReport(postId) {
    const reason = document.getElementById('reportReason').value;
    const detail = document.getElementById('reportDetail').value;
    try {
        const res = await apiFetch(`/posts/${postId}/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId, reason, detail })
        });
        if (res && res.ok) {
            showToast('Cảm ơn bạn! Báo cáo đã được gửi tới Admin.', 'success');
            window.closeModal();
        }
    } catch (err) { showToast('Lỗi gửi báo cáo', 'error'); }
}

/* ============================================================
    GIAO DIỆN HOME
============================================================ */

/** Hàm render giao diện trang chủ/newsfeed chính */
export function renderHome(targetUserId = null, containerElement = null) {
    const mainContent = containerElement || document.getElementById('mainContent');
    if (!mainContent) return;

    const containerId = containerElement ? containerElement.id : 'postsFeed';

    // Logic chỉ tải Posts và return nếu là Profile view (containerElement là DOM object)
    if (containerElement) {
        loadPosts(targetUserId, containerId);
        return;
    }

    // --- Logic render Home Shell (Trang chủ mặc định) ---
    const config = getConfig();

    mainContent.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <div class="surface rounded-2xl shadow-sm p-4 mb-4 border border-base bg-white">
                <div class="flex items-center gap-4">
                    <!-- Khu vực Avatar và Tên (Dọc) -->
                    <div class="flex flex-col items-center gap-1.5 min-w-[64px]">
                        <div id="currentUserAvatar" class="cursor-pointer hover:opacity-80 transition" onclick="window.switchView('profile', window.currentUser.userId)">
                            ${getAvatarWithStatusHtml(window.currentUser.userId, window.currentUser.avatar, window.currentUser.gender, 'w-12 h-12')}
                        </div>
                        <div class="text-[11px] font-bold text-slate-600 truncate max-w-[70px]" title="${window.currentUser.name}">
                            ${window.currentUser.name.split(' ').pop()}
                        </div>
                    </div>

                    <!-- Ô nhập liệu -->
                    <button onclick="window.NewsfeedModule.showCreatePostModal()"
                            class="flex-1 h-12 px-5 bg-slate-100 rounded-full text-left text-slate-500 hover:bg-slate-200 focus:outline-none transition-all duration-200 font-medium border border-transparent hover:border-slate-300">
                        Bạn đang nghĩ gì, ${window.currentUser.name.split(' ').pop()}?
                    </button>
                </div>
            </div>

            <div id="postsFeed">
                <div class="p-8 text-center text-secondary">Đang tải bài viết...</div>
            </div>
        </div>
    `;

    // Tải Feed chính (cho người dùng hiện tại)
    loadPosts(window.currentUser.userId, 'postsFeed');
}


/* ============================================================
    MODAL: TẠO BÀI ĐĂNG
============================================================ */

/** Hiển thị modal tạo bài đăng (MODIFIED: Thêm groupId) */
export function showCreatePostModal(groupId = null) {
    const config = getConfig();
    const { textColor, primaryAction, fontSize } = config;

    const modal = document.getElementById('appModal');
    const modalBody = document.getElementById('modalBody');
    if (!modal || !modalBody) return;

    // [NEW] Lưu Group ID vào DOM hoặc biến global để hàm createPost dùng
    window.tempPostGroupId = groupId;

    const modalTitle = groupId ? 'Đăng bài trong Group' : 'Tạo bài đăng';

    modalBody.innerHTML = `
        <div class="post-modal-content w-full">

            <div class="p-4 border-b border-base flex justify-between items-center">
                <h3 class="font-bold text-content text-lg" style="color:${textColor};">${modalTitle}</h3>
                <button onclick="window.closeModal()" class="text-2xl text-content">✕</button>
            </div>
            
            <div class="p-4 max-h-[70vh] overflow-y-auto">
                <div class="flex items-center gap-2 mb-4">
                    ${getAvatarWithStatusHtml(window.currentUser.userId, window.currentUser.avatar, window.currentUser.gender, 'w-8 h-8')}
                    <div class="font-semibold text-content text-sm" style="color:${textColor};">${window.currentUser.name}</div>
                </div>

                <textarea id="postContent" placeholder="Bạn đang nghĩ gì?"
                    class="w-full p-3 border rounded-lg mb-3 border-base text-content"
                    style="font-size:${fontSize}px;" rows="4"></textarea>

                <div id="mediaPreview" class="mb-3"></div>

                <div class="flex gap-2 mb-4">
                    <button onclick="document.getElementById('imageInput').click()" class="flex-1 p-2 border rounded-lg border-base">🖼️ Ảnh</button>
                    <button onclick="document.getElementById('videoInput').click()" class="flex-1 p-2 border rounded-lg border-base">🎥 Video</button>
                </div>

                <input type="file" id="imageInput" accept="image/*" class="hidden" onchange="window.NewsfeedModule.previewMedia(this, 'image')">
                <input type="file" id="videoInput" accept="video/*" class="hidden" onchange="window.NewsfeedModule.previewMedia(this, 'video')">

                <button id="postButton" onclick="window.NewsfeedModule.createPost()" disabled
                    class="btn-primary w-full p-3 text-white rounded-lg opacity-50"
                    style="background:${primaryAction}; font-size:${fontSize}px;">
                    Đăng
                </button>
            </div>
        </div>
    `;

    const textarea = document.getElementById('postContent');
    const imageInput = document.getElementById('imageInput');
    const videoInput = document.getElementById('videoInput');
    const btn = document.getElementById('postButton');

    function checkValidity() {
        const content = textarea.value.trim();
        const hasMedia = imageInput.files.length > 0 || videoInput.files.length > 0;

        if (content || hasMedia) {
            btn.disabled = false;
            btn.classList.remove('opacity-50');
        } else {
            btn.disabled = true;
            btn.classList.add('opacity-50');
        }
    }

    textarea.addEventListener('input', checkValidity);
    imageInput.addEventListener('change', checkValidity);
    videoInput.addEventListener('change', checkValidity);

    modal.classList.remove('hidden');
}


/* ============================================================
    COMMENTS (TÍNH NĂNG MỚI)
============================================================ */

/** Render một bình luận đơn lẻ, bao gồm cả Reply */
function renderComment(comment, level = 0) {
    const authorName = comment.full_name || 'Người dùng';
    const authorAvatar = comment.avatar;
    const timeAgo = getTimeAgo(comment.created_at || comment.timestamp);

    const paddingLeft = level * 10;

    // Parse JSON reactions
    let reactionsHtml = '';
    let myReaction = '';

    try {
        const reactionsObj = typeof comment.reactions === 'string' ? JSON.parse(comment.reactions) : (comment.reactions || {});
        const emojiEntries = Object.entries(reactionsObj);

        if (emojiEntries.length > 0) {
            // Find my reaction
            for (const [emoji, users] of emojiEntries) {
                if (users.some(u => String(u) === String(window.currentUser.userId))) {
                    myReaction = emoji;
                    break;
                }
            }

            // Render counts and icons (Style like Image 0)
            const totalCount = emojiEntries.reduce((acc, [_, users]) => acc + users.length, 0);
            reactionsHtml = `
                <div class="absolute -bottom-2.5 -right-3 flex items-center bg-white dark:bg-slate-800 shadow-md border dark:border-slate-700 rounded-full py-0.5 px-1.5 z-20 transition-all hover:scale-110 cursor-pointer" 
                     onclick="event.stopPropagation(); window.NewsfeedModule.showCommentReactionDetails('${comment.id}')">
                    <div class="flex -space-x-1.5">
                        ${emojiEntries.slice(0, 3).map(([emoji]) => `
                            <span class="text-[16px] filter drop-shadow-sm leading-none flex items-center justify-center">${emoji}</span>
                        `).join('')}
                    </div>
                    ${totalCount > 1 ? `<span class="text-[11px] font-extrabold text-blue-600 dark:text-blue-400 ml-1.5 pr-0.5">${totalCount}</span>` : ''}
                </div>
            `;
        }
    } catch (e) { console.error("Error parsing comment reactions", e); }


    // Decide button label and color
    let reactionLabel = 'Thích';
    let btnClass = 'text-secondary font-semibold hover:text-blue-500';

    if (myReaction) {
        reactionLabel = myReaction;
        // Map color based on emoji type
        if (myReaction === '👍') btnClass = 'text-blue-500 font-bold';
        else if (myReaction === '❤️') btnClass = 'text-red-500 font-bold';
        else if (['😂', '😮', '😢', '🔥'].includes(myReaction)) btnClass = 'text-yellow-600 font-bold';
        else btnClass = 'text-blue-500 font-bold';
    }

    return `
        <div class="flex gap-2 mb-3 ${level > 0 ? 'ml-6' : ''}" style="padding-left: ${level > 0 ? (level - 1) * 10 : 0}px;">
            ${getAvatarWithStatusHtml(comment.user_id, authorAvatar, comment.gender, 'w-8 h-8')}
            
            <div class="flex-1 group">
                <div class="surface p-2 px-3 rounded-2xl relative inline-block max-w-[90%] shadow-sm" style="background-color: var(--bg-comment, #f0f2f5);">
                    <div class="font-bold text-xs cursor-pointer hover:underline mb-0.5 text-slate-800 dark:text-slate-200" onclick="window.switchView('profile', '${comment.user_id}')">
                        ${authorName}
                    </div>
                    <div class="text-content text-[13.5px] leading-snug whitespace-pre-wrap text-slate-700 dark:text-slate-300">${parseContent(comment.content)}</div>
                    ${getLinkPreview(comment.content)}
                    ${reactionsHtml}
                </div>

                <div class="flex items-center gap-3 mt-0.5 text-[11.5px] text-secondary ml-3">
                    <div class="relative group/reaction" 
                         onmouseenter="window.NewsfeedModule.showCommentReactions('${comment.id}', '${comment.post_id}', event, '${myReaction}')"
                         onmouseleave="window.NewsfeedModule.hideCommentReactions('${comment.id}')">
                         
                        <span class="hover:underline cursor-pointer transition-colors ${btnClass}" 
                               onclick="window.NewsfeedModule.showCommentReactions('${comment.id}', '${comment.post_id}', event, '${myReaction}')"> 
                            ${reactionLabel}
                        </span>
                    </div>

                    <button onclick="window.NewsfeedModule.showReplyForm('${comment.post_id}', '${comment.id}', '${authorName}')" class="hover:underline font-semibold text-secondary">
                        Trả lời
                    </button>
                    <span class="opacity-70">${timeAgo}</span>
                </div>
                
                <div id="replies-${comment.id}" class="mt-2 space-y-1">
                    ${comment.replies && comment.replies.length > 0
            ? comment.replies.map(reply => renderComment(reply, level + 1)).join('')
            : ''}
                </div>
            </div>
        </div>
    `;
}

/** TẠO PREVIEW LINK */
function getLinkPreview(content) {
    if (!content) return '';
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = content.match(urlRegex);
    if (!match) return '';

    const url = match[0];
    let domain = '';
    try { domain = new URL(url).hostname; } catch (e) { }

    return `
        <a href="${url}" target="_blank" onclick="event.stopPropagation()" class="block mt-2 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden group/card hover:shadow-md transition bg-white dark:bg-slate-800 max-w-sm">
            <div class="h-24 bg-slate-100 dark:bg-slate-700 flex items-center justify-center relative overflow-hidden">
                <img src="https://www.google.com/s2/favicons?sz=64&domain=${domain}" class="w-8 h-8 opacity-50" onerror="this.style.display='none'"/>
                <span class="ml-2 text-slate-500 font-bold text-sm uppercase tracking-widest z-10">${domain}</span>
            </div>
            <div class="p-2">
                <div class="text-[10px] text-slate-500 uppercase font-bold mb-0.5">${domain}</div>
                <div class="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">${url}</div>
            </div>
        </a>
    `;
}

/** [NEW] Tải danh sách comments từ API */
export async function loadComments(postId) {
    const container = document.getElementById('commentListContainer');
    if (!container) return;

    container.innerHTML = '<div class="text-center text-secondary">Đang tải bình luận...</div>';

    try {
        const res = await apiFetch(`/posts/${postId}/comments`);
        if (!res) return;
        if (!res.ok) throw new Error(`Lỗi HTTP ${res.status}`);

        const comments = await res.json();

        if (comments.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-secondary">Chưa có bình luận nào. Hãy là người đầu tiên!</div>';
        } else {
            // Hiển thị 30 bình luận đầu tiên (theo yêu cầu)
            const limitedComments = comments.slice(0, 30);
            container.innerHTML = limitedComments.map(c => renderComment(c, 0)).join('');

            if (comments.length > 30) {
                // Thêm nút "Xem thêm" nếu có nhiều hơn 30 bình luận
                container.innerHTML += `<div class="text-center mt-3">
                     <button class="text-link text-sm" onclick="window.NewsfeedModule.loadMoreComments('${postId}', 30)">Xem thêm ${comments.length - 30} bình luận</button>
                 </div>`;
            }
        }
    } catch (err) {
        container.innerHTML = `<div class="p-4 text-center text-red-500">Lỗi tải bình luận: ${err.message}</div>`;
    }
}

/** Mở modal bình luận (Bổ sung khung Modal) */
export function showComments(postId) {
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;

    window.activeCommentPostId = postId; // [NEW] Lưu Post ID để reload khi react

    // Khung Modal Comments
    modalBody.innerHTML = `
        <div class="comment-modal-content w-full max-w-xl mx-auto surface rounded-lg shadow-xl">
            <div class="p-4 border-b border-base flex justify-between items-center">
                <h3 class="font-bold text-content text-lg">💬 Bình luận</h3>
                <button onclick="window.closeModal()" class="text-2xl text-content">✕</button>
            </div>
            
            <div id="commentListContainer" class="max-h-[60vh] overflow-y-auto p-4 space-y-3">
                <div class="text-center text-secondary">Đang tải bình luận...</div>
            </div>
            
            <div class="p-4 border-t border-base">
                <div class="flex gap-2">
                    <input type="text" id="newCommentInput" placeholder="Viết bình luận..." 
                           class="flex-1 p-2 border rounded-full border-base text-content">
                    <button id="commentSubmitBtn" onclick="window.NewsfeedModule.addComment('${postId}', null)" 
                            class="px-4 py-2 rounded-full text-white bg-blue-500">Gửi</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('appModal')?.classList.remove('hidden');

    // Gắn sự kiện Enter cho input
    const inputElement = document.getElementById('newCommentInput');
    inputElement?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('commentSubmitBtn').click();
        }
    });

    loadComments(postId);
}

/** [NEW] Hàm gửi comment (hoặc Reply) */
export async function addComment(postId, parentId = null) {
    const inputElement = document.getElementById('newCommentInput');
    const content = inputElement.value;
    if (!content.trim()) return;

    try {
        const res = await apiFetch(`/posts/${postId}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.currentUser.userId,
                content: content,
                parent_id: parentId // Null nếu là comment gốc
            })
        });

        if (!res || !res.ok) throw new Error('Thêm bình luận thất bại');

        // Reset input và tải lại comments
        inputElement.value = '';
        inputElement.placeholder = "Viết bình luận...";

        // Cần reset lại nút submit nếu nó đang ở chế độ Reply
        const submitBtn = document.getElementById('commentSubmitBtn');
        submitBtn.onclick = () => window.NewsfeedModule.addComment(postId, null);

        loadComments(postId);
        loadPosts(window.currentUser.userId, 'postsFeed'); // Cập nhật số lượng comment trên feed

    } catch (err) {
        showToast(`Lỗi: ${err.message}`, 'error');
    }
}

/** [NEW] Hiển thị form Reply */
export function showReplyForm(postId, parentId, parentName) {
    const inputElement = document.getElementById('newCommentInput');
    const submitBtn = document.getElementById('commentSubmitBtn');

    inputElement.placeholder = `Trả lời ${parentName}...`;
    inputElement.focus();

    // Thay đổi hàm onclick của nút Gửi để nó gửi kèm parentId
    submitBtn.onclick = () => window.NewsfeedModule.addComment(postId, parentId);
}

const commentReactionTimeouts = {};

/** [NEW] Hiển thị Picker Reaction cho Comment */
export function showCommentReactions(commentId, postId, event, currentReaction) {
    // Clear timeout ẩn nếu có (để giữ popup khi hover lại)
    if (commentReactionTimeouts[commentId]) {
        clearTimeout(commentReactionTimeouts[commentId]);
        delete commentReactionTimeouts[commentId];
    }

    // Check if valid popup already exists for this comment
    const existing = document.getElementById(`commentReaction-${commentId}`);
    if (existing) {
        existing.classList.remove('hidden');
        return;
    }

    // Remove other popups
    document.querySelectorAll('.reaction-picker-popup').forEach(el => el.remove());

    const emojis = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
    const picker = document.createElement('div');
    picker.id = `commentReaction-${commentId}`;
    picker.className = 'reaction-picker-popup fixed z-[9999] bg-white dark:bg-slate-800 shadow-xl border dark:border-slate-700 rounded-full flex gap-2 p-2 animate-scale-in';

    // Thêm event handlers cho chính popup để giữ nó hiển thị khi hover vào
    picker.onmouseenter = () => {
        if (commentReactionTimeouts[commentId]) {
            clearTimeout(commentReactionTimeouts[commentId]);
        }
    };
    picker.onmouseleave = () => {
        hideCommentReactions(commentId);
    };

    picker.innerHTML = emojis.map(e => `
        <span onclick="window.NewsfeedModule.setCommentReaction('${commentId}', '${postId}', '${e}', this)" 
              class="cursor-pointer hover:scale-125 transition-transform text-xl w-8 h-8 flex items-center justify-center rounded-full ${e === currentReaction ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500' : ''}">
            ${e}
        </span>
    `).join('');

    // Positioning
    const btn = event.currentTarget || event.target;
    // Tìm container cha (div.flex.items-center...) để định vị chính xác
    const container = btn.closest('.flex.items-center');

    // Fallback nếu không tìm thấy container (dù rất khó xảy ra)
    const rect = container ? container.getBoundingClientRect() : btn.getBoundingClientRect();

    document.body.appendChild(picker);

    // Position slightly above the "Thích" button line
    const top = rect.top - 50;
    const left = rect.left + 20;

    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;
}

export function hideCommentReactions(commentId) {
    commentReactionTimeouts[commentId] = setTimeout(() => {
        const picker = document.getElementById(`commentReaction-${commentId}`);
        if (picker) {
            picker.remove(); // Xóa DOM luôn để tránh rác
        }
    }, 400); // 400ms delay
}


export async function setCommentReaction(commentId, postId, emoji, el) {
    // [IMPROVED] Close picker immediately for better UX
    document.querySelectorAll('.reaction-picker-popup').forEach(p => p.remove());

    try {
        const payload = {
            commentId: Number(commentId),
            emoji: emoji
        };

        const res = await apiFetch(`/posts/comment/react`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!res) throw new Error("Không có phản hồi từ máy chủ");
        const data = await res.json();

        if (data.success) {
            // Reload Comments để cập nhật UI
            const targetPostId = postId || window.activeCommentPostId;
            if (targetPostId) {
                await loadComments(targetPostId);
            } else {
                console.warn("Missing targetPostId for reload");
            }
        } else {
            showToast(data.message || "Không thể thả cảm xúc", "error");
        }
    } catch (err) {
        console.error("Lỗi setCommentReaction:", err);
        showToast("Lỗi hệ thống khi thả cảm xúc", "error");
    }
}


export async function showShareModal(id, type = 'post', avatar = '', name = '') {
    const shareLink = type === 'post' ? `${window.location.origin}/#post/${id}` : `${window.location.origin}/#profile/${id}`;

    // Lưu metadata để dùng khi gửi
    const shareMetadata = { avatar, name };

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
        const data = await res.json();
        const userListContainer = document.getElementById('shareUserList');

        const renderList = (targets) => {
            if (targets.length === 0) {
                userListContainer.innerHTML = `<p class="text-center text-slate-400 text-xs py-10">Không tìm thấy kết quả</p>`;
                return;
            }

            userListContainer.innerHTML = targets.map(t => `
                <label class="flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl cursor-pointer transition group border border-transparent hover:border-slate-100">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm overflow-hidden">
                            ${t.type === 'group'
                    ? '👥'
                    : `<img src="${getAvatarUrl(t.avatar, t.gender || 'Other')}" class="w-full h-full object-cover">`}
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
 * @desc Thực hiện gửi tin nhắn chia sẻ dưới dạng Card chuyên biệt
 */
function processShareAction(link, type, metadata = {}) {
    const selected = Array.from(document.querySelectorAll('.share-checkbox:checked')).map(cb => ({
        id: cb.value,
        type: cb.getAttribute('data-type')
    }));

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

    window.closeModal();
    showToast(`Đã chia sẻ thành công`, 'success');
}

/** Xử lý chia sẻ bài đăng sau khi chọn người nhận */
export async function confirmShare(postId) {
    const receiverId = window.selectedShareReceiver;
    const message = document.getElementById('shareMessage').value;

    if (!receiverId) {
        showToast('Vui lòng chọn người nhận!', 'error');
        return;
    }

    // Lấy thông tin tóm tắt bài đăng
    const postElement = document.querySelector(`#confirmShareBtn[onclick*="${postId}"]`).closest('.modal-content');
    const postSummary = postElement.querySelector('.text-xs.text-secondary.italic').textContent;

    try {
        // Gửi bài đăng dưới dạng tin nhắn qua ChatModule
        await window.ChatModule.sendSharePost(postId, receiverId, message, postSummary);

        window.closeModal();
        showToast('Chia sẻ thành công!', 'success');

    } catch (error) {
        showToast('Lỗi khi chia sẻ qua chat.', 'error');
    }
}


/* ============================================================
    API: LOAD POSTS
============================================================ */

/** Tải bài viết từ Backend (MODIFIED: Hỗ trợ tải Group Feed) */
export async function loadPosts(targetId, containerId = 'postsFeed') {
    const feed = document.getElementById(containerId);
    if (!feed) return;

    try {
        let url;
        let isGroupFeed = containerId === 'groupPosts';

        if (isGroupFeed) {
            // Tải Feed Group: targetId là GROUP ID
            // Cần target_type=group để Backend biết lọc theo group_id
            url = `${API_URL}/posts?user_id=${window.currentUser.userId}&target_user_id=${targetId}&target_type=group`;
        } else {
            // Tải Newsfeed/Profile: targetId là USER ID
            // [MODIFIED] Nếu container là 'profilePostsContainer', thêm target_type=profile
            const isProfileFeed = containerId === 'profilePostsContainer';
            const typeParam = isProfileFeed ? '&target_type=profile' : '';

            url = `${API_URL}/posts?user_id=${window.currentUser.userId}&target_user_id=${targetId || window.currentUser.userId}${typeParam}`;
        }

        const res = await apiFetch(url.replace(API_URL, ''));
        if (!res) return;

        if (!res.ok) {
            throw new Error(`HTTP Error ${res.status}`);
        }

        const posts = await res.json();

        feed.innerHTML = posts.length === 0
            ? `<div class="text-center p-5 text-secondary">Chưa có bài đăng nào.</div>`
            : posts.map(renderPost).join('');

    } catch (err) {
        console.error("Lỗi tải bài viết:", err);
        showToast(`Không thể tải bài viết: ${err.message}`, 'error');
        feed.innerHTML = `<div class="p-5 text-red-500">Lỗi kết nối hoặc DB khi tải bài viết.</div>`;
    }
}


/* ============================================================
    API: CREATE POST & DELETE POST (HOÀN THIỆN CREATE POST)
============================================================ */

/** Xử lý logic tạo bài đăng mới (MODIFIED: Gửi Group ID) */
/** Xử lý logic tạo bài đăng mới (ĐÃ ĐỒNG BỘ LOGIC LƯU TRỮ ẢNH) */
export async function createPost() {
    const content = document.getElementById('postContent').value.trim();
    const imageInput = document.getElementById('imageInput');
    const videoInput = document.getElementById('videoInput');
    const btn = document.getElementById('postButton');

    const groupId = window.tempPostGroupId;

    if (!content && !imageInput.files[0] && !videoInput.files[0]) {
        showToast('Hãy nhập nội dung hoặc chọn ảnh/video', 'error');
        return;
    }

    // 1. Chuẩn bị FormData
    const formData = new FormData();
    formData.append('user_id', window.currentUser.userId);
    formData.append('content', content);

    if (groupId) {
        formData.append('group_id', groupId);
    }

    // Đính kèm file media
    const mediaFile = imageInput.files[0] || videoInput.files[0];
    if (mediaFile) {
        formData.append('media', mediaFile);
    }

    btn.disabled = true;
    btn.textContent = 'Đang đăng...';

    try {
        /** * 2. Gửi request kèm query params ?type=post
         * Điều này giúp MulterMiddleware lưu vào /uploads/posts/ thay vì /uploads/others/
         */
        const res = await apiFetch(`/posts?user_id=${window.currentUser.userId}&type=post`, {
            method: 'POST',
            body: formData
        });
        if (!res) return;

        const data = await res.json();

        if (res.ok && data.success) {
            showToast('Đăng bài thành công!', 'success');
            window.closeModal();

            // 3. Tải lại feed tương ứng
            if (groupId) {
                window.GroupModule.renderGroupDetail(groupId);
            } else {
                loadPosts(window.currentUser.userId, 'postsFeed');
            }
        } else {
            showToast(data.message || 'Đăng bài thất bại', 'error');
        }

    } catch (err) {
        console.error("Lỗi createPost:", err);
        showToast('Lỗi kết nối hoặc file quá lớn', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Đăng';
        window.tempPostGroupId = null;
    }
}


/** Xóa bài đăng */
export async function deletePost(postId) {
    if (!confirm('Bạn có chắc chắn muốn xóa bài viết này? Hành động này không thể hoàn tác.')) return;

    try {
        const res = await apiFetch(`/posts/${postId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId })
        });
        if (!res) return;

        const data = await res.json();
        if (data.success) {
            showToast('Đã xóa bài viết thành công', 'success');
            document.getElementById(`post-${postId}`)?.remove();
        } else {
            showToast(data.message || 'Không thể xóa bài viết', 'error');
        }
    } catch (err) {
        showToast('Lỗi kết nối server', 'error');
    }
}

/* ============================================================
    API: REACTION (HOÀN THIỆN)
============================================================ */

// Biến lưu timeout để xử lý hover
const reactionTimeouts = {};

export function showReactionPopup(postId, event) {
    if (reactionTimeouts[postId]) {
        clearTimeout(reactionTimeouts[postId]);
        delete reactionTimeouts[postId];
    }
    const popup = document.getElementById(`reactionPopup-${postId}`);
    if (popup) {
        popup.classList.remove('hidden');
    }
}

export function hideReactionPopup(postId) {
    reactionTimeouts[postId] = setTimeout(() => {
        const popup = document.getElementById(`reactionPopup-${postId}`);
        if (popup) {
            popup.classList.add('hidden');
        }
    }, 300); // Delay 300ms để người dùng kịp di chuột vào popup
}

/** Gửi reaction đến bài đăng */
export async function setReaction(postId, type) {
    try {
        const res = await apiFetch(`/posts/${postId}/react`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: window.currentUser.userId,
                reaction_type: type
            })
        });
        if (!res) return;

        const data = await res.json();

        if (res.ok && data.success) {
            // Tải lại feed để cập nhật biểu tượng và số lượng
            // Xử lý thông minh: Chỉ tải lại nếu đang ở view tương ứng
            if (window.currentView === 'home' || window.currentView.startsWith('profile')) {
                // Determine container ID
                const containerId = window.currentView.startsWith('profile') ? 'profilePostsContainer' : 'postsFeed';
                // Get User ID for loadPosts
                const userIdToLoad = window.currentView.startsWith('profile')
                    ? window.currentView.split('_')[1]
                    : window.currentUser.userId;

                loadPosts(userIdToLoad, containerId);
            } else if (window.currentView.startsWith('group_detail_')) {
                const groupId = window.currentView.split('_')[2];
                window.GroupModule.renderGroupDetail(groupId);
            }
        } else {
            showToast(data.message || 'Tương tác thất bại', 'error');
        }

    } catch (err) {
        showToast('Không thể gửi reaction', 'error');
    }
}


// [DUPLICATE REMOVED] Các hàm này đã được định nghĩa ở trên (dòng 1146-1158)
// Xử lý sự kiện click ngoài để đóng Pop-up
document.addEventListener('click', (e) => {
    if (!e.target.closest('.reaction-container')) {
        document.querySelectorAll('.reaction-popup').forEach(popup => {
            popup.classList.add('hidden');
        });
    }
});


/* ============================================================
    KHO LƯU TRỮ (ARCHIVE)
============================================================ */

/** Render giao diện Kho lưu trữ */
export function renderArchivePage() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;

    window.currentView = 'archive';
    window.currentArchiveTab = 'personal'; // Default tab

    mainContent.innerHTML = `
        <div class="max-w-2xl mx-auto animate-fade-in">
            <div class="surface rounded-lg shadow mb-4 border border-base p-4">
                <h2 class="text-xl font-bold text-content mb-2">📂 Kho lưu trữ</h2>
                <p class="text-sm text-secondary mb-4">Các bài viết đã xóa sẽ được lưu ở đây 30 ngày trước khi bị xóa vĩnh viễn.</p>
                
                <div class="flex border-b border-base">
                    <button onclick="window.NewsfeedModule.switchArchiveTab('personal')" 
                            id="tab-personal"
                            class="flex-1 py-3 text-center hover:bg-slate-50 font-semibold border-b-2 border-blue-500 text-blue-600 transition">
                        Bài viết của tôi
                    </button>
                    <button onclick="window.NewsfeedModule.switchArchiveTab('group')" 
                            id="tab-group"
                            class="flex-1 py-3 text-center hover:bg-slate-50 font-semibold border-b-2 border-transparent text-secondary transition">
                        Bài viết trong nhóm
                    </button>
                </div>
            </div>

            <div id="archiveFeed" class="space-y-4">
                <div class="text-center p-8 text-secondary">Đang tải kho lưu trữ...</div>
            </div>
        </div>
    `;

    loadArchivedPosts('personal');
}

/** Chuyển tab trong kho lưu trữ */
export function switchArchiveTab(tab) {
    window.currentArchiveTab = tab;

    // Update Active State UI
    document.getElementById('tab-personal').className = `flex-1 py-3 text-center hover:bg-slate-50 font-semibold border-b-2 transition ${tab === 'personal' ? 'border-blue-500 text-blue-600' : 'border-transparent text-secondary'}`;
    document.getElementById('tab-group').className = `flex-1 py-3 text-center hover:bg-slate-50 font-semibold border-b-2 transition ${tab === 'group' ? 'border-blue-500 text-blue-600' : 'border-transparent text-secondary'}`;

    loadArchivedPosts(tab);
}

/** Tải bài viết lưu trữ */
export async function loadArchivedPosts(type) {
    const container = document.getElementById('archiveFeed');
    container.innerHTML = `<div class="text-center p-8 text-secondary">Đang tải...</div>`;

    try {
        const res = await fetch(`${API_URL}/posts/archive?user_id=${window.currentUser.userId}&type=${type}`);
        const posts = await res.json();

        if (posts.length === 0) {
            container.innerHTML = `<div class="text-center p-8 surface rounded-lg text-secondary">Thùng rác trống! 🗑️</div>`;
            return;
        }

        container.innerHTML = posts.map(post => `
            <div id="archived-post-${post.id}" class="surface rounded-lg shadow p-4 border border-base opacity-75 hover:opacity-100 transition">
                <div class="flex justify-between items-start mb-2">
                    <div class="text-xs text-secondary mb-2">
                        Đã xóa: ${new Date(post.deleted_at).toLocaleString()} <br>
                        (Tự động xóa vĩnh viễn sau 30 ngày)
                    </div>
                </div>
                
                <div class="mb-2 text-content font-medium line-clamp-2">${post.content || '[Chỉ có hình ảnh]'}</div>
                ${post.media_url ? '<div class="text-xs text-blue-500 mb-2">📷 Có đính kèm file media</div>' : ''}

                <div class="flex gap-2 border-t border-base pt-3 mt-2">
                    <button onclick="window.NewsfeedModule.restorePost('${post.id}')" 
                            class="flex-1 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 font-bold text-sm">
                        ♻️ Khôi phục
                    </button>
                    <button onclick="window.NewsfeedModule.permanentDeletePost('${post.id}')" 
                            class="flex-1 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-bold text-sm">
                        🗑️ Xóa vĩnh viễn
                    </button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        container.innerHTML = `<div class="text-center text-red-500">Lỗi tải dữ liệu.</div>`;
    }
}

/** Khôi phục bài viết */
export async function restorePost(postId) {
    if (!confirm('Bạn muốn khôi phục bài viết này? Nó sẽ xuất hiện lại trên bảng tin.')) return;

    try {
        const res = await fetch(`${API_URL}/posts/${postId}/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId })
        });

        if (res.ok) {
            showToast('Đã khôi phục bài viết! 🎉', 'success');
            document.getElementById(`archived-post-${postId}`)?.remove();
        } else {
            showToast('Lỗi khôi phục', 'error');
        }
    } catch (err) { showToast('Lỗi server', 'error'); }
}

/** Xóa vĩnh viễn bài viết */
export async function permanentDeletePost(postId) {
    if (!confirm('CẢNH BÁO: Bài viết sẽ bị xóa vĩnh viễn và KHÔNG THỂ khôi phục. Bạn chắc chứ?')) return;

    try {
        const res = await fetch(`${API_URL}/posts/${postId}/permanent`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: window.currentUser.userId })
        });

        if (res.ok) {
            showToast('Đã xóa vĩnh viễn.', 'success');
            document.getElementById(`archived-post-${postId}`)?.remove();
        } else {
            showToast('Lỗi xóa vĩnh viễn', 'error');
        }
    } catch (err) { showToast('Lỗi server', 'error'); }
}

/* ============================================================
    REALTIME LOGIC
============================================================ */

/**
 * @desc Xử lý khi có bài viết mới được broadcast qua socket
 */
export function handleNewPostRealtime(post) {
    const postsContainer = document.getElementById('postsFeed');
    if (!postsContainer || window.currentView !== 'home') return;

    // Tránh duplicate nếu mình vừa đăng xong
    if (document.getElementById(`post-${post.id}`)) return;

    // Tạo wrapper element
    const temp = document.createElement('div');
    temp.innerHTML = renderPost(post);
    const postEl = temp.firstElementChild;
    postEl.classList.add('animate-bounce-in'); // Thêm hiệu ứng xuất hiện

    // Thêm vào đầu danh sách
    postsContainer.prepend(postEl);

    // Gỡ thông báo "Đang tải" nếu có
    const emptyMsg = postsContainer.querySelector('.text-secondary');
    if (emptyMsg && emptyMsg.innerText.includes('Đang tải')) emptyMsg.remove();
}

/* ============================================================
    EXPOSE TO WINDOW
============================================================ */

// Khai báo NewsfeedModule để các module khác và HTML có thể gọi
window.NewsfeedModule = {
    // UI/Render
    renderHome,
    renderPost,
    showCreatePostModal,
    showComments,
    showShareModal,
    previewMedia,
    renderMedia,

    // API
    loadPosts,
    createPost,
    deletePost,
    setReaction,

    // Helper/Interactions
    showReactionPopup,
    hideReactionPopup,
    confirmShare,
    addComment,
    loadComments, // Tải Comments
    showReplyForm, // Hiển thị Reply Form
    setCommentReaction, // Reaction Comment,
    editPost, // PHẢI CÓ DÒNG NÀY
    togglePostMenu,
    toggleVisibility,
    togglePersonalHide,
    toggleFavorite,
    showReportModal,
    processShareAction,

    // Archive
    renderArchivePage,
    switchArchiveTab,
    loadArchivedPosts,
    restorePost,
    permanentDeletePost,
    showCommentReactions, // [NEW] Expose this function
    hideCommentReactions
};