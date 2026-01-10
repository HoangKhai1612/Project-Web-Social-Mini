const db = require('./config/database');

async function forceUpdateRole() {
    try {
        console.log("Force updating admin role with explicit SQL...");

        // Try multiple approaches
        await db.promise().query(`UPDATE users SET role = 'super_admin' WHERE id = 12`);
        await db.promise().query(`UPDATE users SET role = 'super_admin' WHERE username = 'admin'`);

        // Verify with raw query
        const [result] = await db.promise().query(`SELECT id, username, IFNULL(role, 'NULL') as role, LENGTH(role) as role_length FROM users WHERE username = 'admin'`);

        console.log("Result:", JSON.stringify(result[0], null, 2));

        if (!result[0].role || result[0].role === '' || result[0].role === 'NULL') {
            console.log("\n❌ STILL EMPTY! Checking if column has constraints...");

            const [cols] = await db.promise().query(`SHOW FULL COLUMNS FROM users WHERE Field = 'role'`);
            console.log("Column info:", JSON.stringify(cols[0], null, 2));
        } else {
            console.log("\n✅ SUCCESS! Role is now:", result[0].role);
        }

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

forceUpdateRole();
