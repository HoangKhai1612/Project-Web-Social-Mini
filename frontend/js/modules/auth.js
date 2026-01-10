import {
    API_URL,
    renderApp,
    renderCurrentView,
    showToast,
    setupSocketHandlers,
    defaultConfig
} from '../main.js';

// ========================
//  UTILITIES
// ========================

/**
 * Nạp lại khung giao diện Auth và Template nếu chúng bị xóa khỏi DOM
 */
function ensureAuthShell() {
    if (!document.getElementById('authContainer') || !document.getElementById('loginTemplate')) {
        if (window.loadAuthShell) {
            window.loadAuthShell();
        }
    }
}

// ========================
//  LOGIN LOGIC
// ========================
export async function handleLogin(e) {
    e.preventDefault();

    const usernameInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const btn = e.target.querySelector('button[type="submit"]');

    if (!usernameInput || !passwordInput) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    try {
        btn.disabled = true;
        btn.textContent = 'Đang xác thực...';

        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        console.log("=== LOGIN RESPONSE ===");
        console.log("Response OK:", response.ok);
        console.log("Success:", data.success);
        console.log("User data:", data.user);
        console.log("User role:", data.user?.role);

        if (response.ok && data.success) {
            const userPayload = {
                userId: data.user.id,
                email: username,
                username: data.user.username,
                name: data.user.full_name,
                avatar: data.user.avatar,
                gender: data.user.gender,
                role: data.user.role,
                privacy: data.user.privacy_setting || "public"
            };

            console.log("=== USER PAYLOAD ===");
            console.log(userPayload);

            // Lưu trạng thái đăng nhập và Token
            localStorage.setItem('currentUser', JSON.stringify(userPayload));
            localStorage.setItem('token', data.token); // [NEW] Lưu JWT Token
            window.currentUser = userPayload;
            window.authToken = data.token; // [NEW] Gắn vào window để dùng chung

            console.log("=== CHECKING ADMIN REDIRECT ===");
            console.log("Role check:", ['admin', 'super_admin'].includes(data.user.role));
            console.log("Will redirect:", ['admin', 'super_admin'].includes(data.user.role));

            // Khởi tạo socket và nạp App Shell (cho user thường)
            // Nếu là Admin -> Redirect sang trang Admin Dashboard
            if (['admin', 'super_admin'].includes(data.user.role)) {
                console.log("✅ REDIRECTING TO ADMIN DASHBOARD");
                showToast(`Xin chào Admin ${data.user.full_name}!`, 'success');
                setTimeout(() => {
                    console.log("Executing redirect...");
                    window.location.href = 'admin.html';
                }, 1000);
                return;
            }

            setupSocketHandlers();
            renderApp();

            showToast(`Chào mừng trở lại, ${data.user.full_name}!`, 'success');
        } else {
            showToast(data.message || 'Email hoặc mật khẩu không chính xác', 'error');
            btn.disabled = false;
            btn.textContent = 'Đăng nhập';
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Không thể kết nối tới máy chủ', 'error');
        btn.disabled = false;
        btn.textContent = 'Đăng nhập';
    }
}

// ========================
//  REGISTER LOGIC
// ========================
export async function handleRegister(e) {
    e.preventDefault();

    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');

    // Sử dụng FormData để gửi kèm file
    const formData = new FormData();
    formData.append('username', form.regEmail.value.trim());
    formData.append('password', form.regPassword.value.trim());
    formData.append('full_name', form.regName.value.trim());
    formData.append('birthday', form.regBirthday.value);
    formData.append('school', form.regSchool.value.trim());
    formData.append('work', form.regWork.value.trim());
    formData.append('location', form.regLocation.value.trim());
    formData.append('gender', document.getElementById('regGender').value);

    const avatarFile = document.getElementById('regAvatar').files[0];
    const coverFile = document.getElementById('regCover').files[0];

    if (avatarFile) formData.append('avatar', avatarFile);
    if (coverFile) formData.append('cover', coverFile);

    try {
        btn.disabled = true;
        btn.textContent = 'Đang khởi tạo tài khoản...';

        // Không set Content-Type header khi gửi FormData, browser sẽ tự set boundary
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast('Đăng ký thành công! Hãy đăng nhập.', 'success');
            setTimeout(() => renderLogin(), 1000);
        } else {
            showToast(data.message || 'Đăng ký thất bại', 'error');
            btn.disabled = false;
            btn.textContent = 'Đăng ký';
        }
    } catch (error) {
        showToast('Lỗi server, vui lòng thử lại sau', 'error');
        btn.disabled = false;
        btn.textContent = 'Đăng ký';
    }
}

// ========================
//  RENDERING VIEWS
// ========================

export function renderLogin() {
    window.currentView = 'login';

    // Nếu chưa có authContainer, buộc phải nạp shell
    if (!document.getElementById('authContainer')) {
        if (window.loadAuthShell) window.loadAuthShell();
    }

    const authContainer = document.getElementById('authContainer');
    const loginTemplate = document.getElementById('loginTemplate');

    if (authContainer && loginTemplate) {
        authContainer.innerHTML = '';
        authContainer.appendChild(loginTemplate.content.cloneNode(true));

        // Đảm bảo gắn lại sự kiện submit cho form mới
        document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    }
}

export function renderRegister() {
    window.currentView = 'register';
    ensureAuthShell();

    const authContainer = document.getElementById('authContainer');
    const registerTemplate = document.getElementById('registerTemplate');

    if (authContainer && registerTemplate) {
        authContainer.innerHTML = '';
        authContainer.appendChild(registerTemplate.content.cloneNode(true));

        const registerForm = document.getElementById('registerForm');
        if (registerForm) registerForm.addEventListener('submit', handleRegister);
    }
}

// ========================
//  LOGOUT LOGIC (ĐÃ SỬA LỖI ĐỨNG MÀN HÌNH)
// ========================
export function handleLogout() {
    window.showConfirmDialog('Bạn có chắc chắn muốn đăng xuất khỏi SocialVN?', () => {
        // 1. Xóa dữ liệu phiên làm việc
        localStorage.removeItem('currentUser');
        localStorage.removeItem('token'); // [NEW] Xóa token khi đăng xuất
        window.currentUser = null;
        window.authToken = null;
        window.activeChat = null;

        // 2. Nạp lại khung giao diện Auth (Vì renderApp đã xóa sạch các template cũ)
        if (window.loadAuthShell) {
            window.loadAuthShell();
        }

        // 3. Render giao diện đăng nhập
        renderLogin();

        showToast('Bạn đã đăng xuất thành công', 'success');
    });
}

// ========================
//  GLOBAL EXPORTS
// ========================
// Đảm bảo các hàm này có thể được gọi từ onclick trong HTML templates
window.renderLogin = renderLogin;
window.renderRegister = renderRegister;
window.handleLogout = handleLogout;