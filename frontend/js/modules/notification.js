import { API_URL, showToast, defaultConfig, getAvatarUrl, apiFetch } from '../main.js';

const getConfig = () => window.elementSdk ? window.elementSdk.config : defaultConfig;

/**
 * @desc Xử lý khi click vào thông báo (Điều hướng thông minh)
 */
export function handleNotificationClick(type, targetId) {
    if (!window.switchView) return;

    switch (type) {
        // --- SỰ KIỆN BÀI VIẾT & TƯƠNG TÁC ---
        case 'like':
        case 'comment':
        case 'new_post_friend':
            // [MODIFIED] Chuyển hướng thông minh vào bài viết
            if (window.NewsfeedModule && window.NewsfeedModule.navigateToPost) {
                window.NewsfeedModule.navigateToPost(targetId);
            } else {
                console.warn("NewsfeedModule or navigateToPost missing");
                window.switchView('profile', targetId); // Fallback
            }
            break;

        // --- SỰ KIỆN KẾT BẠN ---
        case 'friend_request':
        case 'friend_accepted':
        case 'friend_removed': // Bổ sung thông báo khi bị hủy kết bạn (nếu có)
            window.switchView('profile', targetId);
            break;

        // --- SỰ KIỆN TIN NHẮN ---
        case 'private_message':
        case 'new_message':
            // Sử dụng hàm goToMessage đã tạo ở ProfileModule để trỏ thẳng vào cửa sổ chat
            if (window.ProfileModule && window.ProfileModule.goToMessage) {
                window.ProfileModule.goToMessage(targetId);
            } else {
                window.switchView('home'); // Fallback nếu module chưa load
            }
            break;

        // --- SỰ KIỆN NHÓM ---
        case 'group_approved':
        case 'group_created':
        case 'group_invitation':
            window.switchView('group', targetId);
            break;

        case 'group_join_request':
            // Chuyển hướng đến quản lý yêu cầu của Group
            window.GroupModule?.renderPendingRequests(targetId);
            break;

        default:
            console.log(`Unhandled notification type: ${type}`);
            window.switchView('home');
            break;
    }
}

/**
 * @desc Render giao diện trang Thông báo
 */
export async function renderNotificationsPage() {
    const main = document.getElementById('mainContent');
    const userId = window.currentUser?.userId;
    if (!main || !userId) return;

    main.innerHTML = `
        <div class="max-w-2xl mx-auto surface rounded-2xl shadow-sm p-6 border border-base animate-fade-in bg-white dark:bg-slate-900 dark:border-slate-800 transition-colors duration-300">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    🔔 Thông báo
                </h2>
                <button onclick="window.NotificationModule.markAllAsRead()" 
                        class="text-sm font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-3 py-1.5 rounded-lg transition">
                    Đánh dấu tất cả đã đọc
                </button>
            </div>
            <div id="notificationsContainer" class="space-y-2">
                <div class="p-8 text-center text-gray-400 italic">Đang tải thông báo...</div>
            </div>
        </div>`;

    await loadNotifications(userId);
    // Khi người dùng đã mở trang này, tự động đánh dấu đã đọc sau 2 giây
    setTimeout(() => markAllAsRead(true), 2000);
}

/**
 * @desc Lấy danh sách thông báo từ Server
 */
export async function loadNotifications(userId) {
    const container = document.getElementById('notificationsContainer');
    try {
        const res = await apiFetch(`/notifications?user_id=${userId}`);
        if (!res) return;
        const notifications = await res.json();

        if (!notifications || notifications.length === 0) {
            container.innerHTML = `
                <div class="py-16 text-center">
                    <div class="text-5xl mb-4 opacity-20">📭</div>
                    <p class="text-slate-400 font-medium">Bạn chưa có thông báo nào mới.</p>
                </div>`;
            return;
        }

        container.innerHTML = notifications.map(n => renderNotificationItem(n)).join('');

    } catch (err) {
        container.innerHTML = `<div class="text-red-500 text-center py-4">⚠️ Lỗi tải thông báo. Vui lòng thử lại.</div>`;
    }
}

/**
 * @desc Render từng dòng thông báo
 */
function renderNotificationItem(n) {
    const isReadClass = n.is_read ? 'opacity-60 bg-white dark:bg-slate-900' : 'bg-blue-50/40 dark:bg-slate-800/40 border-blue-100 dark:border-slate-700 shadow-sm';

    // Logic xác định targetId: Tin nhắn/Kết bạn dùng sender_id, Bài viết/Nhóm dùng context_id
    const targetId = (n.type.includes('friend') || n.type.includes('message'))
        ? n.sender_id
        : (n.context_id || n.target_id);

    return `
        <div class="notification-item p-4 rounded-xl border border-transparent hover:border-blue-200 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md transition-all cursor-pointer flex items-start gap-4 ${isReadClass}"
             onclick="window.NotificationModule.handleNotificationClick('${n.type}', '${targetId}')">
            
            <div class="relative">
                ${getAvatarWithStatusHtml(n.sender_id, n.sender_avatar, n.sender_gender, 'w-12 h-12')}
                <div class="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm text-[10px]">
                    ${getIconByType(n.type)}
                </div>
            </div>

            <div class="flex-1">
                <p class="text-sm text-slate-700 dark:text-slate-300 leading-snug">
                    <span class="font-bold text-slate-900 dark:text-white">${n.sender_name || 'Hệ thống'}</span> ${n.content}
                </p>
                <span class="text-[11px] text-slate-400 mt-1 block font-bold uppercase tracking-tight">
                    ${window.getTimeAgo ? window.getTimeAgo(n.created_at) : 'Vừa xong'}
                </span>
            </div>

            ${!n.is_read ? `<div class="w-2.5 h-2.5 bg-blue-500 rounded-full mt-2 animate-pulse"></div>` : ''}
        </div>`;
}

/**
 * @desc Trả về icon nhỏ đi kèm thông báo
 */
function getIconByType(type) {
    if (type.includes('like')) return '❤️';
    if (type.includes('comment')) return '💬';
    if (type.includes('friend')) return '👤';
    if (type.includes('message')) return '✉️';
    if (type.includes('group')) return '👥';
    return '🔔';
}

/**
 * @desc Đánh dấu tất cả là đã đọc
 */
export async function markAllAsRead(silent = false) {
    const userId = window.currentUser?.userId;
    if (!userId) return;

    try {
        const res = await apiFetch(`/notifications/mark-read`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        if (!res) return;

        if (res.ok) {
            if (!silent) showToast('Đã đánh dấu tất cả là đã đọc', 'success');
            updateUnreadCount(0);
            // Cập nhật UI ngay lập tức nếu đang ở trang thông báo
            document.querySelectorAll('.notification-item').forEach(el => el.classList.add('opacity-60'));
        }
    } catch (err) {
        console.error('Error marking notifications as read:', err);
    }
}

/**
 * @desc Cập nhật Badge trên Header
 */
export function updateUnreadCount(count) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    let finalCount = count;
    if (count === 'increment') {
        const currentCount = parseInt(badge.textContent) || 0;
        finalCount = currentCount + 1;
    }

    badge.textContent = finalCount > 99 ? '99+' : finalCount;
    finalCount > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
}

/**
 * @desc Tải số lượng chưa đọc ban đầu
 */
export async function loadInitialUnreadCount() {
    const userId = window.currentUser?.userId;
    if (!userId) return;
    try {
        const res = await apiFetch(`/notifications?user_id=${userId}`);
        if (!res) return;
        const data = await res.json();
        const unread = data.filter(n => !n.is_read).length;
        updateUnreadCount(unread);
    } catch (err) {
        console.error('Error loading unread count:', err);
    }
}

// ============================================
// EXPOSE TO WINDOW
// ============================================
/**
 * @desc Xử lý khi có thông báo mới từ Socket gửi tới
 */
export function handleNewIncomingNotification(data) {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;

    // data: { senderId, type, content, targetId }
    // Cần fake/fetch thông tin sender để render đủ đẹp
    // Để đơn giản, ta fetch lại list hoặc chỉ prepend một item cơ bản
    const itemHtml = `
        <div class="p-4 rounded-xl border border-blue-100 bg-blue-50/50 flex items-center gap-4 animate-bounce-in cursor-pointer hover:bg-blue-100 transition"
             onclick="window.NotificationModule.handleNotificationClick('${data.type}', '${data.targetId}')">
            <div class="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-lg shadow-sm">
                ${data.type === 'like' ? '❤️' : data.type === 'comment' ? '💬' : '🔔'}
            </div>
            <div class="flex-1">
                <p class="text-sm font-medium text-slate-800">${data.content}</p>
                <p class="text-[10px] text-blue-500 font-bold uppercase mt-1">Vừa xong</p>
            </div>
            <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
        </div>
    `;

    // Nếu đang hiển thị "Trống", gỡ nó đi
    if (container.querySelector('.text-slate-400')) container.innerHTML = '';

    container.insertAdjacentHTML('afterbegin', itemHtml);
}

// Khởi tạo Global Module
window.NotificationModule = {
    renderNotificationsPage,
    handleNotificationClick,
    loadInitialUnreadCount,
    updateUnreadCount,
    loadNotifications,
    markAllAsRead,
    handleNewIncomingNotification
};