import Database from 'bun:sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

/**
 * Get the database instance
 * @returns {Database} The database instance
 */
export function getDb() {
    if (!db) throw new Error('Database is not initialized - call initializeDatabase() first');
    return db;
}

/**
 * Initialize the database
 */
export function initializeDatabase() {
    try {
        const dbPath = join(__dirname, 'bot.db');
        
        db = new Database(dbPath, { 
            create: true,
            safeIntegers: true,
            readonly: false
        });
        
        // Performance settings
        db.exec("PRAGMA journal_mode = WAL;");
        db.exec("PRAGMA synchronous = NORMAL;");
        db.exec("PRAGMA temp_store = MEMORY;");
        db.exec("PRAGMA cache_size = -64000;");
        db.exec("PRAGMA mmap_size = 300000000;");
        db.exec("PRAGMA foreign_keys = ON;");
        db.exec("PRAGMA busy_timeout = 5000;");
        console.log('📊 [database] Database opened with optimized settings');
        
        createTables();
        addMissingColumns();
        
        console.log('✅ [database] All missing columns checked and added');
  } catch (error) {
    console.error('❌ [database] Error adding missing columns:', error);
    throw error;
  }
}
/**
 * Execute a SQL query and return the result
 * @param {string} sql - The SQL query to execute
 * @param {Array} params - The parameters for the query
 * @returns {Promise<{lastID: number, changes: number}>}
 */
export function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        try {
            const stmt = db.prepare(sql);
            const result = stmt.run(...params);
            resolve({
                lastID: result.lastInsertRowid,
                changes: result.changes
            });
        } catch (error) {
            console.error('Database run error:', error);
            reject(error);
        }
    });
}

/**
 * Get a single row from the database
 * @param {string} sql - The SQL query to execute
 * @param {Array} params - The parameters for the query
 * @returns {Promise<Object|null>}
 */
export function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        try {
            const stmt = db.prepare(sql);
            const row = stmt.get(...params);
            resolve(row || null);
        } catch (error) {
            console.error('Database get error:', error);
            reject(error);
        }
    });
}

function createTables() {
  // Users - Fixed column name from user_id to id
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      username TEXT,
      balance INTEGER DEFAULT 1000,
      bank INTEGER DEFAULT 0,
      last_work DATETIME,
      last_crime DATETIME,
      last_roulette DATETIME,
      last_daily DATETIME,
      last_weekly DATETIME,
      last_slot DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_robbery INTEGER DEFAULT 0,
      last_bank_robbery INTEGER DEFAULT 0,
      jailed_until INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // Guild config
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      welcome_channel TEXT,
      welcome_message TEXT,
      welcome_role TEXT,
      welcome_title TEXT,
      welcome_color TEXT,
      welcome_image TEXT,
      welcome_footer TEXT,
      welcome_embed_enabled INTEGER DEFAULT 0,
      ticket_category TEXT,
      ticket_channel TEXT,
      ticket_staff_role TEXT,
      counting_channel TEXT,
      counting_number INTEGER DEFAULT 0,
      birthday_channel TEXT,
      member_count_channel TEXT,
      member_count_format TEXT,
      inventory_enabled INTEGER DEFAULT 0,
      inventory_public_viewing INTEGER DEFAULT 0,
      inventory_max_items_per_category INTEGER DEFAULT 0,
      invites_enabled INTEGER DEFAULT 0,
      invite_log_channel TEXT,
      warns_enabled INTEGER DEFAULT 0,
      levels_enabled INTEGER DEFAULT 0,
      level_up_channel TEXT,
      xp_per_message INTEGER DEFAULT 0,
      xp_per_minute_voice INTEGER DEFAULT 0,
      message_cooldown INTEGER DEFAULT 0,
      ai_enabled INTEGER DEFAULT 0,
      ai_provider TEXT,
      ai_model TEXT,
      ai_system_prompt TEXT,
      ai_temperature REAL,
      ai_max_tokens INTEGER,
      ai_channels TEXT,
      ai_require_mention INTEGER DEFAULT 1,
      ai_cooldown_seconds INTEGER DEFAULT 10,
      ai_channel_prompts TEXT,
      ai_use_guild_secrets INTEGER DEFAULT 0,
      ai_openai_key_enc TEXT,
      ai_openai_base_enc TEXT,
      -- Slot machine defaults
      slot_enabled INTEGER DEFAULT 0,
      slot_min_bet INTEGER DEFAULT 10,
      slot_max_bet INTEGER DEFAULT 1000,
      slot_cooldown_seconds INTEGER DEFAULT 30,
      -- Counting rewards config
      counting_reward_enabled INTEGER DEFAULT 0,
      counting_reward_amount INTEGER DEFAULT 5,
      counting_reward_goal_interval INTEGER DEFAULT 10,
      counting_reward_specific_goals TEXT,
      -- Warning system settings
      max_warnings_before_action INTEGER DEFAULT 0,
      auto_warn_action TEXT DEFAULT 'none',
      auto_warn_channel TEXT,
      -- Cleanup settings
      cleanup_notifications INTEGER DEFAULT 1,
      daily_summary INTEGER DEFAULT 0
    )
  `);

  // Shop items - Added missing category column
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
            item_data TEXT,
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

  // Ticket system tables - Consolidated and cleaned up
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      guild_id TEXT NOT NULL,
      category_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, guild_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      title TEXT,
      description TEXT,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, channel_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_buttons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      emoji TEXT,
      style TEXT DEFAULT 'PRIMARY',
      ticket_type TEXT NOT NULL,
      use_form BOOLEAN DEFAULT 0,
      form_fields TEXT,
      role_requirement TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (panel_id) REFERENCES ticket_panels(id) ON DELETE CASCADE,
      UNIQUE(panel_id, ticket_type)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      category_id INTEGER,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      closed_by TEXT,
      claimed_by TEXT,
      claimed_at DATETIME,
      ticket_type TEXT,
      panel_id INTEGER,
      button_id INTEGER,
      title TEXT,
      description TEXT,
      close_reason TEXT,
      transcript_url TEXT,
      FOREIGN KEY (panel_id) REFERENCES ticket_panels(id) ON DELETE SET NULL,
      FOREIGN KEY (button_id) REFERENCES ticket_buttons(id) ON DELETE SET NULL,
      UNIQUE(channel_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT,
      is_note BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      UNIQUE(message_id)
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

  // Birthdays table
  db.exec(`
    CREATE TABLE IF NOT EXISTS birthdays (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      month INTEGER NOT NULL,
      set_by TEXT NOT NULL DEFAULT 'unknown',
      set_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, guild_id)
    )
  `);
  
  // Create index for faster birthday lookups
  db.exec('CREATE INDEX IF NOT EXISTS idx_birthdays_guild ON birthdays(guild_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_birthdays_date ON birthdays(month, day)');

  // Giveaways table
  db.exec(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      end_time DATETIME NOT NULL,
      winners INTEGER DEFAULT 1,
      min_level INTEGER DEFAULT 0,
      min_invites INTEGER DEFAULT 0,
      created_by TEXT NOT NULL,
      participants TEXT DEFAULT '[]',
      bonus_roles TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, message_id)
    )
  `);

  // Create index for faster giveaway lookups
  db.exec('CREATE INDEX IF NOT EXISTS idx_giveaways_guild ON giveaways(guild_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_giveaways_end_time ON giveaways(end_time)');

  // Warnings (duplicate table - keeping both for compatibility)
  db.exec(`
    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      expires_at INTEGER
    )
  `);

  // Auto warning actions log
  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_warn_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      warning_count INTEGER NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);
  
  // Economy jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS eco_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      min_payout INTEGER NOT NULL,
      max_payout INTEGER NOT NULL,
      min_level INTEGER DEFAULT 1,
      premium INTEGER DEFAULT 0,
      required_role_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, name)

    )
  `);


  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES shop_items(id)
    )
  `);
    db.exec(`
    CREATE TABLE IF NOT EXISTS user_economy (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      wallet INTEGER DEFAULT 0,
      bank INTEGER DEFAULT 0,
      last_robbery DATETIME,
      last_bank_robbery DATETIME,
      jailed_until DATETIME,
      level INTEGER DEFAULT 1,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // Ticket systems configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_systems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      category_id TEXT,
      ticket_category_id TEXT,
      panel_title TEXT DEFAULT 'Open a Ticket',
      panel_description TEXT DEFAULT 'Click the button below to create a ticket',
      max_tickets_per_user INTEGER DEFAULT 3,
      thread_mode BOOLEAN NOT NULL DEFAULT 0,
      naming_format TEXT NOT NULL DEFAULT 'ticket-{type}-{user}',
      types TEXT NOT NULL DEFAULT '[]',
      log_channel_id TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id)
    )
  `);

  // Cleanup logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS cleanup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      warnings_cleaned INTEGER NOT NULL
    )
  `);
  
  // Create index for faster lookups
  db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_systems_guild_id ON ticket_systems(guild_id)');

  // Indices voor performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_guild ON users(user_id, guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_user_guild ON user_inventory(user_id, guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_levels_user_guild ON user_levels(user_id, guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_job_history_user ON job_history(user_id, guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_job_history_date ON job_history(work_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_items_guild ON shop_items(guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_logs_user ON purchase_logs(user_id, guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_logs_item ON purchase_logs(item_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_birthdays_guild ON birthdays(guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_giveaways_guild ON giveaways(guild_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_giveaways_end_time ON giveaways(end_time)`);
}

function addMissingColumns() {
  try {
    // Check and add missing columns for guild_config table first
    const configColumns = db.prepare(`PRAGMA table_info(guild_config)`).all().map(c => c.name);
    
    // Add economy feature columns with default enabled (1)
    const economyFeatures = [
      'eco_balance_enabled', 'eco_crime_enabled', 'eco_daily_enabled',
      'eco_deposit_enabled', 'eco_eco_enabled', 'eco_jobstats_enabled',
      'eco_shop_enabled', 'eco_weekly_enabled', 'eco_withdraw_enabled',
      'eco_work_enabled', 'poker_enabled', 'rob_enabled',
      'roulette_enabled', 'slot_enabled', 'bj_enabled'
    ];

    for (const feature of economyFeatures) {
      if (!configColumns.includes(feature)) {
        db.exec(`ALTER TABLE guild_config ADD COLUMN ${feature} INTEGER DEFAULT 1`);
        console.log(`✅ [database] '${feature}' column added to guild_config with default enabled`);
      } else {
        // Update existing NULL values to 1 (enabled)
        db.exec(`UPDATE guild_config SET ${feature} = 1 WHERE ${feature} IS NULL`);
      }
    }

    // Check and add missing columns for giveaways table
    try {
      const giveawayColumns = db.prepare(`PRAGMA table_info(giveaways)`).all().map(c => c.name);

      if (!giveawayColumns.includes('bonus_roles')) {
        db.exec(`ALTER TABLE giveaways ADD COLUMN bonus_roles TEXT DEFAULT '[]'`);
        console.log("✅ [database] 'bonus_roles' column added to giveaways");
      }
    } catch (error) {
      // Giveaways table might not exist yet, which is fine
      console.log("ℹ️ [database] Giveaways table not yet created or error checking columns");
    }

    // Check and add missing columns for users table
    const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);

    // Ensure users table has all required robbery columns
    if (!userColumns.includes('last_robbery')) {
      db.exec(`ALTER TABLE users ADD COLUMN last_robbery INTEGER DEFAULT 0`);
      console.log("✅ [database] 'last_robbery' column added to users");
    }
    if (!userColumns.includes('last_bank_robbery')) {
      db.exec(`ALTER TABLE users ADD COLUMN last_bank_robbery INTEGER DEFAULT 0`);
      console.log("✅ [database] 'last_bank_robbery' column added to users");
    }
    if (!userColumns.includes('jailed_until')) {
      db.exec(`ALTER TABLE users ADD COLUMN jailed_until INTEGER DEFAULT 0`);
      console.log("✅ [database] 'jailed_until' column added to users");
    }
    if (!userColumns.includes('level')) {
      db.exec(`ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1`);
      console.log("✅ [database] 'level' column added to users");
    }

    // Ensure users.last_roulette exists
    if (!userColumns.includes('last_roulette')) {
      db.exec(`ALTER TABLE users ADD COLUMN last_roulette DATETIME`);
      console.log("✅ [database] 'last_roulette' column added to users");
    }

    // Ensure daily/weekly/slot timestamps exist
    if (!userColumns.includes('last_daily')) {
      db.exec(`ALTER TABLE users ADD COLUMN last_daily DATETIME`);
      console.log("✅ [database] 'last_daily' column added to users");
    }
    if (!userColumns.includes('last_weekly')) {
      db.exec(`ALTER TABLE users ADD COLUMN last_weekly DATETIME`);
      console.log("✅ [database] 'last_weekly' column added to users");
    }
    if (!userColumns.includes('last_slot')) {
      db.exec(`ALTER TABLE users ADD COLUMN last_slot DATETIME`);
      console.log("✅ [database] 'last_slot' column added to users");
    }

    // Check and add missing columns for shop_items table
    const shopColumns = db.prepare(`PRAGMA table_info(shop_items)`).all().map(c => c.name);
    
    if (!shopColumns.includes('category')) {
      db.exec(`ALTER TABLE shop_items ADD COLUMN category TEXT DEFAULT 'Other'`);
      console.log("✅ [database] 'category' column added to shop_items");
    }
    if (!shopColumns.includes('description')) {
      db.exec(`ALTER TABLE shop_items ADD COLUMN description TEXT`);
      console.log("✅ [database] 'description' column added to shop_items");
    }
    if (!shopColumns.includes('type')) {
      db.exec(`ALTER TABLE shop_items ADD COLUMN type TEXT DEFAULT 'other'`);
      console.log("✅ [database] 'type' column added to shop_items");
    }
    if (!shopColumns.includes('item_data')) {
      db.exec(`ALTER TABLE shop_items ADD COLUMN item_data TEXT`);
      console.log("✅ [database] 'item_data' column added to shop_items");
    }

    if (!shopColumns.includes('is_limited')) {
      db.exec(`ALTER TABLE shop_items ADD COLUMN is_limited BOOLEAN DEFAULT 0`);
      console.log("✅ [database] 'is_limited' column added to shop_items");
    }
    if (!userColumns.includes('last_yearly')) {
      db.exec(`ALTER TABLE users ADD COLUMN last_yearly DATETIME`);
      console.log("✅ [database] 'last_yearly' column added to users");
    }
    if (!userColumns.includes('last_monthly')) {
      db.exec(`ALTER TABLE users ADD COLUMN last_monthly DATETIME`);
      console.log("✅ [database] 'last_monthly' column added to users");
    }

    // Check and add missing columns for birthdays table
    const birthdayColumns = db.prepare(`PRAGMA table_info(birthdays)`).all().map(c => c.name);
    
    if (!birthdayColumns.includes('set_by')) {
      // First add the column without a default value
      db.exec(`ALTER TABLE birthdays ADD COLUMN set_by TEXT`);
      // Then update existing rows to have the default value
      db.exec(`UPDATE birthdays SET set_by = 'unknown' WHERE set_by IS NULL`);
      // Finally, modify the column to be NOT NULL with default
      db.exec(`CREATE TABLE birthdays_new (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        day INTEGER NOT NULL,
        month INTEGER NOT NULL,
        set_by TEXT NOT NULL DEFAULT 'unknown',
        set_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, guild_id)
      )`);
      
      // Copy data to new table
      db.exec(`
        INSERT INTO birthdays_new (user_id, guild_id, day, month, set_by, set_at)
        SELECT user_id, guild_id, day, month, COALESCE(set_by, 'unknown'), COALESCE(set_at, datetime('now'))
        FROM birthdays
      `);
      
      // Replace the old table with the new one
      db.exec(`
        DROP TABLE birthdays;
        ALTER TABLE birthdays_new RENAME TO birthdays;
      `);
      
      // Recreate indexes
      db.exec('CREATE INDEX IF NOT EXISTS idx_birthdays_guild ON birthdays(guild_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_birthdays_date ON birthdays(month, day)');
      
      console.log("✅ [database] 'set_by' and 'set_at' columns added to birthdays with proper defaults");
    } else if (!birthdayColumns.includes('set_at')) {
      // Only set_at is missing
      db.exec(`ALTER TABLE birthdays ADD COLUMN set_at TEXT`);
      db.exec(`UPDATE birthdays SET set_at = datetime('now') WHERE set_at IS NULL`);
      
      // Create a new table with the correct schema
      db.exec(`CREATE TABLE birthdays_new (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        day INTEGER NOT NULL,
        month INTEGER NOT NULL,
        set_by TEXT NOT NULL DEFAULT 'unknown',
        set_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, guild_id)
      )`);
      
      // Copy data to new table
      db.exec(`
        INSERT INTO birthdays_new (user_id, guild_id, day, month, set_by, set_at)
        SELECT user_id, guild_id, day, month, COALESCE(set_by, 'unknown'), COALESCE(set_at, datetime('now'))
        FROM birthdays
      `);
      
      // Replace the old table with the new one
      db.exec(`
        DROP TABLE birthdays;
        ALTER TABLE birthdays_new RENAME TO birthdays;
      `);
      
      // Recreate indexes
      db.exec('CREATE INDEX IF NOT EXISTS idx_birthdays_guild ON birthdays(guild_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_birthdays_date ON birthdays(month, day)');
      
      console.log("✅ [database] 'set_at' column added to birthdays with proper defaults");
    }

    // Ensure user_economy table has required columns
    try {
      const econColumns = db.prepare(`PRAGMA table_info(user_economy)`).all().map(c => c.name);
      if (!econColumns.includes('wallet')) {
        db.exec(`ALTER TABLE user_economy ADD COLUMN wallet INTEGER DEFAULT 0`);
        console.log("✅ [database] 'wallet' column added to user_economy");
      }
      if (!econColumns.includes('bank')) {
        db.exec(`ALTER TABLE user_economy ADD COLUMN bank INTEGER DEFAULT 0`);
        console.log("✅ [database] 'bank' column added to user_economy");
      }
      if (!econColumns.includes('last_robbery')) {
        db.exec(`ALTER TABLE user_economy ADD COLUMN last_robbery DATETIME`);
        console.log("✅ [database] 'last_robbery' column added to user_economy");
      }
      if (!econColumns.includes('last_bank_robbery')) {
        db.exec(`ALTER TABLE user_economy ADD COLUMN last_bank_robbery DATETIME`);
        console.log("✅ [database] 'last_bank_robbery' column added to user_economy");
      }
      if (!econColumns.includes('jailed_until')) {
        db.exec(`ALTER TABLE user_economy ADD COLUMN jailed_until DATETIME`);
        console.log("✅ [database] 'jailed_until' column added to user_economy");
      }
      if (!econColumns.includes('level')) {
        db.exec(`ALTER TABLE user_economy ADD COLUMN level INTEGER DEFAULT 1`);
        console.log("✅ [database] 'level' column added to user_economy");
      }
    } catch (e) {
      // Table may not exist on first run; createTables() will handle creation
    }

    // Check and add missing columns for user_inventory table
    const inventoryColumns = db.prepare(`PRAGMA table_info(user_inventory)`).all().map(c => c.name);
    
    if (!inventoryColumns.includes('item_id')) {
      db.exec(`ALTER TABLE user_inventory ADD COLUMN item_id INTEGER NOT NULL DEFAULT 0`);
      console.log("✅ [database] 'item_id' column added to user_inventory");
    }

    // Check and add missing columns for tickets table
    try {
      const ticketColumns = db.prepare(`PRAGMA table_info(tickets)`).all().map(c => c.name);
      
      if (!ticketColumns.includes('ticket_type')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN ticket_type TEXT`);
        console.log("✅ [database] 'ticket_type' column added to tickets");
      }
      if (!ticketColumns.includes('category_id')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN category_id INTEGER`);
        console.log("✅ [database] 'category_id' column added to tickets");
      }
      if (!ticketColumns.includes('closed_by')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN closed_by TEXT`);
        console.log("✅ [database] 'closed_by' column added to tickets");
      }
      if (!ticketColumns.includes('transcript_url')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN transcript_url TEXT`);
        console.log("✅ [database] 'transcript_url' column added to tickets");
      }
      
      if (!ticketColumns.includes('panel_id')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN panel_id INTEGER`);
        console.log("✅ [database] 'panel_id' column added to tickets");
      }
      
      if (!ticketColumns.includes('button_id')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN button_id INTEGER`);
        console.log("✅ [database] 'button_id' column added to tickets");
      }
      
      if (!ticketColumns.includes('created_at')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
        console.log("✅ [database] 'created_at' column added to tickets");
      }
      
      if (!ticketColumns.includes('closed_at')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN closed_at DATETIME`);
        console.log("✅ [database] 'closed_at' column added to tickets");
      }
      
      if (!ticketColumns.includes('claimed_by')) {
        db.exec(`ALTER TABLE tickets ADD COLUMN claimed_by TEXT`);
        console.log("✅ [database] 'claimed_by' column added to tickets");
      }
    } catch (error) {
      // Tickets table might not exist yet, which is fine
      console.log("ℹ️ [database] Tickets table not yet created or error checking columns");
    }
    if (!inventoryColumns.includes('quantity')) {
      db.exec(`ALTER TABLE user_inventory ADD COLUMN quantity INTEGER DEFAULT 0`);
      console.log("✅ [database] 'quantity' column added to user_inventory");
    }
    if (!inventoryColumns.includes('item_data')) {
      db.exec(`ALTER TABLE user_inventory ADD COLUMN item_data TEXT`);
      console.log("✅ [database] 'item_data' column added to user_inventory");
    }
    if (!inventoryColumns.includes('acquired_at')) {
      db.exec(`ALTER TABLE user_inventory ADD COLUMN acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
      console.log("✅ [database] 'acquired_at' column added to user_inventory");
    }

    // Check and add missing columns for guild_config table
    const guildConfigCols = db.prepare(`PRAGMA table_info(guild_config)`).all().map(c => c.name);

    if (!guildConfigCols.includes('levels_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN levels_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'levels_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('level_up_channel')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN level_up_channel TEXT`);
      console.log("✅ [database] 'level_up_channel' column added to guild_config");
    }
    if (!guildConfigCols.includes('xp_per_message')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN xp_per_message INTEGER DEFAULT 0`);
      console.log("✅ [database] 'xp_per_message' column added to guild_config");
    }
    if (!guildConfigCols.includes('xp_per_minute_voice')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN xp_per_minute_voice INTEGER DEFAULT 0`);
      console.log("✅ [database] 'xp_per_minute_voice' column added to guild_config");
    }
    if (!guildConfigCols.includes('message_cooldown')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN message_cooldown INTEGER DEFAULT 0`);
      console.log("✅ [database] 'message_cooldown' column added to guild_config");
    }
    if (!guildConfigCols.includes('welcome_role')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_role TEXT`);
      console.log("✅ [database] 'welcome_role' column added to guild_config");
    }
    if (!guildConfigCols.includes('welcome_title')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_title TEXT`);
      console.log("✅ [database] 'welcome_title' column added to guild_config");
    }
    if (!guildConfigCols.includes('welcome_color')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_color TEXT`);
      console.log("✅ [database] 'welcome_color' column added to guild_config");
    }
    if (!guildConfigCols.includes('welcome_image')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_image TEXT`);
      console.log("✅ [database] 'welcome_image' column added to guild_config");
    }
    if (!guildConfigCols.includes('welcome_footer')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_footer TEXT`);
      console.log("✅ [database] 'welcome_footer' column added to guild_config");
    }
    if (!guildConfigCols.includes('welcome_embed_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_embed_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'welcome_embed_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('member_count_channel')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN member_count_channel TEXT`);
      console.log("✅ [database] 'member_count_channel' column added to guild_config");
    }
    if (!guildConfigCols.includes('member_count_format')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN member_count_format TEXT`);
      console.log("✅ [database] 'member_count_format' column added to guild_config");
    }
    if (!guildConfigCols.includes('inventory_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN inventory_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'inventory_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('inventory_public_viewing')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN inventory_public_viewing INTEGER DEFAULT 0`);
      console.log("✅ [database] 'inventory_public_viewing' column added to guild_config");
    }
    if (!guildConfigCols.includes('inventory_max_items_per_category')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN inventory_max_items_per_category INTEGER DEFAULT 0`);
      console.log("✅ [database] 'inventory_max_items_per_category' column added to guild_config");
    }
    if (!guildConfigCols.includes('invites_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN invites_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'invites_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('invite_log_channel')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN invite_log_channel TEXT`);
      console.log("✅ [database] 'invite_log_channel' column added to guild_config");
    }

    // Economy: Roulette settings
    if (!guildConfigCols.includes('roulette_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN roulette_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'roulette_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('roulette_min_bet')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN roulette_min_bet INTEGER DEFAULT 10`);
      console.log("✅ [database] 'roulette_min_bet' column added to guild_config");
    }
    if (!guildConfigCols.includes('roulette_max_bet')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN roulette_max_bet INTEGER DEFAULT 1000`);
      console.log("✅ [database] 'roulette_max_bet' column added to guild_config");
    }
    if (!guildConfigCols.includes('roulette_cooldown_seconds')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN roulette_cooldown_seconds INTEGER DEFAULT 30`);
      console.log("✅ [database] 'roulette_cooldown_seconds' column added to guild_config");
    }

    // Economy: Slot machine settings
    if (!guildConfigCols.includes('slot_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN slot_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'slot_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('slot_min_bet')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN slot_min_bet INTEGER DEFAULT 10`);
      console.log("✅ [database] 'slot_min_bet' column added to guild_config");
    }
    if (!guildConfigCols.includes('slot_max_bet')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN slot_max_bet INTEGER DEFAULT 1000`);
      console.log("✅ [database] 'slot_max_bet' column added to guild_config");
    }
    if (!guildConfigCols.includes('slot_cooldown_seconds')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN slot_cooldown_seconds INTEGER DEFAULT 30`);
      console.log("✅ [database] 'slot_cooldown_seconds' column added to guild_config");
    }

    // Counting rewards config
    if (!guildConfigCols.includes('counting_reward_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN counting_reward_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'counting_reward_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('counting_reward_amount')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN counting_reward_amount INTEGER DEFAULT 5`);
      console.log("✅ [database] 'counting_reward_amount' column added to guild_config");
    }
    if (!guildConfigCols.includes('counting_reward_goal_interval')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN counting_reward_goal_interval INTEGER DEFAULT 10`);
      console.log("✅ [database] 'counting_reward_goal_interval' column added to guild_config");
    }
    if (!guildConfigCols.includes('counting_reward_specific_goals')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN counting_reward_specific_goals TEXT`);
      console.log("✅ [database] 'counting_reward_specific_goals' column added to guild_config");
    }

    // Add last_counting_user column for tracking who last counted
    if (!guildConfigCols.includes('last_counting_user')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN last_counting_user TEXT`);
      console.log("✅ [database] 'last_counting_user' column added to guild_config");
    }

    // Advanced moderation settings
    if (!guildConfigCols.includes('anti_invite_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'anti_invite_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_invite_default_state')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_default_state INTEGER DEFAULT 1`);
      console.log("✅ [database] 'anti_invite_default_state' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_invite_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_channels TEXT`);
      console.log("✅ [database] 'anti_invite_channels' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_invite_categories')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_categories TEXT`);
      console.log("✅ [database] 'anti_invite_categories' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_invite_exempt_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_exempt_channels TEXT`);
      console.log("✅ [database] 'anti_invite_exempt_channels' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_invite_exempt_categories')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_exempt_categories TEXT`);
      console.log("✅ [database] 'anti_invite_exempt_categories' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_invite_exempt_roles')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_exempt_roles TEXT`);
      console.log("✅ [database] 'anti_invite_exempt_roles' column added to guild_config");
    }

    // Anti-spam settings
    if (!guildConfigCols.includes('anti_spam_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'anti_spam_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_spam_default_state')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_default_state INTEGER DEFAULT 1`);
      console.log("✅ [database] 'anti_spam_default_state' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_spam_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_channels TEXT`);
      console.log("✅ [database] 'anti_spam_channels' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_spam_categories')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_categories TEXT`);
      console.log("✅ [database] 'anti_spam_categories' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_spam_exempt_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_exempt_channels TEXT`);
      console.log("✅ [database] 'anti_spam_exempt_channels' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_spam_exempt_categories')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_exempt_categories TEXT`);
      console.log("✅ [database] 'anti_spam_exempt_categories' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_spam_exempt_roles')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_exempt_roles TEXT`);
      console.log("✅ [database] 'anti_spam_exempt_roles' column added to guild_config");
    }
    if (!guildConfigCols.includes('anti_spam_message_threshold')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_message_threshold INTEGER DEFAULT 5`);
      console.log("✅ [database] 'anti_spam_message_threshold' column added to guild_config");
    }
    // Warning system settings
    if (!guildConfigCols.includes('max_warnings_before_action')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN max_warnings_before_action INTEGER DEFAULT 0`);
      console.log("✅ [database] 'max_warnings_before_action' column added to guild_config");
    }
    if (!guildConfigCols.includes('auto_warn_action')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN auto_warn_action TEXT DEFAULT 'none'`);
      console.log("✅ [database] 'auto_warn_action' column added to guild_config");
    }
    if (!guildConfigCols.includes('auto_warn_channel')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN auto_warn_channel TEXT`);
      console.log("✅ [database] 'auto_warn_channel' column added to guild_config");
    }
    if (!guildConfigCols.includes('auto_warn_timeout_duration')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN auto_warn_timeout_duration INTEGER DEFAULT 0`);
      console.log("✅ [database] 'auto_warn_timeout_duration' column added to guild_config");
    }

    // AI auto-responder settings
    if (!guildConfigCols.includes('ai_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'ai_enabled' column added to guild_config");
    }
    if (!guildConfigCols.includes('ai_provider')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_provider TEXT`);
      console.log("✅ [database] 'ai_provider' column added to guild_config");
    }
    if (!guildConfigCols.includes('ai_model')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_model TEXT`);
      console.log("✅ [database] 'ai_model' column added to guild_config");
    }
    if (!guildConfigCols.includes('ai_system_prompt')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_system_prompt TEXT`);
      console.log("✅ [database] 'ai_system_prompt' column added to guild_config");
    }
    if (!guildConfigCols.includes('ai_temperature')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_temperature REAL DEFAULT 0.7`);
      console.log("✅ [database] 'ai_temperature' column added to guild_config");
    }
    if (!guildConfigCols.includes('ai_max_tokens')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_max_tokens INTEGER DEFAULT 256`);
      console.log("✅ [database] 'ai_max_tokens' column added to guild_config");
    }
    if (!guildConfigCols.includes('ai_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_channels TEXT`);
      console.log("✅ [database] 'ai_channels' column added to guild_config");
    }
    if (!guildConfigCols.includes('ai_require_mention')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_require_mention INTEGER DEFAULT 1`);
      console.log("✅ [database] 'ai_require_mention' column added to guild_config");
    }
    if (!guildConfigCols.includes('ai_cooldown_seconds')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_cooldown_seconds INTEGER DEFAULT 15`);
      console.log("✅ [database] 'ai_cooldown_seconds' column added to guild_config");
    }
    if (!guildConfigCols.includes('ai_channel_prompts')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_channel_prompts TEXT`);
      console.log("✅ [database] 'ai_channel_prompts' column added to guild_config");
    }

    // Check and add missing AI-related columns to guild_config
    const columnsToAdd = [
      { name: 'ai_use_guild_secrets', type: 'INTEGER DEFAULT 0' },
      { name: 'ai_openai_key_enc', type: 'TEXT' },
      { name: 'ai_openai_base_enc', type: 'TEXT' }
    ];

    for (const column of columnsToAdd) {
      if (!guildConfigCols.includes(column.name)) {
        console.log(`[Database] Adding missing column ${column.name} to guild_config`);
        db.prepare(`ALTER TABLE guild_config ADD COLUMN ${column.name} ${column.type}`).run();
      }
    }

    // Ticket config settings
    const ticketConfigColumns = db.prepare(`PRAGMA table_info(ticket_config)`).all().map(c => c.name);
    if (!ticketConfigColumns.includes('ticket_channel_id')) {
      db.exec(`ALTER TABLE ticket_config ADD COLUMN ticket_channel_id TEXT`);
      console.log("✅ [database] 'ticket_channel_id' column added to ticket_config");
    }

    // Economy features enable flags (default ON)
    const ecoFlags = [
      'eco_balance_enabled','eco_crime_enabled','eco_daily_enabled','eco_deposit_enabled','eco_eco_enabled','eco_jobstats_enabled','eco_shop_enabled','eco_weekly_enabled','eco_withdraw_enabled','eco_work_enabled'
    ];
    for (const col of ecoFlags) {
      if (!guildConfigCols.includes(col)) {
        db.exec(`ALTER TABLE guild_config ADD COLUMN ${col} INTEGER DEFAULT 1`);
        console.log(`✅ [database] '${col}' column added to guild_config`);
      }
    }

    // Rob configuration
    const robConfigs = [
      'rob_enabled',
      'rob_bank_enabled',
      'rob_bank_success_rate',
      'rob_bank_cooldown',
      'rob_bank_fine_percentage',
      'rob_bank_reward_multiplier',
      'rob_cooldown',
      'rob_min_amount',
      'rob_max_percent',
      'rob_required_role',
      'rob_bonus_roles',
      'rob_success_rate',
      'rob_fine_percent'
    ];

    for (const col of robConfigs) {
      if (!guildConfigCols.includes(col)) {
        if (col.endsWith('_enabled') || col.endsWith('_rate') || col.endsWith('_percentage') || col.endsWith('_multiplier')) {
          db.prepare(`ALTER TABLE guild_config ADD COLUMN ${col} REAL`).run();
        } else if (col.endsWith('_cooldown')) {
          db.prepare(`ALTER TABLE guild_config ADD COLUMN ${col} INTEGER`).run();
        } else {
          db.prepare(`ALTER TABLE guild_config ADD COLUMN ${col} INTEGER`).run();
        }
        console.log(`✅ [database] Added column ${col} to guild_config`);
      }
    }

    // Check and add missing columns for ticket_systems table
    try {
      const ticketSysColumns = db.prepare(`PRAGMA table_info(ticket_systems)`).all().map(c => c.name);
      
      // Add ticket_category_id if it doesn't exist
      if (!ticketSysColumns.includes('ticket_category_id')) {
        db.exec(`ALTER TABLE ticket_systems ADD COLUMN ticket_category_id TEXT`);
        console.log("✅ [database] 'ticket_category_id' column added to ticket_systems");
        
        // Copy existing category_id values to ticket_category_id for backward compatibility
        db.exec(`UPDATE ticket_systems SET ticket_category_id = category_id`);
        console.log("✅ [database] Copied existing category_id values to ticket_category_id");
      }
      
      // Check and add other missing columns with proper defaults
      const columnsToAdd = [
        { name: 'panel_title', type: 'TEXT DEFAULT \'Open a Ticket\'' },
        { name: 'panel_description', type: 'TEXT DEFAULT \'Click the button below to create a ticket\'' },
        { name: 'max_tickets_per_user', type: 'INTEGER DEFAULT 3' },
        { name: 'thread_mode', type: 'BOOLEAN NOT NULL DEFAULT 0' },
        { name: 'naming_format', type: 'TEXT NOT NULL DEFAULT \'ticket-{type}-{user}\'' },
        { name: 'types', type: 'TEXT NOT NULL DEFAULT \'[]\'' },
        { name: 'log_channel_id', type: 'TEXT NOT NULL DEFAULT \'\'' }
      ];

      for (const { name, type } of columnsToAdd) {
        if (!ticketSysColumns.includes(name)) {
          db.exec(`ALTER TABLE ticket_systems ADD COLUMN ${name} ${type}`);
          console.log(`✅ [database] '${name}' column added to ticket_systems`);
        }
      }

      // Ensure required columns have default values for existing rows
      const requiredColumns = ['category_id', 'log_channel_id'];
      for (const col of requiredColumns) {
        if (ticketSysColumns.includes(col)) {
          db.exec(`UPDATE ticket_systems SET ${col} = '' WHERE ${col} IS NULL`);
        }
      }

    } catch (error) {
      console.error("❌ [database] Error updating ticket_systems table:", error);
      throw error; // Re-throw to be caught by the outer try-catch
    }

    // Check and add missing columns for warnings table
    try {
      const warningsColumns = db.prepare(`PRAGMA table_info(warnings)`).all().map(c => c.name);

      if (!warningsColumns.includes('expires_at')) {
        db.exec(`ALTER TABLE warnings ADD COLUMN expires_at INTEGER`);
        console.log("✅ [database] 'expires_at' column added to warnings table");
      }
    } catch (error) {
      // Warnings table might not exist yet, which is fine
      console.log("ℹ️ [database] Warnings table not yet created or error checking columns");
    }

    console.log('✅ [database] All missing columns checked and added');
  } catch (error) {
    console.error('❌ [database] Error adding missing columns:', error);
    throw error; // Ensure the error is propagated up
  }
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

export default {
  getDb,
  initializeDatabase,
  run,
  get,
  createTables,
  addMissingColumns,
  safeTransaction,
  safeDbOperation
};