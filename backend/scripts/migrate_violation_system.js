const db = require('./config/database');

async function migrate() {
    try {
        console.log('🔄 Starting violation system migration...');

        // 1. Create reports table if not exists, or alter it
        // First check if table exists
        const [tables] = await db.promise().query("SHOW TABLES LIKE 'reports'");
        if (tables.length === 0) {
            await db.promise().query(`
                CREATE TABLE reports (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    reporter_id INT NOT NULL,
                    target_type ENUM('post', 'user', 'comment') NOT NULL,
                    target_id INT NOT NULL,
                    post_id INT NULL,
                    reason VARCHAR(255) NOT NULL,
                    description TEXT NULL,
                    status ENUM('pending', 'resolved', 'dismissed') DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TIMESTAMP NULL,
                    resolved_by INT NULL,
                    admin_note TEXT NULL,
                    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
                    INDEX idx_status (status),
                    INDEX idx_target (target_type, target_id)
                )
            `);
            console.log('✅ Reports table created');
        } else {
            console.log('ℹ️ Reports table exists, updating columns...');
            // Add description if missing
            try {
                await db.promise().query("ALTER TABLE reports ADD COLUMN description TEXT NULL");
                console.log('✅ Added description column');
            } catch (e) { console.log('ℹ️ description column likely exists'); }

            // Add admin_note if missing
            try {
                await db.promise().query("ALTER TABLE reports ADD COLUMN admin_note TEXT NULL");
                console.log('✅ Added admin_note column');
            } catch (e) { }

            // Add resolved_by if missing
            try {
                await db.promise().query("ALTER TABLE reports ADD COLUMN resolved_by INT NULL");
            } catch (e) { }

            // Add resolved_at if missing
            try {
                await db.promise().query("ALTER TABLE reports ADD COLUMN resolved_at TIMESTAMP NULL");
            } catch (e) { }
        }

        // 2. Add violation columns to users table
        const columns = [
            'ADD COLUMN violation_count INT DEFAULT 0',
            'ADD COLUMN last_violation_date TIMESTAMP NULL',
            'ADD COLUMN ban_until TIMESTAMP NULL',
            'ADD COLUMN ban_reason TEXT NULL',
            "ADD COLUMN restriction_level ENUM('none', 'warning', 'restricted_3d', 'suspended_7d', 'locked_30d', 'banned_permanent') DEFAULT 'none'"
        ];

        for (const col of columns) {
            try {
                await db.promise().query(`ALTER TABLE users ${col}`);
                console.log(`✅ Executed: ${col}`);
            } catch (e) {
                if (!e.message.includes('Duplicate column')) {
                    // console.error(`Error adding column: ${e.message}`);
                }
            }
        }
        console.log('✅ User violation columns checked/added');

        // 3. Create violation_history table
        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS violation_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                report_id INT NULL,
                violation_type VARCHAR(50) NOT NULL,
                penalty_level ENUM('warning', 'restricted_3d', 'suspended_7d', 'locked_30d', 'banned_permanent') NOT NULL,
                admin_id INT NOT NULL,
                reason TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL,
                FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user (user_id)
            )
        `);
        console.log('✅ Violation history table ready');

        // 4. Create notifications table if not exists (it should, but just in case)
        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                receiver_id INT NULL, 
                content TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'system',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('\n🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
