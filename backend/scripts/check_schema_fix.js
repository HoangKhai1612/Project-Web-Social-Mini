const db = require('./config/database');

async function checkSchema() {
    try {
        console.log("=== Checking users table schema ===");

        const [columns] = await db.promise().query(
            "DESCRIBE users"
        );

        console.log("\nColumns in users table:");
        columns.forEach(col => {
            console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
        });

        const roleColumn = columns.find(c => c.Field === 'role');

        if (!roleColumn) {
            console.log("\n❌ Role column does NOT exist!");
            console.log("Adding role column...");

            await db.promise().query(
                "ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'"
            );

            console.log("✅ Role column added");
        } else {
            console.log("\n✅ Role column exists:", roleColumn);
        }

        // Now set admin role
        console.log("\nSetting admin role to super_admin...");
        await db.promise().query(
            "UPDATE users SET role = 'super_admin' WHERE username = 'admin'"
        );

        // Verify
        const [admin] = await db.promise().query(
            "SELECT id, username, role FROM users WHERE username = 'admin'"
        );

        console.log("\nAdmin user after update:");
        console.log(admin[0]);

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

checkSchema();
