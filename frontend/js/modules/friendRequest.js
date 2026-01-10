import { API_URL, showToast, io, getAvatarUrl, apiFetch } from '../main.js';

/**
 * @desc Render giao diện danh sách lời mời kết bạn
 */
export async function renderFriendRequests() {
    const main = document.getElementById('mainContent');
    if (!main) return;

    main.innerHTML = `
        <div class="p-12 text-center flex flex-col items-center justify-center animate-fade-in">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
            <p class="text-slate-500 font-medium">Đang tải danh sách lời mời...</p>
        </div>`;

    try {
        const res = await apiFetch(`/users/requests?user_id=${window.currentUser.userId}`);
        if (!res) return;
        const list = await res.json();

        main.innerHTML = `
            <div class="max-w-2xl mx-auto pb-10 animate-fade-in">
                <div class="flex items-center justify-between mb-8">
                    <h2 class="text-2xl font-black text-slate-800 flex items-center gap-3">
                        🔔 Lời mời kết bạn 
                        <span id="requestCountBadge" class="bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-black shadow-lg shadow-blue-200">
                            ${list.length}
                        </span>
                    </h2>
                </div>
                
                <div id="friendRequestsList" class="space-y-4">
                    ${list.length > 0 ? list.map(req => renderRequestItem(req)).join('') : renderEmptyState()}
                </div>
            </div>`;

        loadBadgeCount();
    } catch (e) {
        showToast('Không thể kết nối đến máy chủ', 'error');
        main.innerHTML = `<div class="p-10 text-center text-red-500">Lỗi nạp dữ liệu.</div>`;
    }
}

function renderRequestItem(req) {
    return `
        <div class="surface p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between bg-white hover:shadow-md transition-all group">
            <div class="flex items-center gap-4 cursor-pointer" onclick="window.switchView('profile', '${req.sender_id}')">
                ${getAvatarWithStatusHtml(req.sender_id, req.avatar, req.gender, 'w-16 h-16')}
                <div>
                    <div class="font-black text-slate-800 group-hover:text-blue-600 transition-colors">${req.full_name}</div>
                    <div class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        ${req.location || 'Thành viên SocialVN'}
                    </div>
                </div>
            </div>
            
            <div class="flex gap-2">
                <button onclick="window.FriendRequestModule.handleAction('${req.sender_id}', 'accept')" 
                        class="px-5 py-2.5 bg-blue-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-100 active:scale-95 hover:bg-blue-700 transition-all">
                    CHẤP NHẬN
                </button>
                <button onclick="window.FriendRequestModule.handleAction('${req.sender_id}', 'reject')" 
                        class="px-5 py-2.5 bg-slate-100 text-slate-500 rounded-2xl text-xs font-black active:scale-95 hover:bg-slate-200 transition-all">
                    XÓA
                </button>
            </div>
        </div>`;
}

function renderEmptyState() {
    return `<div class="p-20 text-center flex flex-col items-center"><span class="text-5xl opacity-40">📬</span><p class="text-slate-400 font-bold mt-4 italic">Không có lời mời nào.</p></div>`;
}

/**
 * @desc Xử lý Chấp nhận/Xóa lời mời
 */
export async function handleAction(targetId, action, isFromProfile = false) {
    if (!window.currentUser?.userId || !targetId || !action) {
        showToast('Thiếu thông tin người dùng hoặc hành động.', 'error');
        return;
    }

    // Logic: Người gửi yêu cầu luôn là targetId (người muốn kết bạn với mình)
    // Người nhận luôn là mình (currentUser.userId)
    const sender_id = targetId;
    const receiver_id = window.currentUser.userId;

    try {
        console.log(`Thực hiện ${action}: Sender=${sender_id}, Receiver=${receiver_id}`);

        const res = await apiFetch(`/users/friendship`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender_id, receiver_id, action })
        });
        if (!res) return;

        // Kiểm tra xem res có phải là 404 không trước khi parse JSON
        if (res.status === 404) {
            throw new Error("Đường dẫn API /users/friendship không tìm thấy (404). Hãy kiểm tra file Router Backend.");
        }

        const data = await res.json();

        if (data.success) {
            showToast(data.message, 'success');

            if (isFromProfile) {
                window.ProfileModule?.renderProfile(targetId);
            } else {
                renderFriendRequests();
            }

            loadBadgeCount();
        } else {
            showToast(data.message || 'Thao tác thất bại.', 'error');
        }
    } catch (e) {
        console.error("Lỗi fetch friendship:", e);
        showToast(e.message, 'error');
    }
}

export async function loadBadgeCount() {
    const badge = document.getElementById('friendRequestCount');
    if (!badge) return;

    try {
        const res = await apiFetch(`/users/requests?user_id=${window.currentUser.userId}`);
        if (!res) return;
        const list = await res.json();

        if (list && list.length > 0) {
            badge.textContent = list.length;
            badge.classList.remove('hidden');
            const countLabel = document.getElementById('requestCountBadge');
            if (countLabel) countLabel.textContent = list.length;
        } else {
            badge.classList.add('hidden');
        }
    } catch (e) { console.error('Badge update error'); }
}

window.FriendRequestModule = {
    renderFriendRequests,
    handleAction,
    loadBadgeCount
};