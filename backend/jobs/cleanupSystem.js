const db = require('../config/database');

/**
 * System Cleanup Logic
 * 
 * Tasks:
 * 1. Clean up Archive Table (> 30 days)
 * 2. Clean up Hidden Entries (> 30 days)
 * 3. Clean up Dismissed Reports (> 30 days)
 * 4. Safety wipe for soft-deleted posts (> 30 days)
 */
const runCleanup = async () => {
    const timestamp = new Date().toISOString();
    console.log(`\n🧹 [${timestamp}] Starting Master System Cleanup...`);

    try {
        // Define cleanup tasks
        const tasks = [
            {
                name: 'archived_posts',
                query: 'DELETE FROM archived_posts WHERE created_at < DATE_SUB(NOW(), INTERVAL 365 DAY)' // Keep 1 year history
            },
            {
                name: 'hidden_posts_entries',
                query: 'DELETE FROM hidden_posts_by_users WHERE hidden_at < DATE_SUB(NOW(), INTERVAL 30 DAY)'
            },
            {
                name: 'old_reports',
                query: "DELETE FROM reports WHERE status IN ('resolved', 'dismissed') AND resolved_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
            },
            {
                name: 'soft_deleted_posts_safety',
                query: 'DELETE FROM posts WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL 30 DAY)'
            }
        ];

        // Execute all independent deletions in parallel for efficiency
        const results = await Promise.all(
            tasks.map(task =>
                db.promise().query(task.query)
                    .then(([res]) => ({ name: task.name, affected: res.affectedRows }))
                    .catch(err => ({ name: task.name, error: err.message }))
            )
        );

        // Summary logging
        results.forEach(res => {
            if (res.error) {
                console.error(`   ❌ Failed to clean ${res.name}: ${res.error}`);
            } else if (res.affected > 0) {
                console.log(`   ✓ Cleaned ${res.affected} entries from ${res.name}`);
            }
        });

        console.log(`✅ [${new Date().toISOString()}] Cleanup job finished successfully.\n`);
        return results;

    } catch (err) {
        console.error('❌ Master cleanup job failed with fatal error:', err);
        throw err;
    }
};

module.exports = { runCleanup };
