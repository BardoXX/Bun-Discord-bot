{{ ... }}
// Add this function to your database initialization
async function initializeDatabase(db) {
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
        
        CREATE INDEX IF NOT EXISTS idx_ticket_systems_guild_id ON ticket_systems(guild_id);
    `);
    
    console.log('✅ Ticket systems table initialized');
}

export { initializeDatabase };
{{ ... }}
