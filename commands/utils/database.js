// utils/database.js
import Database from 'bun:sqlite';

const db = new Database('bot.db');

export function addColumnIfMissing(table, column, definition) {
    try {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (err) {
        if (!err.message.includes("duplicate column name")) {
            throw err;
        }
    }
}

export function initializeDatabase() {
    // Users & Economy
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            guild_id TEXT,
            balance INTEGER DEFAULT 0,
            bank INTEGER DEFAULT 0,
            last_work DATETIME,
            last_crime DATETIME,
            last_rob DATETIME
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS economy (
            user_id TEXT,
            guild_id TEXT,
            balance INTEGER DEFAULT 0,
            bank INTEGER DEFAULT 0,
            last_work DATETIME,
            last_crime DATETIME,
            last_rob DATETIME,
            PRIMARY KEY (user_id, guild_id)
        )
    `);

    // Shop
    db.run(`
        CREATE TABLE IF NOT EXISTS shop_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price INTEGER NOT NULL,
            category TEXT DEFAULT 'Other',
            type TEXT DEFAULT 'other',
            data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS user_inventory (
            user_id TEXT,
            guild_id TEXT,
            item_id INTEGER,
            quantity INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, guild_id, item_id),
            FOREIGN KEY (item_id) REFERENCES shop_items(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS guild_config (
            guild_id TEXT PRIMARY KEY,
            welcome_channel TEXT,
            welcome_message TEXT,
            ticket_category TEXT,
            ticket_channel TEXT,
            ticket_staff_role TEXT,
            counting_channel TEXT,
            counting_number INTEGER DEFAULT 0,
            birthday_channel TEXT,
            levels_enabled INTEGER DEFAULT 1
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT,
            user_id TEXT,
            channel_id TEXT,
            status TEXT DEFAULT 'open'
        )
    `);
    
    // Levels
    db.run(`
        CREATE TABLE IF NOT EXISTS user_levels (
            user_id TEXT,
            guild_id TEXT,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            last_message DATETIME,
            PRIMARY KEY (user_id, guild_id)
        )
    `);
    // Boosters
    db.run(`
        CREATE TABLE IF NOT EXISTS user_boosters (
            user_id TEXT,
            guild_id TEXT,
            type TEXT NOT NULL,
            multiplier REAL DEFAULT 1,
            active INTEGER DEFAULT 1,
            expires_at DATETIME,
            PRIMARY KEY (user_id, guild_id, type)
        )
    `);
    // Voice XP
    db.run(`
        CREATE TABLE IF NOT EXISTS voice_xp ( 
            user_id TEXT,
            guild_id TEXT,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            total_xp INTEGER DEFAULT 0,
            last_voice DATETIME,
            PRIMARY KEY (user_id, guild_id)
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS birthdays (
            user_id TEXT,
            guild_id TEXT,
            birthday TEXT,
            PRIMARY KEY (user_id, guild_id)
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS warnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            moderator_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        )
    `);

    addColumnIfMissing('guild_config', 'invites_enabled', 'INTEGER DEFAULT 1');
    addColumnIfMissing('user_boosters', 'active', 'INTEGER DEFAULT 1');
    addColumnIfMissing('user_levels', 'total_xp', 'INTEGER DEFAULT 0');
    addColumnIfMissing('guild_config', 'warns_enabled', 'INTEGER DEFAULT 0');


    // Roep de nieuwe functie aan
    ensureAllTablesExist(db);
}

async function ensureAllTablesExist(db) {
    // Basis config tabel
    db.prepare(`
        CREATE TABLE IF NOT EXISTS guild_config (
            guild_id TEXT PRIMARY KEY,
            welcome_channel TEXT,
            welcome_role TEXT,
            welcome_title TEXT,
            welcome_message TEXT,
            welcome_color TEXT,
            welcome_image TEXT,
            welcome_footer TEXT,
            welcome_embed_enabled INTEGER,
            counting_channel TEXT,
            counting_number INTEGER,
            birthday_channel TEXT,
            ticket_channel TEXT,
            ticket_category TEXT,
            ticket_staff_role TEXT,
            ticket_log_channel TEXT,
            levels_enabled INTEGER,
            level_up_channel TEXT,
            xp_per_message INTEGER,
            xp_per_minute_voice INTEGER,
            message_cooldown INTEGER,
            member_count_channel TEXT,
            member_count_format TEXT,
            invites_enabled INTEGER,
            invite_log_channel TEXT
        )
    `).run();

    // Shop items tabel
    db.prepare(`
        CREATE TABLE IF NOT EXISTS shop_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price INTEGER NOT NULL,
            category TEXT DEFAULT 'Other',
            type TEXT DEFAULT 'other',
            data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
}

export default db;