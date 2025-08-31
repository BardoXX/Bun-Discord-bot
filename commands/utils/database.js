import Database from 'bun:sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

export function getDb() {
  if (!db) throw new Error('Database is not initialized – call initializeDatabase() first');
  return db;
}

export function initializeDatabase() {
    try {
        const dbPath = join(__dirname, 'bot.db')
        
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
        addMissingColumns();
        
        console.log('✅ [database] All tables initialized');
    } catch (error) {
        console.error('❌ [database] Failed to initialize database:', error);
        process.exit(1);
    }
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
      ai_temperature REAL DEFAULT 0.7,
      ai_max_tokens INTEGER DEFAULT 256,
      ai_channels TEXT,
      ai_require_mention INTEGER DEFAULT 1,
      ai_cooldown_seconds INTEGER DEFAULT 15,
      ai_channel_prompts TEXT,
      -- Slot machine defaults
      slot_enabled INTEGER DEFAULT 0,
      slot_min_bet INTEGER DEFAULT 10,
      slot_max_bet INTEGER DEFAULT 1000,
      slot_cooldown_seconds INTEGER DEFAULT 30,
      -- Counting rewards config
      counting_reward_enabled INTEGER DEFAULT 0,
      counting_reward_amount INTEGER DEFAULT 5,
      counting_reward_goal_interval INTEGER DEFAULT 10,
      counting_reward_specific_goals TEXT
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

  // Tickets
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      user_id TEXT,
      channel_id TEXT,
      status TEXT DEFAULT 'open',
      ticket_type TEXT,
      panel_id INTEGER,
      button_id INTEGER
    )
  `);

  // Ticket panels
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      panel_name TEXT,
      channel_id TEXT,
      message_id TEXT,
      embed_title TEXT,
      embed_description TEXT,
      embed_color TEXT
    )
  `);

  // Ticket buttons
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_buttons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id INTEGER,
      label TEXT,
      style TEXT,
      emoji TEXT,
      ticket_type TEXT,
      use_form BOOLEAN DEFAULT 0,
      form_fields TEXT,
      role_requirement TEXT,
      FOREIGN KEY (panel_id) REFERENCES ticket_panels(id)
    )
  `);

  // Ticket configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_config (
      guild_id TEXT PRIMARY KEY,
      ticket_category_id TEXT,
      thread_mode BOOLEAN DEFAULT 0,
      log_channel_id TEXT
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

  // Birthdays - Fixed with proper columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS birthdays (
      user_id TEXT,
      guild_id TEXT,
      birthday TEXT,
      day INTEGER,
      month INTEGER,
      year INTEGER,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // Warnings (duplicate table - keeping both for compatibility)
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
  
  // Job history
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      base_earnings INTEGER NOT NULL,
      multiplier REAL DEFAULT 1,
      final_earnings INTEGER NOT NULL,
      work_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      job_type TEXT DEFAULT 'default'
    )
  `);

  // Ticket system tables
  // Ticket configuration per guild
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_config (
      guild_id TEXT PRIMARY KEY,
      ticket_category_id TEXT,
      ticket_channel_id TEXT,
      thread_mode INTEGER DEFAULT 0,
      log_channel_id TEXT
    )
  `);

  // Ticket panels
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      panel_name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      embed_title TEXT DEFAULT '🎫 Ticket Systeem',
      embed_description TEXT DEFAULT 'Klik op een knop hieronder om een ticket aan te maken.',
      embed_color TEXT DEFAULT '#0099ff',
      FOREIGN KEY (guild_id) REFERENCES guild_config(guild_id) ON DELETE CASCADE
    )
  `);

  // Ticket panel buttons
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_buttons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      style TEXT DEFAULT 'PRIMARY',
      emoji TEXT,
      ticket_type TEXT NOT NULL,
      use_form INTEGER DEFAULT 0,
      form_fields TEXT,
      role_requirement TEXT,
      FOREIGN KEY (panel_id) REFERENCES ticket_panels(id) ON DELETE CASCADE
    )
  `);

  // Tickets table (updated structure)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      claimed_by TEXT,
      ticket_type TEXT,
      panel_id INTEGER,
      button_id INTEGER,
      FOREIGN KEY (panel_id) REFERENCES ticket_panels(id),
      FOREIGN KEY (button_id) REFERENCES ticket_buttons(id)
    )
  `);

  // Purchase logs
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
}

function addMissingColumns() {
  try {
    // Check and add missing columns for users table
    const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
    
    if (!userColumns.includes('id')) {
      db.exec(`ALTER TABLE users ADD COLUMN id TEXT`);
      // Copy user_id to id column for existing records
      db.exec(`UPDATE users SET id = user_id WHERE id IS NULL`);
      // Now create the index after the column exists
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_id ON users(id)`);
      console.log("✅ [database] 'id' column added to users");
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

    // Check and add missing columns for birthdays table
    const birthdayColumns = db.prepare(`PRAGMA table_info(birthdays)`).all().map(c => c.name);
    
    if (!birthdayColumns.includes('day')) {
      db.exec(`ALTER TABLE birthdays ADD COLUMN day INTEGER`);
      console.log("✅ [database] 'day' column added to birthdays");
    }
    if (!birthdayColumns.includes('month')) {
      db.exec(`ALTER TABLE birthdays ADD COLUMN month INTEGER`);
      console.log("✅ [database] 'month' column added to birthdays");
    }
    if (!birthdayColumns.includes('year')) {
      db.exec(`ALTER TABLE birthdays ADD COLUMN year INTEGER`);
      console.log("✅ [database] 'year' column added to birthdays");
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
    const guildConfigColumns = db.prepare(`PRAGMA table_info(guild_config)`).all().map(c => c.name);

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
    if (!guildConfigColumns.includes('xp_per_minute_voice')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN xp_per_minute_voice INTEGER DEFAULT 0`);
      console.log("✅ [database] 'xp_per_minute_voice' column added to guild_config");
    }
    if (!guildConfigColumns.includes('message_cooldown')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN message_cooldown INTEGER DEFAULT 0`);
      console.log("✅ [database] 'message_cooldown' column added to guild_config");
    }
    if (!guildConfigColumns.includes('welcome_role')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_role TEXT`);
      console.log("✅ [database] 'welcome_role' column added to guild_config");
    }
    if (!guildConfigColumns.includes('welcome_title')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_title TEXT`);
      console.log("✅ [database] 'welcome_title' column added to guild_config");
    }
    if (!guildConfigColumns.includes('welcome_color')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_color TEXT`);
      console.log("✅ [database] 'welcome_color' column added to guild_config");
    }
    if (!guildConfigColumns.includes('welcome_image')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_image TEXT`);
      console.log("✅ [database] 'welcome_image' column added to guild_config");
    }
    if (!guildConfigColumns.includes('welcome_footer')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_footer TEXT`);
      console.log("✅ [database] 'welcome_footer' column added to guild_config");
    }
    if (!guildConfigColumns.includes('welcome_embed_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN welcome_embed_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'welcome_embed_enabled' column added to guild_config");
    }
    if (!guildConfigColumns.includes('member_count_channel')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN member_count_channel TEXT`);
      console.log("✅ [database] 'member_count_channel' column added to guild_config");
    }
    if (!guildConfigColumns.includes('member_count_format')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN member_count_format TEXT`);
      console.log("✅ [database] 'member_count_format' column added to guild_config");
    }
    if (!guildConfigColumns.includes('inventory_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN inventory_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'inventory_enabled' column added to guild_config");
    }
    if (!guildConfigColumns.includes('inventory_public_viewing')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN inventory_public_viewing INTEGER DEFAULT 0`);
      console.log("✅ [database] 'inventory_public_viewing' column added to guild_config");
    }
    if (!guildConfigColumns.includes('inventory_max_items_per_category')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN inventory_max_items_per_category INTEGER DEFAULT 0`);
      console.log("✅ [database] 'inventory_max_items_per_category' column added to guild_config");
    }
    if (!guildConfigColumns.includes('invites_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN invites_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'invites_enabled' column added to guild_config");
    }
    if (!guildConfigColumns.includes('invite_log_channel')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN invite_log_channel TEXT`);
      console.log("✅ [database] 'invite_log_channel' column added to guild_config");
    }

    // Economy: Roulette settings
    if (!guildConfigColumns.includes('roulette_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN roulette_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'roulette_enabled' column added to guild_config");
    }
    if (!guildConfigColumns.includes('roulette_min_bet')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN roulette_min_bet INTEGER DEFAULT 10`);
      console.log("✅ [database] 'roulette_min_bet' column added to guild_config");
    }
    if (!guildConfigColumns.includes('roulette_max_bet')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN roulette_max_bet INTEGER DEFAULT 1000`);
      console.log("✅ [database] 'roulette_max_bet' column added to guild_config");
    }
    if (!guildConfigColumns.includes('roulette_cooldown_seconds')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN roulette_cooldown_seconds INTEGER DEFAULT 30`);
      console.log("✅ [database] 'roulette_cooldown_seconds' column added to guild_config");
    }

    // Economy: Slot machine settings
    if (!guildConfigColumns.includes('slot_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN slot_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'slot_enabled' column added to guild_config");
    }
    if (!guildConfigColumns.includes('slot_min_bet')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN slot_min_bet INTEGER DEFAULT 10`);
      console.log("✅ [database] 'slot_min_bet' column added to guild_config");
    }
    if (!guildConfigColumns.includes('slot_max_bet')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN slot_max_bet INTEGER DEFAULT 1000`);
      console.log("✅ [database] 'slot_max_bet' column added to guild_config");
    }
    if (!guildConfigColumns.includes('slot_cooldown_seconds')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN slot_cooldown_seconds INTEGER DEFAULT 30`);
      console.log("✅ [database] 'slot_cooldown_seconds' column added to guild_config");
    }

    // Counting rewards config
    if (!guildConfigColumns.includes('counting_reward_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN counting_reward_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'counting_reward_enabled' column added to guild_config");
    }
    if (!guildConfigColumns.includes('counting_reward_amount')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN counting_reward_amount INTEGER DEFAULT 5`);
      console.log("✅ [database] 'counting_reward_amount' column added to guild_config");
    }
    if (!guildConfigColumns.includes('counting_reward_goal_interval')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN counting_reward_goal_interval INTEGER DEFAULT 10`);
      console.log("✅ [database] 'counting_reward_goal_interval' column added to guild_config");
    }
    if (!guildConfigColumns.includes('counting_reward_specific_goals')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN counting_reward_specific_goals TEXT`);
      console.log("✅ [database] 'counting_reward_specific_goals' column added to guild_config");
    }

    // Advanced moderation settings
    if (!guildConfigColumns.includes('anti_invite_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'anti_invite_enabled' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_invite_default_state')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_default_state INTEGER DEFAULT 1`);
      console.log("✅ [database] 'anti_invite_default_state' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_invite_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_channels TEXT`);
      console.log("✅ [database] 'anti_invite_channels' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_invite_categories')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_categories TEXT`);
      console.log("✅ [database] 'anti_invite_categories' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_invite_exempt_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_exempt_channels TEXT`);
      console.log("✅ [database] 'anti_invite_exempt_channels' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_invite_exempt_categories')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_exempt_categories TEXT`);
      console.log("✅ [database] 'anti_invite_exempt_categories' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_invite_exempt_roles')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_invite_exempt_roles TEXT`);
      console.log("✅ [database] 'anti_invite_exempt_roles' column added to guild_config");
    }

    // Anti-spam settings
    if (!guildConfigColumns.includes('anti_spam_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'anti_spam_enabled' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_spam_default_state')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_default_state INTEGER DEFAULT 1`);
      console.log("✅ [database] 'anti_spam_default_state' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_spam_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_channels TEXT`);
      console.log("✅ [database] 'anti_spam_channels' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_spam_categories')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_categories TEXT`);
      console.log("✅ [database] 'anti_spam_categories' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_spam_exempt_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_exempt_channels TEXT`);
      console.log("✅ [database] 'anti_spam_exempt_channels' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_spam_exempt_categories')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_exempt_categories TEXT`);
      console.log("✅ [database] 'anti_spam_exempt_categories' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_spam_exempt_roles')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_exempt_roles TEXT`);
      console.log("✅ [database] 'anti_spam_exempt_roles' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_spam_message_threshold')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_message_threshold INTEGER DEFAULT 5`);
      console.log("✅ [database] 'anti_spam_message_threshold' column added to guild_config");
    }
    if (!guildConfigColumns.includes('anti_spam_time_window')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN anti_spam_time_window INTEGER DEFAULT 5`);
      console.log("✅ [database] 'anti_spam_time_window' column added to guild_config");
    }

    // AI auto-responder settings
    if (!guildConfigColumns.includes('ai_enabled')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_enabled INTEGER DEFAULT 0`);
      console.log("✅ [database] 'ai_enabled' column added to guild_config");
    }
    if (!guildConfigColumns.includes('ai_provider')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_provider TEXT`);
      console.log("✅ [database] 'ai_provider' column added to guild_config");
    }
    if (!guildConfigColumns.includes('ai_model')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_model TEXT`);
      console.log("✅ [database] 'ai_model' column added to guild_config");
    }
    if (!guildConfigColumns.includes('ai_system_prompt')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_system_prompt TEXT`);
      console.log("✅ [database] 'ai_system_prompt' column added to guild_config");
    }
    if (!guildConfigColumns.includes('ai_temperature')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_temperature REAL DEFAULT 0.7`);
      console.log("✅ [database] 'ai_temperature' column added to guild_config");
    }
    if (!guildConfigColumns.includes('ai_max_tokens')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_max_tokens INTEGER DEFAULT 256`);
      console.log("✅ [database] 'ai_max_tokens' column added to guild_config");
    }
    if (!guildConfigColumns.includes('ai_channels')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_channels TEXT`);
      console.log("✅ [database] 'ai_channels' column added to guild_config");
    }
    if (!guildConfigColumns.includes('ai_require_mention')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_require_mention INTEGER DEFAULT 1`);
      console.log("✅ [database] 'ai_require_mention' column added to guild_config");
    }
    if (!guildConfigColumns.includes('ai_cooldown_seconds')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_cooldown_seconds INTEGER DEFAULT 15`);
      console.log("✅ [database] 'ai_cooldown_seconds' column added to guild_config");
    }
    if (!guildConfigColumns.includes('ai_channel_prompts')) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ai_channel_prompts TEXT`);
      console.log("✅ [database] 'ai_channel_prompts' column added to guild_config");
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
      if (!guildConfigColumns.includes(col)) {
        db.exec(`ALTER TABLE guild_config ADD COLUMN ${col} INTEGER DEFAULT 1`);
        console.log(`✅ [database] '${col}' column added to guild_config`);
      }
    }

    console.log('✅ [database] All missing columns checked and added');
  } catch (error) {
    console.error('❌ [database] Error adding missing columns:', error);
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

export default db;