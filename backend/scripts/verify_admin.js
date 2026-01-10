const db = require('./config/database');
const bcrypt = require('bcryptjs');

async function verifyAdmin() {
    try {
        console.log("=== Checking Admin User ===");

        // Check if admin user exists
        const [users] = await db.promise().query(
            "SELECT id, username, full_name, role, password FROM users WHERE username = 'admin'"
        );

        if (users.length === 0) {
            console.log("❌ Admin user NOT found!");
            console.log("Creating admin user...");

            const hashedPassword = await bcrypt.hash('admin123', 10);
            await db.promise().query(
                "INSERT INTO users (username, full_name, password, role, gender, birthday, location) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ['admin', 'System Admin', hashedPassword, 'super_admin', 'Male', '1990-01-01', 'Vietnam']
            );
            console.log("✅ Admin user created with password: admin123");
        } else {
            const admin = users[0];
            console.log("✅ Admin user found:");
            console.log("   ID:", admin.id);
            console.log("   Username:", admin.username);
            console.log("   Full Name:", admin.full_name);
            console.log("   Role:", admin.role);

            // Test password
            const testPassword = 'admin123';
            const isMatch = await bcrypt.compare(testPassword, admin.password);
            console.log(`   Password 'admin123' matches: ${isMatch ? '✅ YES' : '❌ NO'}`);

            if (!isMatch) {
                console.log("Resetting password to 'admin123'...");
                const hashedPassword = await bcrypt.hash('admin123', 10);
                await db.promise().query(
                    "UPDATE users SET password = ? WHERE id = ?",
                    [hashedPassword, admin.id]
                );
                console.log("✅ Password reset complete");
            }

            // Ensure role is super_admin
            if (admin.role !== 'super_admin') {
                console.log("Updating role to super_admin...");
                await db.promise().query(
                    "UPDATE users SET role = 'super_admin' WHERE id = ?",
                    [admin.id]
                );
                console.log("✅ Role updated");
            }
        }

        console.log("\n=== Verification Complete ===");
        console.log("You can now login with:");
        console.log("Username: admin");
        console.log("Password: admin123");

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

verifyAdmin();
