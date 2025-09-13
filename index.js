// index.js - Main entry point
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { initializeDatabase, getDb } from 'commands/utils/database.js';
import BirthdayScheduler from 'commands/utils/birthdayScheduler.js';
import { BirthdaySystem } from 'commands/utils/birthdaySystem.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import Database from 'bun:sqlite';

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ] 
});

// Initialize database
initializeDatabase();
const db = getDb();


// Collections for commands and events
client.commands = new Collection();
client.db = db;

console.log('📊 Database initialized with all required tables');

const birthdayScheduler = new BirthdayScheduler(client, db);
const birthdaySystem = new BirthdaySystem(db);
client.birthdaySystem = birthdaySystem;

// Load commands from subdirectories
const commandFolders = readdirSync('./commands');

for (const folder of commandFolders) {
    const commandFiles = readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        try {
            console.log(`🔍 Loading command: ${folder}/${file}`);
            const command = await import(`./commands/${folder}/${file}`);
            if (command.default?.data?.name) {
                client.commands.set(command.default.data.name, command.default);
                console.log(`✅ Loaded command: ${command.default.data.name} from ${folder}`);
            } else if (command.data?.name) {
                // Handle direct exports (without default)
                client.commands.set(command.data.name, command);
                console.log(`✅ Loaded command (direct): ${command.data.name} from ${folder}`);
            } else {
                console.warn(`⚠️ Skipping ${file}: No valid command data found`);
            }
        } catch (error) {
            console.error(`❌ Failed to load command ${file}:`, error);
        }
    }
}

// Load events
const eventFiles = readdirSync('./events').filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    try {
        const event = await import(`./events/${file}`);
        if (event.default?.once) {
            client.once(event.default.name, (...args) => event.default.execute(...args));
        } else {
            client.on(event.default?.name, (...args) => event.default?.execute(...args));
        }
        console.log(`✅ Loaded event: ${event.default?.name}`);
    } catch (error) {
        console.error(`❌ Failed to load event ${file}:`, error);
    }
}

// Deploy commands
async function deployCommands() {
    try {
        console.log('🔄 Started refreshing application (/) commands.');

        // Gebruik de commands die al geladen zijn in de client.commands collectie
        const commands = client.commands.map(command => command.data.toJSON());

        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ Successfully reloaded ${commands.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
}

// Load environment variables
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
    console.error('❌ DISCORD_TOKEN and CLIENT_ID must be set in .env file');
    process.exit(1);
}

// Deploy commands on startup
client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} is online!`);
    
    // Create necessary tables if they don't exist
    try {
        await client.db.exec(`
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
    } catch (error) {
        console.error('❌ Failed to initialize ticket systems table:', error);
    }
    
    console.log(`🤖 Bot is ready! Logged in as ${client.user.tag}`);
    deployCommands();
    birthdayScheduler.start();
});

client.birthdayScheduler = birthdayScheduler;

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🔄 Shutting down bot...');
    db.close();
    client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);