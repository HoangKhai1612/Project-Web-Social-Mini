const db = require('./config/database');

async function checkReportsSchema() {
    try {
        console.log("=== Checking reports table schema ===");
        const [columns] = await db.promise().query("DESCRIBE reports");
        console.log(columns.map(c => `${c.Field} (${c.Type})`).join('\n'));
        process.exit(0);
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
            console.log("Table 'reports' does not exist.");
        } else {
            console.error(err);
        }
        process.exit(1);
    }
}

checkReportsSchema();
