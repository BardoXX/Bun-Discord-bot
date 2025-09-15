import { Database } from 'bun:sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database connection
const db = new Database(join(__dirname, '../../data/database.sqlite'));

// Add this function to your database initialization
async function initializeDatabase() {
    // Create ticket_systems table if it doesn't exist
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_systems ( 
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            log_channel_id TEXT,
            thread_mode BOOLEAN NOT NULL DEFAULT 0,
            required_role_id TEXT,
            naming_format TEXT NOT NULL DEFAULT 'ticket-{type}-{user}',
            types TEXT NOT NULL DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(guild_id)
        );
        
        CREATE TABLE IF NOT EXISTS birthdays (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            day INTEGER NOT NULL,
            month INTEGER NOT NULL,
            set_by TEXT NOT NULL DEFAULT 'unknown',
            set_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, guild_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_ticket_systems_guild_id ON ticket_systems(guild_id);
        CREATE INDEX IF NOT EXISTS idx_birthdays_guild_id ON birthdays(guild_id);
        CREATE INDEX IF NOT EXISTS idx_birthdays_date ON birthdays(month, day);
    `);
    
    // Add any missing columns to existing tables
    try {
        // Check if set_by column exists in birthdays table
        const checkSetBy = db.prepare("PRAGMA table_info(birthdays)").all();
        const hasSetBy = checkSetBy.some(col => col.name === 'set_by');
        
        if (!hasSetBy) {
            db.exec(`
                ALTER TABLE birthdays ADD COLUMN set_by TEXT NOT NULL DEFAULT 'unknown';
                ALTER TABLE birthdays ADD COLUMN set_at TEXT NOT NULL DEFAULT (datetime('now'));
            `);
            console.log('✅ Added set_by and set_at columns to birthdays table');
        } else {
            // Check if set_at column exists
            const hasSetAt = checkSetBy.some(col => col.name === 'set_at');
            if (!hasSetAt) {
                db.exec(`ALTER TABLE birthdays ADD COLUMN set_at TEXT NOT NULL DEFAULT (datetime('now'))`);
                console.log('✅ Added set_at column to birthdays table');
            }
        }
    } catch (error) {
        console.error('❌ Error updating database schema:', error);
        throw error;
    }
    
    console.log('✅ Database tables initialized');
    return db;
}

export { initializeDatabase, db };
