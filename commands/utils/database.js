import Database from 'bun:sqlite';
import path from 'path';

let db;

export function getDb() {
  if (!db) throw new Error('Database is not initialized – call initializeDatabase() first');
  return db;
}

export function initializeDatabase() {
    try {
        const dbPath = path.join(process.cwd(), 'bot.db');
        
        db = new Database(dbPath, { 
            create: true,
            safeIntegers: true,
            readonly: false
        });
        
        // Performance-instellingen
        db.exec("PRAGMA journal_mode = WAL;");
        db.exec("PRAGMA synchronous = NORMAL;"); 
        db.exec("PRAGMA temp_store = MEMORY;");
        db.exec("PRAGMA cache_size = -64000;"); 
        db.exec("PRAGMA mmap_size = 300000000;");
        db.exec("PRAGMA foreign_keys = ON;"); 
        db.exec("PRAGMA busy_timeout = 5000;");
        
        console.log('📊 [database] Database opened with optimized settings');
        
        createTables();

        // Voeg 'item_data' toe aan user_inventory als die ontbreekt
        const colItemData = db.prepare(`PRAGMA table_info(user_inventory)`).all()
            .some(col => col.name === 'item_data');

        if (!colItemData) {
            db.exec(`ALTER TABLE user_inventory ADD COLUMN item_data TEXT`);
            console.log("✅ [database] 'item_data' column added to user_inventory");
        }
        
        const userInventoryColumns = db.prepare(`PRAGMA table_info(user_inventory)`).all()
        .map(c => c.name);

        // Check of kolommen voor guild_config bestaan, en voeg toe als nodig
        const guildConfigColumns = db.prepare(`PRAGMA table_info(guild_config)`).all()
            .map(c => c.name);

        if (!guildConfigColumns.includes('levels_enabled')) {
            db.exec(`ALTER TABLE guild_config ADD COLUMN levels_enabled INTEGER DEFAULT 0`);
            console.log("✅ [database] 'levels_enabled' column added to guild_config");
        }
        if (!guildConfigColumns.includes('level_up_channel')) {
            db.exec(`ALTER TABLE guild_config ADD COLUMN level_up_channel TEXT`);
            console.log("✅ [database] 'level_up_channel' column added to guild_config");
        }
        if (!guildConfigColumns.includes('xp_per_message')) {
            db.exec(`ALTER TABLE guild_config ADD COLUMN xp_per_message INTEGER DEFAULT 0`);
            console.log("✅ [database] 'xp_per_message' column added to guild_config");
        }
        if (!guildConfigColumns.includes('message_cooldown')) {
            db.exec(`ALTER TABLE guild_config ADD COLUMN message_cooldown INTEGER DEFAULT 0`);
            console.log("✅ [database] 'message_cooldown' column added to guild_config");
        }
        if (!userInventoryColumns.includes('item_data')) {
            db.exec(`ALTER TABLE user_inventory ADD COLUMN item_data TEXT`);
            console.log("✅ [database] 'item_data' column added to user_inventory");
        }
        
        console.log('✅ [database] All tables initialized');
    } catch (error) {
        console.error('❌ [database] Failed to initialize database:', error);
        process.exit(1);
    }
}

function createTables() {
  // Users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      username TEXT,
      balance INTEGER DEFAULT 1000,
      bank INTEGER DEFAULT 0,
      last_work DATETIME,
      last_crime DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // Guild config
  db.exec(`
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
      warns_enabled INTEGER DEFAULT 0,
      levels_enabled INTEGER DEFAULT 0,
      level_up_channel TEXT,
      xp_per_message INTEGER DEFAULT 0,
      message_cooldown INTEGER DEFAULT 0
    )
  `);

    // Shop items
    db.exec(`
    CREATE TABLE IF NOT EXISTS shop_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'Other',
        type TEXT DEFAULT 'other',
        item_data TEXT,
        price INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    `);

  // User inventory
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_inventory (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 0,
      acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, guild_id, item_id),
      FOREIGN KEY (item_id) REFERENCES shop_items(id) ON DELETE CASCADE
    )
  `);

  // User levels
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_levels (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      total_xp INTEGER DEFAULT 0,
      last_message DATETIME,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // User warnings
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )
  `);

  // User mutes
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_mutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )
  `);

  // User bans
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,  
      guild_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    ) 
  `);

  // Tickets
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      user_id TEXT,
      channel_id TEXT,
      status TEXT DEFAULT 'open'
    )
  `);

  // Boosters
  db.exec(`
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
  db.exec(`
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

  // Birthdays
  db.exec(`
    CREATE TABLE IF NOT EXISTS birthdays (
      user_id TEXT,
      guild_id TEXT,
      birthday TEXT,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // Warnings (eventueel toevoegen)
  db.exec(`
    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // Indices voor performance (voor veel gebruikte kolommen)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_guild ON users(user_id, guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_user_guild ON user_inventory(user_id, guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_levels_user_guild ON user_levels(user_id, guild_id)`);
}


export function safeTransaction(callback) {
    const db = getDb(); 
    db.exec('BEGIN');
    try {
        const result = callback(db);
        db.exec('COMMIT');
        return result;
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

export function safeDbOperation(operation, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return operation();
        } catch (error) {
            if (error.code === 'SQLITE_BUSY' && attempt < maxRetries) {
                console.warn(`⚠️ [database] Retry ${attempt}/${maxRetries} due to BUSY`);
                const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
                Bun.sleepSync(delay);
                continue;
            }
            throw error;
        }
    }
}

export default db;
