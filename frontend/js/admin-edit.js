// Add edit admin function
window.AdminModule.editAdmin = async function (id, username, fullName, currentRole) {
    // For now, we'll just allow changing the role
    if (!currentUser || currentUser.role !== 'super_admin') {
        alert("Chỉ Super Admin mới có thể sửa thông tin Admin.");
        return;
    }

    const newRole = confirm(`Thay đổi role cho ${username}?\n\nOK = Super Admin\nCancel = Admin thường`) ? 'super_admin' : 'admin';

    if (newRole === currentRole) {
        alert("Không có thay đổi nào.");
        return;
    }

    const res = await authFetch(`/admin/admins/${id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
    });

    const data = await res.json();
    if (data.success) {
        alert("Đã cập nhật role thành công!");
        loadAdmins();
    } else {
        alert("Lỗi: " + data.message);
    }
}
