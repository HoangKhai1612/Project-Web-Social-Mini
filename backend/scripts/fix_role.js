const db = require('./config/database');

async function fixAdminRole() {
    try {
        console.log("Updating admin role...");

        const [result] = await db.promise().query(
            "UPDATE users SET role = 'super_admin' WHERE username = 'admin'"
        );

        console.log("✅ Updated", result.affectedRows, "row(s)");

        // Verify
        const [users] = await db.promise().query(
            "SELECT username, role FROM users WHERE username = 'admin'"
        );

        console.log("Current admin user:", users[0]);

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

fixAdminRole();
