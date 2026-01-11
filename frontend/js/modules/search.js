import { API_URL, getAvatarUrl, apiFetch } from '../main.js';

// ============================================
// STATE VÀ MOCK
// ============================================

let searchTimeout;

// ============================================
// HANDLERS TÌM KIẾM
// ============================================

/** Tải lịch sử tìm kiếm (Real API) */
export async function handleSearchFocus() {
    const dropdown = document.getElementById('searchDropdown');
    const input = document.getElementById('globalSearchInput');
    if (!dropdown) return;

    dropdown.classList.remove('hidden');

    // Nếu có text tìm kiếm thì không hiển thị lịch sử mà hiển thị kết quả hiện tại
    if (input && input.value.trim().length > 0) {
        return;
    }

    try {
        const res = await apiFetch(`/search/history?userId=${window.currentUser.userId}`);
        const data = await res.json();
        const history = data.history || [];

        if (history.length > 0) {
            dropdown.innerHTML = `
                <div class="p-3 font-semibold text-secondary border-b border-base flex justify-between items-center">
                    <span>Lịch sử gần đây</span>
                    <button onclick="window.SearchModule.clearAllHistory()" class="text-[10px] text-blue-500 hover:underline">Xóa tất cả</button>
                </div>
                <div class="max-h-[400px] overflow-y-auto">
                    ${history.map(item => `
                        <div class="flex items-center justify-between p-2 hover:bg-gray-100 group transition">
                            <div class="flex-1 flex items-center cursor-pointer" onclick="window.SearchModule.clickHistoryItem('${item.item_id}', '${item.item_type}', '${item.item_name}')">
                                <span class="mr-3 text-lg">${item.item_type === 'profile' ? '👤' : item.item_type === 'post' ? '📰' : '👥'}</span>
                                <span class="text-sm font-medium text-slate-700">${item.item_name}</span>
                            </div>
                            <button onclick="window.SearchModule.deleteHistoryItem('${item.id}', event)" 
                                    class="p-1 px-2 text-slate-400 hover:text-red-500 transition">✕</button>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            dropdown.innerHTML = '<div class="p-4 text-center text-slate-400 text-sm italic">Chưa có lịch sử tìm kiếm gần đây.</div>';
        }
    } catch (err) {
        console.error("Error loading search history:", err);
        dropdown.innerHTML = '<div class="p-4 text-center text-red-400 text-sm">Lỗi tải lịch sử.</div>';
    }
}

/** Thêm vào lịch sử */
export async function addToHistory(itemId, itemType, itemName) {
    try {
        await apiFetch(`/search/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: window.currentUser.userId,
                itemId,
                itemType,
                itemName
            })
        });
    } catch (err) {
        console.error("Error adding search history:", err);
    }
}

/** Xóa 1 mục lịch sử */
export async function deleteHistoryItem(id, event) {
    if (event) event.stopPropagation();
    try {
        const res = await apiFetch(`/search/history/${id}?userId=${window.currentUser.userId}`, {
            method: 'DELETE'
        });
        if (res && res.ok) {
            handleSearchFocus(); // Tải lại UI
        }
    } catch (err) {
        console.error("Error deleting history item:", err);
    }
}

/** Xóa toàn bộ lịch sử */
export async function clearAllHistory() {
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử tìm kiếm?")) return;
    try {
        const res = await apiFetch(`/search/history?userId=${window.currentUser.userId}`, {
            method: 'DELETE'
        });
        if (res && res.ok) {
            handleSearchFocus();
        }
    } catch (err) {
        console.error("Error clearing history:", err);
    }
}

/** Chuyển view và lưu lịch sử */
export function clickHistoryItem(id, type, name) {
    addToHistory(id, type, name);
    window.switchView(type, id);

    // Clear và đóng dropdown sau khi chọn
    clearGlobalSearch();
}

/** Xóa nội dung tìm kiếm và đóng dropdown */
export function clearGlobalSearch() {
    const input = document.getElementById('globalSearchInput');
    const dropdown = document.getElementById('searchDropdown');
    if (input) input.value = '';
    if (dropdown) dropdown.classList.add('hidden');
}

/** Xử lý tìm kiếm khi người dùng nhập (Debounce) */
export function handleSearchInput(query) {
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;

    if (query.trim().length > 0) {
        dropdown.classList.remove('hidden');
        dropdown.innerHTML = '<div class="p-4 text-center"> <div class="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div> <div class="text-xs text-secondary italic">Đang tìm kiếm...</div> </div>';

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            fetchSearchResults(query);
        }, 300);

    } else {
        handleSearchFocus();
    }
}

/** Gọi API và Render kết quả tìm kiếm */
async function fetchSearchResults(query) {
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;

    try {
        // [MODIFIED] Sử dụng apiFetch để tự động đính kèm Token
        const userRes = await apiFetch(`/users/search?q=${query}`);
        const users = (userRes && userRes.ok) ? await userRes.json() : [];

        const groupRes = await apiFetch(`/groups/search?q=${query}`);
        const groups = (groupRes && groupRes.ok) ? await groupRes.json() : [];

        const postRes = await apiFetch(`/posts/search?q=${query}`);
        const posts = (postRes && postRes.ok) ? await postRes.json() : [];

        let html = '';

        if (users.length > 0) {
            html += renderUserResults(users);
            if (groups.length > 0 || posts.length > 0) html += '<hr class="border-base my-1">';
        }

        if (groups.length > 0) {
            html += renderGroupOrPageResults(groups);
            if (posts.length > 0) html += '<hr class="border-base my-1">';
        }

        if (posts.length > 0) {
            html += renderPostResults(posts);
        }

        if (html === '') {
            dropdown.innerHTML = `<div class="p-4 text-center text-secondary text-sm italic">Không tìm thấy kết quả nào cho "${query}".</div>`;
        } else {
            dropdown.innerHTML = html;
        }

    } catch (err) {
        console.error("Lỗi tìm kiếm:", err);
        dropdown.innerHTML = `<div class="p-4 text-center text-red-500 text-sm">Lỗi kết nối khi tìm kiếm.</div>`;
    }
}

/** Render phần Người dùng */
function renderUserResults(users) {
    let html = `<div class="p-3 font-semibold text-content border-b border-base text-xs uppercase tracking-widest text-slate-400">👤 Người dùng</div>`;
    users.slice(0, 5).forEach(user => {
        html += `
            <div class="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer text-content transition"
                 onclick="window.SearchModule.clickHistoryItem('${user.id}', 'profile', '${user.full_name}')">
                <div class="flex items-center gap-3">
                    ${getAvatarWithStatusHtml(user.id, user.avatar, user.gender, 'w-10 h-10')}
                    <div>
                        <div class="font-bold text-sm text-slate-700">${user.full_name}</div>
                        <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tight">@${user.username || 'user'}</div>
                    </div>
                </div>
            </div>
        `;
    });
    return html;
}

/** Render phần Bài đăng */
function renderPostResults(posts) {
    let html = `<div class="p-3 font-semibold text-content border-b border-base text-xs uppercase tracking-widest text-slate-400">📰 Bài đăng</div>`;
    posts.slice(0, 3).forEach(post => {
        html += `
             <div class="p-3 hover:bg-slate-50 cursor-pointer text-content text-sm transition"
                   onclick="window.SearchModule.clickHistoryItem('${post.id}', 'post', '${post.content ? post.content.substring(0, 30) + '...' : 'Bài đăng'}')">
                 <div class="flex items-center gap-3">
                    <span class="text-blue-500 bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center">📄</span>
                    <span class="truncate font-medium">${post.content || 'Bài đăng không có nội dung text'}</span>
                 </div>
             </div>
        `;
    });
    return html;
}

/** Render phần Group/Page */
function renderGroupOrPageResults(items) {
    let html = `<div class="p-3 font-semibold text-content border-b border-base text-xs uppercase tracking-widest text-slate-400">👥 Nhóm/Trang</div>`;
    items.slice(0, 5).forEach(item => {
        html += `
             <div class="p-3 hover:bg-slate-50 cursor-pointer text-content text-sm flex items-center gap-3 transition"
                   onclick="window.SearchModule.clickHistoryItem('${item.id}', 'group', '${item.full_name}')">
                 <div class="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm overflow-hidden border border-gray-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                    ${item.avatar
                ? `<img src="${window.IO_URL}/${item.avatar}" class="w-full h-full object-cover">`
                : `<img src="images/default_group.png" class="w-full h-full object-cover">`
            }
                 </div>
                 <span class="font-bold text-slate-700 dark:text-slate-200">${item.full_name}</span>
             </div>
        `;
    });
    return html;
}

/** Logic Click Ngoài để đóng Dropdown */
document.addEventListener('click', (e) => {
    const searchBar = document.querySelector('.flex-1.max-w-xl.mx-4.relative');
    const dropdown = document.getElementById('searchDropdown');
    const input = document.getElementById('globalSearchInput');

    if (!searchBar || !dropdown || !input) return;

    const clickedInside = searchBar.contains(e.target) || dropdown.contains(e.target);
    const hasText = input.value.trim().length > 0;

    if (!clickedInside) {
        if (!hasText) {
            dropdown.classList.add('hidden');
        } else {
            // Nếu đang có ký tự tìm kiếm, không cho phép "trỏ ra ngoài" 
            // - Giữ dropdown hiển thị (đã có vì không add hidden)
            // - Đưa focus ngược lại input (theo yêu cầu "không thể nào trỏ ra ngoài được")
            input.focus();
        }
    }
});

// ============================================
// EXPOSE TO WINDOW
// ============================================

window.SearchModule = {
    handleSearchFocus,
    handleSearchInput,
    clickHistoryItem,
    deleteHistoryItem,
    clearAllHistory,
    addToHistory,
    clearGlobalSearch
};

export { fetchSearchResults };