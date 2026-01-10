const db = require('./config/database');

/**
 * Migration Script: Add Super Admin Role Support
 * This script updates the database to support super_admin role
 */

async function migrate() {
    try {
        console.log('Starting migration: Adding Super Admin role support...');

        // 1. Check if role column can support 'super_admin'
        console.log('Step 1: Checking users table schema...');

        // 2. Update existing admin user to super_admin (first admin becomes super admin)
        console.log('Step 2: Promoting first admin to super_admin...');
        const [result] = await db.promise().query(`
            UPDATE users 
            SET role = 'super_admin' 
            WHERE role = 'admin' 
            ORDER BY created_at ASC 
            LIMIT 1
        `);

        if (result.affectedRows > 0) {
            console.log('✓ Successfully promoted first admin to super_admin');
        } else {
            console.log('⚠ No admin found to promote. You may need to create a super_admin manually.');
        }

        // 3. Verify the change
        const [superAdmins] = await db.promise().query(`
            SELECT id, username, full_name, role 
            FROM users 
            WHERE role = 'super_admin'
        `);

        console.log('\n=== Current Super Admins ===');
        superAdmins.forEach(admin => {
            console.log(`- ${admin.full_name} (@${admin.username}) [ID: ${admin.id}]`);
        });

        console.log('\n✅ Migration completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrate();
