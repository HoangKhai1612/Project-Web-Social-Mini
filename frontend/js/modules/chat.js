// frontend/js/modules/chat.js

import { API_URL, showToast, defaultConfig, getAvatarUrl, apiFetch, io } from '../main.js';

const getConfig = () => window.elementSdk?.config || defaultConfig;// Lấy config từ SDK

let currentChatTarget = null;// Target chat hiện tại
let selectedMembers = [];// Danh sách thành viên đã chọn
let currentChatSettings = {};// Lưu trữ role và trạng thái quan hệ từ server

//State cho Tìm kiếm Sidebar
let currentChatTab = 'friends';// Tab chat hiện tại
let chatSearchQuery = '';// Text tìm kiếm
let recentExpanded = false;
let historyExpanded = false;
let isChatSearchActive = false;
let chatListData = []; // Lưu trữ dữ liệu gốc để tìm kiếm client-side

export async function switchChatTab(tabName) {// HÀM CHUNG CHO CÁC TAB CHAT (SIDEBAR)
    currentChatTab = tabName;
    const tabs = ['friends', 'groups', 'strangers', 'archived'];// Danh sách tab chat
    const listContainer = document.getElementById('chatList');
    if (!listContainer) return;

    // Reset search
    chatSearchQuery = '';
    const searchInput = document.getElementById('chatSidebarSearch');
    if (searchInput) searchInput.value = '';

    // Cập nhật giao diện Tab đang chọn
    tabs.forEach(tab => {
        document.getElementById(`chatTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)
            ?.classList.remove('border-blue-500', 'border-b-2');
    });
    document.getElementById(`chatTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`)
        ?.classList.add('border-blue-500', 'border-b-2');

    await renderChatList();
}

export function toggleChatSearch() {// Bật/Tắt chế độ tìm kiếm ở sidebar
    isChatSearchActive = !isChatSearchActive;
    const container = document.getElementById('chatSearchContainer');
    if (container) {// Hiển thị/ẩn container tìm kiếm
        container.classList.toggle('hidden', !isChatSearchActive);
        if (isChatSearchActive) {// FOCUS khi mở tìm kiếm
            document.getElementById('chatSidebarSearch')?.focus();
        } else {// Reset khi đóng tìm kiếm
            chatSearchQuery = '';
            const input = document.getElementById('chatSidebarSearch');
            if (input) input.value = '';
        }
    }
    renderChatList();
}

export async function handleChatSidebarSearch(query) {// Xử lý khi gõ vào ô tìm kiếm ở sidebar
    chatSearchQuery = query.toLowerCase().trim();
    renderChatList();
}

async function renderChatList() {// Render danh sách chat
    const container = document.getElementById('chatList');
    if (!container) return;

    const userId = window.currentUser?.userId;
    if (!userId) return;

    // 1. Tải dữ liệu nếu chưa có hoặc tab thay đổi (Simplification: luôn tải lại để đảm bảo tính mới)
    let endpoint = (currentChatTab === 'friends') ? `/users/friends` :
        (currentChatTab === 'groups') ? `/users/groups` : `/users/strangers-messages`;

    try {
        const res = await apiFetch(`${endpoint}?user_id=${userId}`);
        if (!res) return; // Auth error handled by apiFetch
        const list = await res.json();
        chatListData = list || [];

        // 2. Render dựa trên trạng thái search
        if (isChatSearchActive) {
            if (chatSearchQuery) {
                // VIEW TÌM KIẾM: Kết quả lọc
                const filtered = chatListData.filter(item => {
                    const name = (item.full_name || item.name || "").toLowerCase();
                    return name.includes(chatSearchQuery);
                });

                if (filtered.length === 0) {
                    container.innerHTML = `<div class="p-8 text-center text-gray-400 text-sm italic">Không tìm thấy kết quả nào.</div>`;
                } else {
                    container.innerHTML = `
                        <div class="px-4 py-2 text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50/30">Kết quả tìm kiếm</div>
                        ${filtered.map(item => renderChatListItem(item, currentChatTab)).join('')}
                    `;
                }
            } else {
                // VIEW TÌM KIẾM: Gần đây + Lịch sử (theo yêu cầu "khi click hiện form nhỏ")
                await renderChatDefaultView(container);
            }
        } else {
            // VIEW BÌNH THƯỜNG: Hiển thị toàn bộ danh sách
            if (chatListData.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-gray-400 text-sm">Chưa có cuộc trò chuyện nào trong mục này.</div>`;
            } else {
                container.innerHTML = chatListData.map(item => renderChatListItem(item, currentChatTab)).join('');
            }
        }
    } catch (err) {
        console.error("Lỗi render danh sách chat:", err);
        container.innerHTML = `<div class="p-4 text-center text-red-500 text-sm">Lỗi tải dữ liệu.</div>`;
    }
}

async function renderChatDefaultView(container) {// Render view mặc định
    const userId = window.currentUser?.userId;// Lấy ID người dùng

    // FETCH LỊCH SỬ TÌM KIẾM (Chỉ lấy source: chat)
    let history = [];
    try {
        const res = await apiFetch(`/search/history?userId=${userId}&source=chat`);// Lấy lịch sử tìm kiếm
        if (res) {
            const data = await res.json();
            const rawHistory = data.history || [];

            // Lấy toàn bộ lịch sử của source chat để hiển thị đồng bộ trong cả 3 tab chat
            history = rawHistory.filter(h =>
                h.item_type === 'chat_group' ||
                h.item_type === 'chat_stranger' ||
                h.item_type === 'chat_friend' ||
                !h.item_type
            );
        }
    } catch (e) { }

    // RENDER SECTION GẦN ĐÂY
    const recentLimit = recentExpanded ? chatListData.length : 5;
    const recentToShow = chatListData.slice(0, recentLimit);
    const hasMoreRecent = chatListData.length > 5;

    let html = `
        <div class="section-recent pb-4">
            <div class="px-4 py-3 flex justify-between items-center bg-slate-50/50">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Nhắn tin gần đây</span>
            </div>
            ${recentToShow.length > 0
            ? recentToShow.map(item => renderChatListItem(item, currentChatTab)).join('')
            : '<div class="px-6 py-4 text-xs text-gray-400 italic">Chưa có cuộc trò chuyện nào.</div>'}
            
            ${hasMoreRecent ? `
                <div class="px-4 py-2 text-center">
                    <button onclick="window.ChatModule.toggleRecentExpansion()" class="text-[11px] font-bold text-blue-600 hover:underline">
                        ${recentExpanded ? ' Thu lại' : ' Xem thêm'}
                    </button>
                </div>
            ` : ''}
        </div>

        <div class="border-t border-slate-100 mt-2">
            <div class="px-4 py-3 flex justify-between items-center bg-slate-50/50">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Lịch sử tìm kiếm</span>
                ${history.length > 0 ? `<button onclick="window.ChatModule.clearHistoryChat()" class="text-[9px] font-black text-red-400 hover:text-red-500 uppercase tracking-tighter">Xóa tất cả</button>` : ''}
            </div>
            <div id="chatSearchHistoryContainer">
                ${renderHistorySectionItems(history)}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function renderHistorySectionItems(history) {// Render các mục trong section lịch sử tìm kiếm
    if (!history || history.length === 0) {
        return `<div class="px-6 py-4 text-xs text-gray-400 italic">Trống.</div>`;
    }

    const limit = historyExpanded ? history.length : 5;// Giới hạn số mục hiển thị
    const itemsToShow = history.slice(0, limit);// Lấy số mục cần hiển thị
    const hasMore = history.length > 5;// Kiểm tra có còn mục nào chưa hiển thị

    let html = itemsToShow.map(item => `
        <div class="group flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition cursor-pointer">
            <div class="flex items-center gap-3 overflow-hidden flex-1" onclick="window.ChatModule.openFromHistory('${item.item_id}', '${item.item_name}', '${item.item_type}')">
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm border shadow-sm">
                    ${(item.item_type === 'chat_group' || item.item_type === 'group') ? '👥' : '👤'}
                </div>
                <div class="text-sm font-medium text-slate-700 truncate">${item.item_name}</div>
            </div>
            <button onclick="window.ChatModule.deleteHistoryItemChat('${item.id}', event)" class="p-1 px-2 text-slate-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100">✕</button>
        </div>
    `).join('');

    if (hasMore) {// Hiển thị nút xem thêm nếu có còn mục nào chưa hiển thị
        html += `
            <div class="px-4 py-2 text-center">
                <button onclick="window.ChatModule.toggleHistoryExpansion()" class="text-[11px] font-bold text-blue-600 hover:underline">
                    ${historyExpanded ? ' Thu lại' : ' Xem thêm'}
                </button>
            </div>
        `;
    }
    return html;
}

// Thêm tin nhắn vào lịch sử chat
async function addToChatHistory(itemId, itemName, itemType) {
    try {
        await apiFetch(`/search/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: (window.currentUser.id || window.currentUser.userId),
                itemId,
                itemName,
                itemType,
                source: 'chat'
            })
        });
    } catch (e) { }
}

export function toggleRecentExpansion() {// Bật/tắt xem thêm tin nhắn gần đây
    recentExpanded = !recentExpanded;
    renderChatList();
}

export function toggleHistoryExpansion() {// Bật/tắt xem thêm tin nhắn gần đây
    historyExpanded = !historyExpanded;
    renderChatList();
}

export async function deleteHistoryItemChat(id, e) {// Xóa 1 mục lịch sử theo ID
    if (e) e.stopPropagation();
    try {
        const res = await apiFetch(`/search/history/${id}?userId=${(window.currentUser.id || window.currentUser.userId)}`, { method: 'DELETE' });
        if (res && res.ok) {
            renderChatList();
        }
    } catch (e) { }
}

export async function clearHistoryChat() {// Xóa toàn bộ lịch sử tìm kiếm
    if (!confirm("Xóa toàn bộ lịch sử tìm kiếm?")) return;
    try {
        const res = await apiFetch(`/search/history?userId=${(window.currentUser.id || window.currentUser.userId)}&source=chat`, { method: 'DELETE' });
        if (res && res.ok) {
            renderChatList();
        }
    } catch (e) { }
}

export function openFromHistory(id, name, type) {
    // Xử lý type mới: chat_group là nhóm, còn lại là cá nhân
    const isGroup = type === 'chat_group' || type === 'group';
    window.ChatModule.openChat(id, name, isGroup);
}

function renderChatListItem(item, type) {// Render 1 mục trong list chat
    const isGroup = (type === 'groups');
    const name = item.full_name || item.name || "Người dùng";// Tự động lấy tên
    const id = item.id;// Lấy ID
    const isOnline = !isGroup && window.onlineUsersSet.has(String(id));// Kiểm tra online

    return `
        <div onclick="window.ChatModule.openChat('${id}', '${name}', ${isGroup})"
             id="chat-item-${id}"
             class="flex justify-between items-center p-3 hover:bg-slate-50 cursor-pointer border-b border-gray-100 transition duration-200">
            <div class="flex items-center gap-3">
                ${isGroup
            ? `<img src="${item.avatar ? `${window.IO_URL}/${item.avatar}` : 'images/default_group_chat.png'}" class="w-10 h-10 rounded-xl object-cover border border-gray-200 flex-shrink-0 bg-white dark:bg-slate-800">`
            : getAvatarWithStatusHtml(id, item.avatar, item.gender, 'w-10 h-10')// Hiển thị avatar
        }
                <div class="overflow-hidden">
                    <div class="font-semibold text-sm truncate text-slate-800">${name}</div>
                    <div class="text-xs text-secondary truncate max-w-[160px] opacity-70">
                        ${item.last_message || 'Bắt đầu trò chuyện ngay...'}
                    </div>
                </div>
            </div>
            ${item.unread_count > 0 ? `<span class="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 shadow-sm">${item.unread_count}</span>` : ''}
        </div>
    `;
}

/**
 * @desc Cập nhật trạng thái hiển thị của một user cụ thể
 */
export function updateOnlineStatus(userId, status) {
    if (status === 'online') {
        window.onlineUsersSet.add(String(userId));// Thêm vào set
    } else {
        window.onlineUsersSet.delete(String(userId));// Xóa khỏi set
    }

    // Cập nhật DOM trực tiếp nếu phần tử đang hiển thị
    const itemEl = document.getElementById(`chat-item-${userId}`);// Lấy element
    if (itemEl) {
        const avatarContainer = itemEl.querySelector('.avatar-small');// Lấy container avatar
        if (avatarContainer) {
            let dot = avatarContainer.querySelector('.bg-green-500');// Lấy dot online
            if (status === 'online' && !dot) {
                const dotEl = document.createElement('div');// Tạo dot online
                dotEl.className = 'absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full';
                avatarContainer.appendChild(dotEl);// Thêm dot vào container
            } else if (status === 'offline' && dot) {
                dot.remove();// Xóa dot
            }
        }
    }
}

// HÀM MỞ ĐOẠN CHAT
export async function openChat(targetId, targetName, isGroup = false) {
    const chatContainer = document.getElementById('mainContent');// Lấy container chat
    if (!chatContainer) return;

    currentChatTarget = targetId;// Cập nhật target
    window.activeChat = targetId;// Cập nhật active chat
    window.isCurrentChatGroup = isGroup;// Cập nhật is group

    window.ChatModule.markChatAsReadAPI(targetId);

    // Ghi vào lịch sử tìm kiếm chat (Source luôn là chat)
    let chatType = 'chat_friend';
    if (isGroup) {
        chatType = 'chat_group';
    } else if (currentChatTab === 'strangers') {
        chatType = 'chat_stranger';
    }

    addToChatHistory(targetId, targetName, chatType);

    // Tìm thông tin avatar từ danh sách chat hiện có để hiển thị ngay ở Header
    // Nếu không tìm thấy (ví dụ mở từ link share), sẽ hiển thị default hoặc cập nhật sau khi load API
    const targetItem = chatListData.find(i => String(i.id) === String(targetId));
    const targetAvatar = targetItem ? targetItem.avatar : null;
    const targetGender = targetItem ? targetItem.gender : 'Other';

    // Reset trạng thái tìm kiếm sau khi chọn người/nhóm
    if (isChatSearchActive) {
        isChatSearchActive = false;
        chatSearchQuery = '';
        const searchInput = document.getElementById('chatSidebarSearch');
        const searchContainer = document.getElementById('chatSearchContainer');
        if (searchInput) searchInput.value = '';
        if (searchContainer) searchContainer.classList.add('hidden');
        renderChatList(); // Quay về danh sách bình thường
    }

    chatContainer.innerHTML = renderChatDetailShell(targetId, targetName, isGroup, targetAvatar, targetGender);// Render chat detail

    await loadChatHistory(targetId, isGroup);// Load chat history
}

let replyingTo = null; // Lưu tin nhắn đang được reply

function renderChatDetailShell(targetId, targetName, isGroup, avatar, gender) {
    const config = getConfig();// Lấy config
    const avatarHtml = isGroup
        ? `<img src="${avatar ? `${window.IO_URL}/${avatar}` : 'images/default_group_chat.png'}" id="chatHeaderAvatar" class="w-10 h-10 rounded-xl object-cover border border-gray-200 bg-white dark:bg-slate-800">`
        : getAvatarWithStatusHtml(targetId, avatar, gender, 'w-10 h-10');// Lấy avatar

    return `
        <div class="flex flex-col h-full relative bg-white dark:bg-slate-900 transition-colors duration-300">
            <div class="surface p-3 border-b dark:border-slate-800 flex justify-between items-center sticky top-0 z-10 shadow-sm bg-white dark:bg-slate-900">
                <div class="flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 px-2 py-1 rounded-lg transition" 
                     onclick="window.ChatModule.toggleChatSettings()">
                    ${avatarHtml}
                    <div>
                        <div class="font-bold text-slate-800 dark:text-white text-lg leading-tight" id="chatHeaderName">${targetName}</div>
                        <span class="text-[10px] text-gray-400">▼ Tùy chọn</span>
                    </div>
                </div>
                <button type="button" onclick="window.switchView('home')" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 transition">&times;</button>
            </div>

            <div id="chatSettingsSidebar" class="hidden absolute left-3 top-16 surface shadow-2xl border border-slate-200 dark:border-slate-700 rounded-2xl p-2 z-50 w-72 space-y-1 bg-white dark:bg-slate-800">
                <div id="settingsContent" class="p-2 dark:text-gray-300">Đang tải cấu hình...</div>
            </div>

            <div id="messageList" class="flex flex-col flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-slate-50/30 dark:bg-slate-950/50"></div>
            
            <div id="replyPreview" class="hidden bg-slate-100 dark:bg-slate-800 p-2 px-4 border-t dark:border-slate-700 flex justify-between items-center animate-slide-up">
                <div class="text-xs truncate flex-1">
                    <span class="font-bold text-blue-600">Đang trả lời:</span>
                    <span id="replyPreviewText" class="text-slate-500 dark:text-slate-400 italic ml-1"></span>
                </div>
                <button type="button" onclick="window.ChatModule.cancelReply()" class="text-gray-400 hover:text-red-500">✕</button>
            </div>

            <div class="surface p-3 border-t dark:border-slate-800 bg-white dark:bg-slate-900">
                <div id="imagePreviewContainer" class="hidden mb-2 relative w-32 h-32">
                     <img id="imagePreview" class="w-full h-full object-cover rounded-xl border dark:border-slate-700">
                     <button type="button" onclick="window.ChatModule.clearImage()" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-[10px]">✕</button>
                </div>
                <div class="flex items-center gap-2 max-w-4xl mx-auto">
                    <button type="button" onclick="document.getElementById('chatMediaInput').click()" class="p-2 text-2xl hover:scale-110 transition" title="Gửi ảnh">🖼️</button>
                    <input type="file" id="chatMediaInput" class="hidden" accept="image/*" onchange="window.ChatModule.previewImage(event)">
                    <input type="text" id="chatMessageInput" placeholder="Nhập tin nhắn..." 
                           class="flex-1 p-2.5 bg-slate-100 dark:bg-slate-800 dark:text-white border-none rounded-2xl px-5 outline-none focus:ring-2 focus:ring-blue-400/50 transition placeholder-slate-400 dark:placeholder-slate-500"
                           onkeypress="if(event.key === 'Enter') { event.preventDefault(); window.ChatModule.sendMessage(); }">
                    <button type="button" onclick="event.preventDefault(); window.ChatModule.sendMessage()" id="sendBtn" class="px-6 py-2.5 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 dark:shadow-none transition active:scale-95 bg-blue-600 hover:bg-blue-700">Gửi</button>
                </div>
            </div>
        </div>
    `;
}

async function loadChatHistory(targetId, isGroup = false) {
    const messageList = document.getElementById('messageList');
    const headerName = document.getElementById('chatHeaderName');
    const inputMsg = document.getElementById('chatMessageInput');
    const sendBtn = document.getElementById('sendBtn');
    if (!messageList) return;

    try {
        const userId = (window.currentUser.id || window.currentUser.userId);
        const res = await apiFetch(`/chat/${targetId}?user_id=${userId}&is_group=${isGroup}`);
        if (!res) return;
        const data = await res.json();

        if (data.success) {
            currentChatSettings = data.settings || {};

            // Cập nhật tên Header (Dùng display_name - Biệt danh từ Server)
            if (headerName) headerName.innerText = isGroup ? (currentChatSettings.group_name || "Nhóm") : (currentChatSettings.display_name);

            // Cập nhật Avatar Header nếu là Group
            if (isGroup && currentChatSettings.avatar) {
                const avatarEl = document.getElementById('chatHeaderAvatar');
                if (avatarEl) avatarEl.src = `${window.IO_URL}/${currentChatSettings.avatar}`;
            }

            renderSettingsMenu(isGroup);

            // Kiểm tra trạng thái Chặn (Block) cho chat 1-1
            if (!isGroup && currentChatSettings.is_blocked) {
                const blockedByMe = String(currentChatSettings.blocked_by) === String(userId);
                const notice = blockedByMe ? "Bạn đã chặn người này." : "Đối phương đã chặn bạn.";
                messageList.innerHTML = `<div class="flex justify-center my-10"><span class="bg-gray-100 text-gray-500 text-xs px-4 py-2 rounded-full shadow-sm">🚫 ${notice}</span></div>`;
                if (inputMsg) { inputMsg.disabled = true; inputMsg.placeholder = "Không thể nhắn tin..."; }
                if (sendBtn) sendBtn.style.opacity = "0.5";
                return;
            } else {
                if (inputMsg) { inputMsg.disabled = false; inputMsg.placeholder = "Nhắn tin..."; }
                if (sendBtn) sendBtn.style.opacity = "1";
            }

            // Logic Grouping: Chỉ hiển thị avatar ở tin nhắn CUỐI CÙNG của một chuỗi tin nhắn liên tiếp từ cùng một người
            let htmlContent = '';
            let lastDate = null;
            const messages = data.messages || [];

            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const nextMsg = messages[i + 1];

                const dateStr = new Date(msg.created_at).toLocaleDateString('vi-VN');
                if (dateStr !== lastDate) {
                    htmlContent += `<div class="flex items-center justify-center my-6"><span class="text-[10px] font-bold text-gray-400 px-3 py-1 rounded-full bg-slate-100">${dateStr}</span></div>`;
                    lastDate = dateStr;
                }

                // Kiểm tra xem tin nhắn tiếp theo có phải của cùng người gửi không
                // Nếu KHÔNG (tức là đổi người hoặc hết tin), thì đây là tin cuối cùng của group -> Hiện avatar
                const isLastInGroup = !nextMsg || String(nextMsg.sender_id) !== String(msg.sender_id);

                // Kiểm tra tin nhắn ĐẦU TIÊN của group -> Hiện nickname
                const prevMsg = messages[i - 1];
                const isFirstInGroup = !prevMsg || String(prevMsg.sender_id) !== String(msg.sender_id);

                htmlContent += renderMessage(msg, isLastInGroup, isFirstInGroup, isGroup); // Pass thêm cờ isGroup
            }

            messageList.innerHTML = htmlContent || `<div class="p-20 text-center text-gray-300 text-sm italic">Bắt đầu trò chuyện ngay!</div>`;
            messageList.scrollTop = messageList.scrollHeight;
        }
    } catch (err) { console.error("Lỗi loadChatHistory:", err); }
}

function renderSettingsMenu(isGroup) {
    const content = document.getElementById('settingsContent');
    if (!content) return;

    if (isGroup) {
        const isAdmin = (currentChatSettings.my_role === 'admin');
        content.innerHTML = `
            <div class="text-[10px] font-black text-slate-400 px-3 py-2 uppercase border-b mb-1">Quản lý Nhóm</div>
            
            <button onclick="document.getElementById('chatGroupAvatarInput').click()" class="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-sm transition text-indigo-600 font-medium h-full">📷 Đổi ảnh nhóm</button>
            <input type="file" id="chatGroupAvatarInput" class="hidden" accept="image/*" onchange="window.ChatModule.handleChatAvatarUpload(event)">

            <button onclick="window.ChatModule.viewMembers('${currentChatTarget}')" class="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-sm transition">👥 Thành viên</button>
            ${isAdmin ? `
                <button onclick="window.ChatModule.addMemberPrompt('${currentChatTarget}')" class="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-sm transition">➕ Thêm người (Bạn bè)</button>
                <button onclick="window.ChatModule.updateGroupName('${currentChatTarget}')" class="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-sm transition text-blue-600 font-medium">✏️ Đổi tên nhóm</button>
            ` : ''}
            <button onclick="window.ChatModule.leaveGroup('${currentChatTarget}')" class="w-full text-left p-3 hover:bg-red-50 text-red-500 rounded-xl text-sm border-t mt-2 font-bold transition">🚪 Rời nhóm</button>
        `;
    } else {
        const isBlocked = currentChatSettings.is_blocked;
        const blockedByMe = isBlocked && String(currentChatSettings.blocked_by) === String((window.currentUser.id || window.currentUser.userId));

        content.innerHTML = `
            <div class="text-[10px] font-black text-slate-400 px-3 py-2 uppercase border-b mb-1">Tùy chọn</div>
            <button onclick="window.ChatModule.updateAlias()" class="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-sm transition">✏️ Đặt biệt danh</button>
            <button onclick="window.ChatModule.handleBlock('${currentChatTarget}', ${blockedByMe ? "'unblock'" : "'block'"})" 
                    class="w-full text-left p-3 hover:bg-slate-50 rounded-xl text-sm transition ${blockedByMe ? 'text-blue-500 font-bold' : 'text-orange-600'}">
                ${blockedByMe ? '✅ Bỏ chặn người này' : '🚫 Chặn người này'}
            </button>
            <button onclick="window.ChatModule.deleteChatConfirm('${currentChatTarget}')" class="w-full text-left p-3 hover:bg-red-50 text-red-600 rounded-xl text-sm border-t mt-1 transition">🗑️ Xóa hội thoại</button>
        `;
    }
}

function renderMessage(msg, showAvatar = true, isFirstInGroup = false, isGroupChat = false) {
    // Kiểm tra người gửi để căn lề trái/phải
    const isSender = String(msg.sender_id) === String((window.currentUser.id || window.currentUser.userId));

    // Thiết lập class cho bong bóng chat
    const bubbleClass = isSender
        ? 'bg-blue-600 text-white rounded-2xl border border-transparent'
        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm';

    // Avatar cho tin nhắn (Chỉ hiện nếu showAvatar = true)
    // Nếu là sender thì User không yêu cầu hiện avatar của mình trong chat, chỉ đối phương.
    const avatarHtml = (!isSender && showAvatar)
        ? `<div class="self-end mb-1 mr-2 flex-shrink-0">
               ${getAvatarWithStatusHtml(msg.sender_id, msg.sender_avatar, msg.sender_gender, 'w-8 h-8')}
           </div>`
        : (!isSender ? `<div class="w-8 mr-2 flex-shrink-0"></div>` : ''); // Spacer để thẳng hàng

    let content = msg.message || '';

    // Xử lý hiển thị Tin nhắn đang trả lời (Reply)
    let replyHtml = '';
    if (msg.reply_content) {
        replyHtml = `
            <div class="bg-black/10 dark:bg-white/10 p-2 mb-2 rounded-lg text-[11px] italic opacity-80 border-l-4 border-blue-400 cursor-pointer hover:bg-black/20 dark:hover:bg-white/20 transition"
                 onclick="window.ChatModule.scrollToMessage('${msg.reply_to_id}')">
                <span class="font-bold block text-[10px] mb-0.5">Trả lời:</span>
                ${msg.reply_content}
                ${msg.reply_media_url ? '<span class="text-[9px] text-blue-500 block">[Hình ảnh]</span>' : ''}
            </div
        `;
    }

    // Xử lý hiển thị Ảnh 
    let mediaHtml = '';
    if (msg.media_url) {
        // Nếu link bắt đầu bằng 'uploads/', ta phải nối với domain của Backend
        const backendUrl = "http://localhost:3000"; // Thay bằng BASE_URL của bạn

        const fullImageUrl = msg.media_url.startsWith('http')
            ? msg.media_url
            : `${backendUrl}/${msg.media_url}`;

        // Chỉnh sửa lại việc gửi ảnh chiếm bao nhiêu khung chat -> Tăng max-width
        mediaHtml = `
            <div class="mb-2 overflow-hidden rounded-xl">
                <img src="${fullImageUrl}" 
                    class="max-w-full md:max-w-[400px] h-auto object-cover cursor-pointer hover:opacity-95 transition" 
                    onclick="window.open('${fullImageUrl}')"
                    onerror="this.src='https://placehold.co/300x200?text=Ảnh+không+tồn+tại'">
            </div>
        `;
    }

    // Xử lý Cảm xúc (Reactions)
    let reactionsHtml = '';
    if (msg.reactions) {
        // Đảm bảo reactions là một Object
        const reactionsObj = typeof msg.reactions === 'string' ? JSON.parse(msg.reactions) : msg.reactions;

        if (Object.keys(reactionsObj).length > 0) {
            reactionsHtml = `
                <div class="absolute -bottom-2 ${isSender ? 'right-2' : 'left-2'} flex gap-1 bg-white dark:bg-slate-800 border dark:border-slate-700 px-1.5 py-0.5 rounded-full shadow-sm z-10 text-[10px]">
                    ${Object.entries(reactionsObj).map(([emoji, users]) => `
                        <span class="flex items-center gap-0.5 font-bold text-slate-500 cursor-pointer hover:scale-110 transition"
                              onclick="window.ChatModule.sendReaction('${msg.id}', '${emoji}')">
                            ${emoji} <span class="opacity-70">${users.length}</span>
                        </span>
                    `).join('')}
                </div>
            `;
        }
    }

    // Logic nhận diện Card chia sẻ
    if (content.startsWith('[SHARE_CARD|')) {
        const parts = content.replace('[', '').replace(']', '').split('|');
        const shareType = parts[1] || 'LINK';
        const shareLink = parts[2] || '#';
        const shareAvatar = parts[3] && parts[3] !== 'default' ? getAvatarUrl(parts[3], 'Other') : null;
        const shareName = parts[4] || (shareType === 'PROFILE' ? 'Trang cá nhân' : 'Bài đăng');

        const isProfile = shareType === 'PROFILE';
        const icon = isProfile ? '👤' : '📝';

        // Layout Rich Card
        content = `
            <div class="share-card cursor-pointer min-w-[240px] group/card" 
                 onclick="window.ChatModule.handleShareClick('${shareLink}')">
                <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-600 hover:bg-blue-50 transition">
                    <div class="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-slate-200 border">
                        ${shareAvatar
                ? `<img src="${shareAvatar}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full flex items-center justify-center text-xl">${icon}</div>`
            }
                    </div>
                    <div class="overflow-hidden flex-1">
                         <div class="text-[9px] uppercase tracking-widest text-blue-500 font-bold mb-0.5">Chia sẻ ${isProfile ? 'Profile' : 'Bài viết'}</div>
                         <div class="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">${shareName}</div>
                    </div>
                </div>
            </div>
        `;
    }

    // Hiển thị nickname cho group chat
    let nicknameHtml = '';
    if (isGroupChat && isFirstInGroup && !isSender) {
        nicknameHtml = `<div class="text-[10px] text-gray-500 dark:text-gray-400 ml-1 mb-0.5">${msg.display_name || msg.sender_name}</div>`;
    }

    return `
        <div id="message-${msg.id}" class="flex flex-col ${isSender ? 'items-end' : 'items-start'} w-full animate-fade-in group mb-0.5 relative">
            <div class="flex items-end gap-0 max-w-[90%] md:max-w-[75%] ${isSender ? 'flex-row-reverse' : ''}">
                ${avatarHtml}
                
                <div class="flex flex-col ${isSender ? 'items-end' : 'items-start'}">
                    ${nicknameHtml} 
                    <div class="relative ${bubbleClass} ${content.includes('share-card') ? 'p-1.5' : 'px-4 py-2.5'} text-sm leading-relaxed transition hover:shadow-md">
                        ${replyHtml}
                        ${mediaHtml}
                        <div class="break-words">${content}</div>
                        ${reactionsHtml}
                    </div>
                </div>

                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 self-center px-2 relative reaction-btn-container">
                    <button onclick="window.ChatModule.setReply('${msg.id}', 'Trả lời tin nhắn...')" 
                            class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-xs text-gray-400" title="Trả lời">
                        💬
                    </button>
                    ${(() => {
            // Tính toán phản ứng của tôi để truyền vào
            let myReaction = '';
            if (msg.reactions) {
                const reactionsObj = typeof msg.reactions === 'string' ? JSON.parse(msg.reactions) : msg.reactions;
                for (const [emoji, users] of Object.entries(reactionsObj)) {
                    if (users.includes((window.currentUser.id || window.currentUser.userId))) {
                        myReaction = emoji;
                        break;
                    }
                }
            }
            return `
                        <button onclick="window.ChatModule.showReactions('${msg.id}', event, '${myReaction}')" 
                                class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-xs text-gray-400 ${myReaction ? 'text-red-500' : ''}" title="Thả cảm xúc">
                            ❤️
                        </button>`;
        })()}
                </div>
            </div>
        </div>
    `;
}

// CÁC HÀM XỬ LÝ (EXPORT)
export function toggleChatSettings() {// Hiển thị/ẩn sidebar cài đặt
    const sidebar = document.getElementById('chatSettingsSidebar');
    if (sidebar) sidebar.classList.toggle('hidden');
}

export async function handleBlock(targetId, action) {// Xử lý chặn
    const confirmMsg = action === 'block' ? "Chặn người này? Họ sẽ không thể gửi tin nhắn cho bạn." : "Bỏ chặn người này?";
    if (!confirm(confirmMsg)) return;

    try {
        const res = await apiFetch(`/chat/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: (window.currentUser.id || window.currentUser.userId), target_id: targetId, action })
        });
        if (res && res.ok) {
            showToast(action === 'block' ? "Đã chặn" : "Đã bỏ chặn", "info");
            toggleChatSettings();
            await openChat(targetId, document.getElementById('chatHeaderName').innerText, false);
        }
    } catch (e) { showToast("Lỗi kết nối", "error"); }
}

export async function updateAlias() {// Cập nhật biệt danh
    toggleChatSettings();
    showInputModal("Đặt biệt danh", "Nhập biệt danh...", "", async (newAlias) => {
        try {
            const res = await apiFetch(`/chat/settings/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: (window.currentUser.id || window.currentUser.userId),
                    target_id: currentChatTarget,
                    field: 'alias',
                    value: newAlias,
                    is_group: window.isCurrentChatGroup
                })
            });
            if (res && res.ok) {
                document.getElementById('chatHeaderName').innerText = newAlias;
                showToast("Đã cập nhật!");
                loadChatHistory(currentChatTarget, window.isCurrentChatGroup);
            }
        } catch (e) { showToast("Lỗi hệ thống", "error"); }
    });
}

export async function updateGroupName(groupId) {// Cập nhật tên nhóm
    toggleChatSettings();
    showInputModal("Đổi tên nhóm", "Nhập tên mới cho nhóm...", "", async (newName) => {
        try {
            const res = await apiFetch(`/chat/settings/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: (window.currentUser.id || window.currentUser.userId),
                    target_id: groupId,
                    field: 'name',
                    value: newName,
                    is_group: true
                })
            });
            if (res && res.ok) {
                document.getElementById('chatHeaderName').innerText = newName;
                showToast("Đã đổi tên nhóm!");
            }
        } catch (e) { showToast("Lỗi kết nối", "error"); }
    });
}

function showInputModal(title, placeholder, currentValue, onConfirm) {// Hiển thị modal nhập 
    const existing = document.getElementById('chatInputModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'chatInputModal';
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-80 animate-scale-in border dark:border-slate-700">
            <h3 class="text-sm font-bold uppercase text-slate-500 mb-3">${title}</h3>
            <div class="relative">
                <input type="text" id="chatInputModalValue" value="${currentValue || ''}" placeholder="${placeholder}" 
                       class="w-full p-3 bg-slate-100 dark:bg-slate-900 border-none rounded-xl mb-4 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white font-medium">
            </div>
            <div class="flex justify-end gap-2">
                <button id="chatInputModalCancel" class="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition">Hủy</button>
                <button id="chatInputModalConfirm" class="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition">Lưu</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const input = document.getElementById('chatInputModalValue');
    input.focus();
    input.select();

    const close = () => {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.remove(), 200);
    };

    document.getElementById('chatInputModalCancel').onclick = close;
    document.getElementById('chatInputModalConfirm').onclick = () => {
        const val = input.value.trim();
        if (val) {
            onConfirm(val);
            close();
        }
    };

    input.onkeyup = (e) => {
        if (e.key === 'Enter') document.getElementById('chatInputModalConfirm').click();
    };

    modal.onclick = (e) => {
        if (e.target === modal) close();
    }
}

export async function deleteChatConfirm(targetId) {
    toggleChatSettings();
    if (!confirm("Xóa lịch sử chat? Hành động này không thể hoàn tác.")) return;
    try {
        const res = await apiFetch(`/chat/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: (window.currentUser.id || window.currentUser.userId), target_id: targetId })
        });
        if (res.ok) {
            showToast("Đã xóa sạch tin nhắn!");
            document.getElementById('messageList').innerHTML = "";
            switchChatTab('friends');
        }
    } catch (e) { showToast("Lỗi khi xóa", "error"); }
}

// QUẢN LÝ THÀNH VIÊN NHÓM
export async function viewMembers(groupId) {// Hiển thị thành viên nhóm
    toggleChatSettings();
    try {
        const res = await apiFetch(`/chat/group/${groupId}/members`);
        if (!res) return;
        const data = await res.json();
        if (!data.success) return;

        const myRole = data.members.find(m => String(m.id) === String((window.currentUser.id || window.currentUser.userId)))?.role;
        const isAdmin = (myRole === 'admin');

        let html = data.members.map(m => `
            <div class="flex justify-between items-center p-3 border-b hover:bg-slate-50 transition">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-sm text-slate-700">${m.alias || m.full_name}</span>
                    ${m.role === 'admin' ? '<span class="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black uppercase shadow-sm">Admin</span>' : ''}
                </div>
                <div class="flex gap-2">
                    <button onclick="window.ChatModule.promptMemberAlias('${groupId}', '${m.id}')" class="text-xs text-blue-500">Biệt danh</button>
                    ${(isAdmin && String(m.id) !== String((window.currentUser.id || window.currentUser.userId))) ?
                `<button onclick="window.ChatModule.removeMember('${groupId}', '${m.id}')" class="text-xs text-red-500 font-bold">Gỡ</button>` : ''}
                </div>
            </div>
        `).join('');

        window.openModal('Thành viên Nhóm', `<div class="p-2 divide-y border rounded-xl bg-white">${html}</div>`);
    } catch (e) { showToast("Lỗi tải danh sách", "error"); }
}

export async function addMemberPrompt(groupId) {
    console.log('[DEBUG] Opening addMemberPrompt for Group:', groupId);
    toggleChatSettings();
    selectedMembers = [];
    window.openModal('Thêm thành viên (Bạn bè)', `
        <div class="p-4 space-y-4">
             <div class="relative">
                 <input type="text" id="groupMemberSearchInput" placeholder="Tìm kiếm bạn bè..." 
                        onkeyup="window.ChatModule.handleGroupFriendSearch(this.value)"
                        class="w-full p-3 pl-10 border bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white rounded-xl outline-none text-sm focus:bg-white dark:focus:bg-slate-800 transition focus:ring-2 focus:ring-blue-500">
                 <span class="absolute left-3 top-3 text-slate-400">🔍</span>
            </div>

            <div id="selectedContainer" class="flex flex-wrap gap-2 p-3 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl min-h-[50px] bg-slate-50 dark:bg-slate-800 text-xs italic text-slate-400">
                Chọn người muốn thêm...
            </div>

            <div id="friendInviteList" class="max-h-60 overflow-y-auto border border-slate-100 dark:border-slate-700 rounded-xl divide-y dark:divide-slate-700 bg-white dark:bg-slate-800 custom-scrollbar">
                <div class="p-4 text-center text-slate-400 text-sm">Đang tải danh sách...</div>
            </div>

            <button onclick="window.ChatModule.submitAddMembers('${groupId}')" 
                    class="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-none transition transform hover:scale-[1.02]">
                Xác nhận thêm
            </button>
        </div>
    `);
    loadFriendsNotInGroup(groupId);
}

async function loadFriendsNotInGroup(groupId) {
    const listEl = document.getElementById('friendInviteList');
    if (!listEl) return;
    try {
        const userId = (window.currentUser.id || window.currentUser.userId);
        const res = await apiFetch(`/chat/friends-not-in-group?user_id=${userId}&group_id=${groupId}&t=${Date.now()}`);
        if (!res) return;
        const data = await res.json();
        console.log('[DEBUG] Friends list response:', data);

        if (!data.success) {
            showToast(`Lỗi: ${data.message || 'Server error'}`, 'error');
            listEl.innerHTML = `<div class="p-6 text-center text-red-500">${data.message || 'Lỗi server'}</div>`;
            return;
        }

        // Use the shared variable so search works
        groupCreationFriendsList = data.friends || [];
        console.log('[DEBUG] groupCreationFriendsList count:', groupCreationFriendsList.length);

        if (groupCreationFriendsList.length === 0) {
            listEl.innerHTML = `<div class="p-6 text-center text-sm italic text-gray-500">Bạn chưa có bạn bè nào để thêm (hoặc chưa đồng bộ).</div>`;
            return;
        }

        // Helper function from create-group flow works here too
        renderGroupFriendList(groupCreationFriendsList);

    } catch (e) {
        listEl.innerHTML = `<div class="p-4 text-center text-red-400 text-sm">Lỗi tải danh sách.</div>`;
    }
}

export async function removeMember(groupId, userIdToRemove) {
    if (!confirm("Gỡ người này? Nếu nhóm còn < 3 người sẽ giải tán.")) return;
    try {
        const res = await apiFetch(`/chat/group/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, userIdToRemove, requestorId: (window.currentUser.id || window.currentUser.userId) })
        });
        if (!res) return;
        const data = await res.json();
        if (data.success) {
            showToast(data.groupDeleted ? "Nhóm đã giải tán." : "Đã gỡ.");
            window.closeModal();
            if (data.groupDeleted) window.switchView('home');
            else loadChatHistory(groupId, true);
        }
    } catch (e) { showToast("Lỗi hệ thống", "error"); }
}

export async function leaveGroup(groupId) {
    toggleChatSettings();
    if (!confirm("Bạn muốn rời nhóm?")) return;
    await removeMember(groupId, (window.currentUser.id || window.currentUser.userId));
}

export async function promptMemberAlias(groupId, memberId) {
    const alias = prompt("Biệt danh cho thành viên này:");
    if (!alias) return;
    try {
        const res = await apiFetch(`/chat/settings/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_id: groupId, field: 'alias', value: alias, is_group: true, member_id: memberId })
        });
        if (res && res.ok) { showToast("Đã đổi!"); window.closeModal(); loadChatHistory(groupId, true); }
    } catch (e) { showToast("Lỗi"); }
}

// CORE LOGIC: GỬI TIN & SOCKET & TẠO NHÓM
/**
 * @desc Gửi tin nhắn (bao gồm văn bản, ảnh, và reply)
 */
export async function sendMessage() {
    const input = document.getElementById('chatMessageInput');
    const mediaInput = document.getElementById('chatMediaInput');
    const message = input.value.trim();

    // 1. Kiểm tra điều kiện cơ bản: phải có mục tiêu chat và (nội dung chữ hoặc file)
    if (!currentChatTarget) return;
    if (!message && (!mediaInput.files || !mediaInput.files[0])) return;

    // 2. Kiểm tra trạng thái bị chặn (cho chat 1-1)
    if (!window.isCurrentChatGroup && currentChatSettings.is_blocked) {
        showToast("Hội thoại đang bị chặn", "error");
        return;
    }

    let mediaUrlForPayload = null;

    try {
        // 3. Xử lý Upload ảnh/media nếu người dùng có chọn file
        if (mediaInput.files && mediaInput.files[0]) {
            const formData = new FormData();
            formData.append('image', mediaInput.files[0]);

            // Gửi kèm type=message và user_id qua query string để Multer lưu đúng thư mục messages
            const uploadRes = await apiFetch(`/chat/upload-media?type=message&user_id=${(window.currentUser.id || window.currentUser.userId)}`, {
                method: 'POST',
                body: formData
            });

            const uploadData = await uploadRes.json();

            if (uploadData.success) {
                /**
                 * Ta lấy 'relativePath' (ví dụ: uploads/messages/abc.png) để gửi qua Socket.
                 * Việc này giúp Database lưu trữ đường dẫn tương đối ổn định.
                 */
                mediaUrlForPayload = uploadData.data.relativePath;
            } else {
                throw new Error(uploadData.message || "Không thể tải ảnh lên hệ thống");
            }
        }

        // 4. Chuẩn bị dữ liệu Payload để gửi qua Socket.io
        const payload = {
            senderId: (window.currentUser.id || window.currentUser.userId),
            receiverId: currentChatTarget,
            message: message,
            mediaUrl: mediaUrlForPayload, // Đường dẫn ảnh (nếu có)
            replyToId: replyingTo ? replyingTo.id : null,
            isGroup: window.isCurrentChatGroup || false
        };

        // Gửi sự kiện realtime qua Socket
        io.emit('send_message', payload);

        // 5. Reset trạng thái giao diện sau khi gửi thành công
        input.value = '';
        if (window.ChatModule.clearImage) window.ChatModule.clearImage();
        if (window.ChatModule.cancelReply) window.ChatModule.cancelReply();

        // Đưa con trỏ chuột về lại ô nhập liệu
        input.focus();

    } catch (e) {
        console.error("Lỗi quy trình gửi tin nhắn:", e);
        showToast(e.message || "Gặp lỗi khi gửi tin nhắn", "error");
    }
}

/**
 * @desc Xem trước ảnh trước khi gửi
 */
export function previewImage(event) {
    const file = event.target.files[0];
    const container = document.getElementById('imagePreviewContainer');
    const img = document.getElementById('imagePreview');

    if (file) {
        if (file.size > 5 * 1024 * 1024) {
            showToast("Ảnh không được vượt quá 5MB", "error");
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
            container.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
}

/**
 * @desc Xóa ảnh đang chờ gửi
 */
export function clearImage() {
    const mediaInput = document.getElementById('chatMediaInput');
    const container = document.getElementById('imagePreviewContainer');
    if (mediaInput) mediaInput.value = '';
    if (container) container.classList.add('hidden');
}

/**
 * @desc Thiết lập trạng thái trả lời (Reply) một tin nhắn
 */
export function setReply(id, text) {
    replyingTo = { id, text };
    const preview = document.getElementById('replyPreview');
    const previewText = document.getElementById('replyPreviewText');

    if (preview && previewText) {
        previewText.innerText = text;
        preview.classList.remove('hidden');
        document.getElementById('chatMessageInput').focus();
    }
}

/**
 * @desc Hủy trạng thái trả lời
 */
export function cancelReply() {
    replyingTo = null;
    const preview = document.getElementById('replyPreview');
    if (preview) preview.classList.add('hidden');
}

/**
 * @desc Hiển thị Modal chọn cảm xúc (Reaction)
 */
/**
 * @desc Hiển thị Modal chọn cảm xúc (Reaction)
 */
export function showReactions(messageId, event, currentReaction) {
    // Remove existing popups
    document.querySelectorAll('.reaction-picker-popup').forEach(el => el.remove());

    const emojis = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
    const picker = document.createElement('div');
    picker.className = 'reaction-picker-popup absolute z-50 bg-white dark:bg-slate-800 shadow-xl border dark:border-slate-700 rounded-full flex gap-2 p-2 animate-scale-in';
    picker.innerHTML = emojis.map(e => `
        <span onclick="window.ChatModule.sendReaction('${messageId}', '${e}', this)" 
              class="cursor-pointer hover:scale-125 transition-transform text-xl w-8 h-8 flex items-center justify-center rounded-full ${e === currentReaction ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500' : ''}">
            ${e}
        </span>
    `).join('');

    // Positioning
    const btn = event.currentTarget || event.target;
    const rect = btn.getBoundingClientRect();

    // Append to body to avoid overflow issues
    document.body.appendChild(picker);

    // Position above the button
    const top = rect.top - 60 + window.scrollY;
    const left = rect.left + (rect.width / 2) - 100; // Centered roughly

    picker.style.top = `${top}px`;
    picker.style.left = `${Math.max(10, left)}px`; // Prevent going off-screen left

    // Click outside to close
    const closeHandler = (e) => {
        if (!picker.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            picker.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

/**
 * @desc Gửi cảm xúc lên server và thông báo qua Socket
 */
export async function sendReaction(messageId, emoji, el) {
    try {
        const res = await apiFetch(`/chat/react`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messageId,
                userId: (window.currentUser.id || window.currentUser.userId),
                emoji
            })
        });
        const data = await res.json();

        if (data.success) {
            // Thông báo cho mọi người trong phòng chat cập nhật reaction
            io.emit('send_reaction', {
                messageId,
                receiverId: currentChatTarget,
                reactions: data.reactions,
                isGroup: window.isCurrentChatGroup
            });
            // Close picker
            document.querySelectorAll('.reaction-picker-popup').forEach(p => p.remove());
        }
    } catch (e) {
        showToast("Lỗi thả cảm xúc", "error");
    }
}

/**
 * @desc Cuộn tới tin nhắn
 */
export function scrollToMessage(messageId) {
    const el = document.getElementById(`message-${messageId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight effect
        el.querySelector('.relative')?.classList.add('ring-2', 'ring-blue-400');
        setTimeout(() => el.querySelector('.relative')?.classList.remove('ring-2', 'ring-blue-400'), 2000);
    } else {
        showToast("Tin nhắn gốc không có trong danh sách hiện tại.", "info");
    }
}

export function displayMessage(data, isSelf) {// Hiển thị tin nhắn
    const messageList = document.getElementById('messageList');
    if (!messageList) return;
    const isCurrent = (String(data.receiverId) === String(currentChatTarget) || String(data.senderId) === String(currentChatTarget));
    if (isCurrent || isSelf) {
        messageList.innerHTML += renderMessage({
            sender_id: data.senderId,
            sender_name: data.sender_name,
            display_name: data.display_name,
            message: data.message,
            created_at: new Date()
        });
        messageList.scrollTop = messageList.scrollHeight;
        if (!isSelf) markChatAsReadAPI(data.senderId);
    }
}

/**
 * @desc Lắng nghe các sự kiện Socket.io cho Chat
 */
export function initSocketListeners() {
    if (!io) return;

    // Lắng nghe tin nhắn mới
    io.off('receive_message').on('receive_message', (data) => {
        const isMatch = (String(data.receiverId) === String(currentChatTarget) ||
            String(data.senderId) === String(currentChatTarget));// Kiểm tra tin nhắn có phải là tin nhắn trong phòng chat hiện tại

        if (isMatch) {
            // Thêm tin nhắn vào giao diện (Hàm renderMessage cần được định nghĩa ở ngoài)
            const messageList = document.getElementById('messageList');
            if (messageList) {
                messageList.innerHTML += renderMessage(data);
                messageList.scrollTop = messageList.scrollHeight;

                // Nếu mình là người nhận, đánh dấu đã đọc
                if (String(data.senderId) !== String((window.currentUser.id || window.currentUser.userId))) {
                    markChatAsReadAPI(data.senderId);
                }
            }
        }
    });

    // Lắng nghe cập nhật cảm xúc (Reactions)
    io.off('update_reactions').on('update_reactions', (data) => {
        // Tải lại lịch sử hoặc cập nhật DOM phần tử tin nhắn cụ thể
        if (window.ChatModule.loadChatHistory) {
            loadChatHistory(currentChatTarget, window.isCurrentChatGroup);
        }
    });
}

let groupCreationFriendsList = [];

export function showCreateGroupModal() {
    selectedMembers = [];
    window.openModal('Tạo nhóm mới (≥ 3 người)', `
        <div class="p-4 space-y-4">
            <input type="text" id="groupNameInput" placeholder="Tên nhóm..." 
                   class="w-full p-3 border bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-white rounded-xl outline-none transition focus:ring-2 focus:ring-blue-500">
            
            <div class="relative">
                 <input type="text" id="groupMemberSearchInput" placeholder="Tìm kiếm bạn bè..." 
                        onkeyup="window.ChatModule.handleGroupFriendSearch(this.value)"
                        class="w-full p-3 pl-10 border bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white rounded-xl outline-none text-sm focus:bg-white dark:focus:bg-slate-800 transition focus:ring-2 focus:ring-blue-500">
                 <span class="absolute left-3 top-3 text-slate-400">🔍</span>
            </div>

            <!-- Selected Members Container -->
            <div id="selectedContainer" class="flex flex-wrap gap-2 p-3 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl min-h-[50px] bg-slate-50 dark:bg-slate-800 text-xs italic text-slate-400">
                Chưa chọn thành viên nào...
            </div>
            
            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2">Danh sách bạn bè</div>
            <div id="friendInviteList" class="max-h-60 overflow-y-auto border border-slate-100 dark:border-slate-700 rounded-xl divide-y dark:divide-slate-700 bg-white dark:bg-slate-800 custom-scrollbar">
                <div class="p-4 text-center text-slate-400 text-sm">Đang tải danh sách...</div>
            </div>
            
            <button onclick="window.ChatModule.submitCreateGroup()" 
                    class="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 dark:shadow-none transition transform hover:scale-[1.02]">
                Bắt đầu trò chuyện nhóm
            </button>
        </div>
    `);
    loadFriendsForGroup();
}

async function loadFriendsForGroup() {// Lấy danh sách bạn bè để tạo nhóm
    try {
        const res = await apiFetch(`/users/friends?user_id=${(window.currentUser.id || window.currentUser.userId)}`);
        if (!res || !res.ok) throw new Error("Failed to load");
        groupCreationFriendsList = await res.json();

        // Render initial list
        renderGroupFriendList(groupCreationFriendsList);
    } catch (e) {
        const listEl = document.getElementById('friendInviteList');
        if (listEl) listEl.innerHTML = `<div class="p-4 text-center text-red-400 text-sm">Lỗi tải danh sách bạn bè.</div>`;
    }
}

// Xử lý tìm kiếm bạn bè trong danh sách tạo nhóm
export function handleGroupFriendSearch(query) {
    if (!query) {
        renderGroupFriendList(groupCreationFriendsList);
        return;
    }
    const lower = query.toLowerCase();
    const filtered = groupCreationFriendsList.filter(f =>
        f.full_name.toLowerCase().includes(lower) ||
        (f.username && f.username.toLowerCase().includes(lower))
    );// Lọc danh sách bạn bè
    renderGroupFriendList(filtered);
}

function renderGroupFriendList(list) {// Hiển thị danh sách bạn bè trong modal tạo nhóm
    const listEl = document.getElementById('friendInviteList');
    if (!listEl) return;

    if (!list || list.length === 0) {
        listEl.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm italic">Không tìm thấy bạn bè phù hợp.</div>`;
        return;
    }

    listEl.innerHTML = list.map(f => {
        const isSelected = selectedMembers.some(m => m.id == f.id);
        const isMember = !!f.is_member; // Flag from backend
        const displayAvatar = f.avatar_url || f.avatar;

        return `
            <div onclick="${isMember ? '' : `window.ChatModule.toggleSelectMember('${f.id}', '${f.full_name}')`}" 
                 class="flex items-center gap-3 p-3 transition 
                 ${isMember ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900/30' : 'cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700'} 
                 ${isSelected ? 'bg-blue-50 dark:bg-slate-700/50' : ''}">
                
                <div class="relative">
                    <img src="${getAvatarUrl(displayAvatar)}" class="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-600">
                    ${isSelected ? `
                        <div class="absolute -right-1 -bottom-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] border-2 border-white dark:border-slate-800 animate-scale-in">
                            ✓
                        </div>
                    ` : ''}
                    ${isMember ? `
                        <div class="absolute -right-1 -bottom-1 bg-slate-400 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] border-2 border-white dark:border-slate-800">
                            in
                        </div>
                    ` : ''}
                </div>

                <div class="flex-1">
                    <div class="text-sm font-bold text-slate-700 dark:text-slate-200">${f.full_name}</div>
                    ${f.username ? `<div class="text-xs text-slate-500 dark:text-slate-400">@${f.username}</div>` : ''}
                </div>

                ${isMember ? '<span class="text-slate-500 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">Đã tham gia</span>' : ''}
                ${isSelected ? '<span class="text-blue-600 text-xs font-bold bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-lg">Đã chọn</span>' : ''}
            </div>
        `;
    }).join('');
}

export function toggleSelectMember(id, name) {
    // 0. Check if this member is already in group (safety check)
    const friendObj = groupCreationFriendsList.find(x => x.id == id);
    if (friendObj && friendObj.is_member) return;

    // 1. Update logic
    const idx = selectedMembers.findIndex(m => m.id == id);
    if (idx === -1) {
        selectedMembers.push({ id, name });
    } else {
        selectedMembers.splice(idx, 1);
    }

    // 2. Update Selected Container UI
    const container = document.getElementById('selectedContainer');
    if (selectedMembers.length === 0) {
        container.innerHTML = `Chưa chọn thành viên nào...`;
        container.classList.add('italic', 'text-slate-400');
    } else {
        container.classList.remove('italic', 'text-slate-400');
        container.innerHTML = selectedMembers.map(m => {
            // Find full object for avatar if possible
            const friendObj = groupCreationFriendsList.find(x => x.id == m.id);
            const avatarSrc = friendObj ? getAvatarUrl(friendObj.avatar_url) : null;

            return `
            <div class="relative flex flex-col items-center group animate-fade-in" title="${m.name}">
                <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border-2 border-white dark:border-slate-600 shadow-sm">
                     ${avatarSrc ? `<img src="${avatarSrc}" class="w-full h-full object-cover">` : `<span class="font-bold text-xs">${m.name[0].toUpperCase()}</span>`}
                </div>
                <div class="absolute -top-1 -right-1 bg-slate-500 hover:bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer transition shadow-md" 
                     onclick="event.stopPropagation(); window.ChatModule.toggleSelectMember('${m.id}', '${m.name}')">✕</div>
            </div>
        `}).join('');
    }

    // 3. Re-render list to update checks
    const searchInput = document.getElementById('groupMemberSearchInput');
    const query = searchInput ? searchInput.value : '';
    handleGroupFriendSearch(query);
}

export async function submitCreateGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    if (!name || selectedMembers.length < 2) return showToast('Nhóm cần tên và ít nhất 3 người (gồm bạn)', 'error');
    try {
        const res = await apiFetch(`/chat/group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creator_id: (window.currentUser.id || window.currentUser.userId), name, member_ids: selectedMembers.map(m => m.id) })
        });
        if (res && res.ok) { showToast('Thành công!'); window.closeModal(); switchChatTab('groups'); }
    } catch (err) { showToast('Lỗi khi tạo nhóm', 'error'); }
}

export async function submitAddMembers(groupId) {
    if (selectedMembers.length === 0) return showToast("Chọn ít nhất 1 người!");
    try {
        const res = await apiFetch(`/chat/group/add-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, member_ids: selectedMembers.map(m => m.id) })
        });
        if (res && res.ok) { showToast("Thêm thành công!"); window.closeModal(); loadChatHistory(groupId, true); }
    } catch (e) { showToast("Lỗi"); }
}

export async function markChatAsReadAPI(targetId) {
    try {
        await apiFetch(`/chat/mark-read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: (window.currentUser.id || window.currentUser.userId), target_id: targetId })
        });
    } catch (err) { }
}

export function showEmojiPicker() { showToast('Emoji: 😀 😁 😂 🤣 😃 😄', 'info'); }

// EXPORTS TO GLOBAL
/**
 * @desc Xử lý click vào Card chia sẻ - CHÚ Ý: Đã chuyển vào object ChatModule
 */
export async function handleShareClick(link) {
    // 1. Lấy phần sau dấu #. Ví dụ: "post/123" hoặc "profile/45"
    const hash = link.includes('#') ? link.split('#')[1] : null;
    if (!hash) return;

    // 2. Tách loại và ID. Sử dụng filter để loại bỏ các chuỗi rỗng do dư dấu gạch chéo
    const parts = hash.split('/').filter(p => p);
    if (parts.length < 2) return;

    const type = parts[0]; // 'post' hoặc 'profile'
    const id = parts[1];   // ID tương ứng

    if (type === 'profile') {
        window.switchView('profile', id);
    } else if (type === 'post') {
        try {
            const res = await apiFetch(`/posts/${id}/check`);
            if (!res) return;
            const data = await res.json();

            // Kiểm tra bài viết có tồn tại không
            if (!data.exists) {
                return showToast("Bài viết không còn tồn tại!", "error");
            }

            // Kiểm tra quyền riêng tư
            if (data.visibility === 1 && String(data.ownerId) !== String((window.currentUser.id || window.currentUser.userId))) {
                return showToast("Bài viết này đã được chuyển sang chế độ riêng tư.", "info");
            }

            if (data.groupId) {
                // Post trong Group - Cần kiểm tra group còn tồn tại không
                try {
                    const groupRes = await apiFetch(`/groups/${data.groupId}?user_id=${(window.currentUser.id || window.currentUser.userId)}`);

                    if (!groupRes || !groupRes.ok) {
                        // Group đã bị xóa hoặc không tồn tại
                        return showToast("Page/Group không còn tồn tại!", "error");
                    }

                    const groupData = await groupRes.json();
                    const membershipStatus = groupData.membership_status; // 'creator', 'super_admin', 'admin', 'member', 'pending', 'not_member'

                    // Kiểm tra membership
                    const isMember = ['creator', 'super_admin', 'admin', 'member'].includes(membershipStatus);

                    if (isMember) {
                        // Là thành viên - chuyển đến group và scroll đến bài viết
                        window.switchView('group', data.groupId);
                        setTimeout(() => scrollToPost(id), 1000);
                    } else if (membershipStatus === 'pending') {
                        // Đang chờ duyệt
                        window.switchView('group', data.groupId);
                        showToast("Yêu cầu tham gia của bạn đang chờ duyệt. Hãy tham gia để xem bài đăng!", "info");
                    } else {
                        // Không phải thành viên - chuyển đến trang group để hiển thị nút tham gia
                        window.switchView('group', data.groupId);
                        showToast("Hãy tham gia Page/Group để xem chi tiết bài đăng!", "info");
                    }
                } catch (groupErr) {
                    console.error("Lỗi kiểm tra group:", groupErr);
                    showToast("Page/Group không còn tồn tại!", "error");
                }
            } else {
                // Post cá nhân - chuyển đến profile
                window.switchView('profile', data.ownerId);
                setTimeout(() => scrollToPost(id), 1000);
            }
        } catch (e) {
            console.error("Lỗi chia sẻ:", e);
            showToast("Lỗi kiểm tra dữ liệu", "error");
        }
    }
}

// Cập nhật hàm scrollToPost để hoạt động ổn định hơn
function scrollToPost(postId) {
    const el = document.getElementById(`post-${postId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');
        setTimeout(() => el.classList.remove('ring-4', 'ring-blue-500'), 3000);
    } else {
        // Nếu chưa thấy element (có thể do đang render), thử lại sau 500ms
        console.log(`Đang đợi bài đăng ${postId} hiển thị...`);
        setTimeout(() => {
            const retryEl = document.getElementById(`post-${postId}`);
            if (retryEl) {
                retryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                retryEl.classList.add('ring-4', 'ring-blue-500');
                setTimeout(() => retryEl.classList.remove('ring-4', 'ring-blue-500'), 3000);
            } else {
                // Sau 2 lần thử vẫn không tìm thấy -> Bài viết đã bị xóa
                showToast("Bài đăng không còn tồn tại!", "error");
            }
        }, 500);
    }
}

//XỬ LÝ UPLOAD AVATAR NHÓM CHAT
export async function handleChatAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentChatTarget) return;

    const formData = new FormData();
    formData.append('type', 'group_chat');
    formData.append('user_id', (window.currentUser.id || window.currentUser.userId));
    formData.append('avatar', file);

    try {
        const res = await fetch(`${window.API_URL}/chat/group/${currentChatTarget}/avatar`, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await res.json();
        if (data.success) {
            showToast('Đổi ảnh nhóm thành công!', 'success');
            // Cập nhật ngay ID avatar trên giao diện nếu có thể
            const avatarEl = document.getElementById('chatHeaderAvatar');
            if (avatarEl && data.avatarUrl) avatarEl.src = `${window.IO_URL}/${data.avatarUrl}`;

            // Reload lại chat settings để sync
            loadChatHistory(currentChatTarget, true);
            // [FIX] Cập nhật lại danh sách bên trái
            renderChatList();
        } else {
            showToast(data.message || 'Lỗi upload ảnh.', 'error');
        }
    } catch (e) {
        showToast('Lỗi kết nối server.', 'error');
        console.error(e);
    } finally {
        event.target.value = '';
    }
}

window.ChatModule = {
    //xử lý tin nhắn
    displayMessage,
    sendMessage,
    markChatAsReadAPI,
    scrollToMessage,
    scrollToPost,
    //xử lý reply va chia se
    setReply,
    cancelReply,
    handleShareClick,
    //xử lý emoji
    showEmojiPicker,
    showReactions,
    sendReaction,
    //xử lý avatar va chat ảnh
    handleChatAvatarUpload,
    previewImage,
    clearImage,
    //xử lý tab chat
    switchChatTab,
    openChat,
    openFromHistory,
    //xử lý tìm kiếm va lọc
    handleChatSidebarSearch,
    toggleChatSearch,
    handleGroupFriendSearch,
    //lịch sử chat
    toggleRecentExpansion,
    toggleHistoryExpansion,
    deleteHistoryItemChat,
    clearHistoryChat,
    //quản lý nhóm
    showCreateGroupModal,
    submitCreateGroup,
    toggleSelectMember,
    viewMembers,
    removeMember,
    leaveGroup,
    addMemberPrompt,
    submitAddMembers,
    updateGroupName,
    //cài đặt và quyền riêng tư
    toggleChatSettings,
    updateAlias,
    promptMemberAlias,
    handleBlock,
    //trạng thái online realtime
    updateOnlineStatus,
};

document.addEventListener('DOMContentLoaded', initSocketListeners);