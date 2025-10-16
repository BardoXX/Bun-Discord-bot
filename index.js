// index.js - Main entry point
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { initializeDatabase, getDb } from 'commands/utils/database.js';
import BirthdayScheduler from 'commands/utils/birthdayScheduler.js';
import GiveawayScheduler from 'commands/utils/giveawayScheduler.js';
import { BirthdaySystem } from 'commands/utils/birthdaySystem.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import Database from 'bun:sqlite';

// Configure client with rate limiting and cache settings
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ],
    rest: {
        retries: 3,
        timeout: 30000,
        offset: 500,
        globalRequestsPerSecond: 45,
        rejectOnRateLimit: (rateLimitData) => {
            console.warn('⚠️ Rate limit hit:', rateLimitData);
            return rateLimitData.timeToReset;
        }
    },
    makeCache: (manager) => {
        // Only cache messages in the client cache
        if (manager.name === 'MessageManager') {
            const collection = new Collection();
            // Manually handle the size limit
            collection.maxSize = 200;
            const originalSet = collection.set;
            collection.set = function(key, value) {
                // If we're at max size, remove oldest message
                if (this.size >= this.maxSize) {
                    const oldest = this.firstKey();
                    if (oldest) this.delete(oldest);
                }
                return originalSet.call(this, key, value);
            };
            return collection;
        }
        // Use default caching for other managers
        return new Collection();
    },
    sweepers: {
        messages: {
            interval: 300, // 5 minutes
            lifetime: 1800 // 30 minutes in seconds
        },
        users: {
            interval: 3600, // 1 hour
            filter: () => [], // Empty array means don't sweep any users
            lifetime: 0
        },
        threads: {
            interval: 3600, // 1 hour
            lifetime: 14400 // 4 hours
        }
    }
});

// Initialize database
initializeDatabase();
const db = getDb();


// Collections for commands and events
client.commands = new Collection();
client.db = db;

console.log('📊 Database initialized with all required tables');

const birthdayScheduler = new BirthdayScheduler(client, db);
const giveawayScheduler = new GiveawayScheduler(client, db);
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

// Deploy commands with rate limit handling
async function deployCommands() {
    try {
        console.log('🔄 Started refreshing application (/) commands.');

        // Check if we recently deployed commands to avoid rate limits
        const lastDeployTime = client.lastDeployTime || 0;
        const timeSinceLastDeploy = Date.now() - lastDeployTime;
        const minDeployInterval = 5 * 60 * 1000; // 5 minutes minimum between deployments

        if (timeSinceLastDeploy < minDeployInterval) {
            console.log(`⏳ Skipping command deployment - last deployment was ${Math.round(timeSinceLastDeploy / 1000)}s ago`);
            return;
        }

        // Prepare commands array with proper JSON structure
        const commands = [];
        for (const [name, command] of client.commands) {
            try {
                // Handle both default and direct exports
                const cmdData = command.data || (command.default && command.default.data);
                if (cmdData) {
                    // Convert to plain object if it's a Discord.js ApplicationCommandData
                    const jsonData = typeof cmdData.toJSON === 'function' ? cmdData.toJSON() : cmdData;
                    commands.push(jsonData);
                }
            } catch (error) {
                console.error(`❌ Error processing command ${name}:`, error);
            }
        }

        if (commands.length === 0) {
            console.log('⚠️ No commands to deploy');
            return;
        }

        const rest = new REST({
            version: '10',
            retries: 5,
            timeout: 60000,
            offset: 1000,
            globalRequestsPerSecond: 1, // Very conservative rate limit
            rejectOnRateLimit: (rateLimitData) => {
                console.warn('⚠️ REST Rate limit hit:', rateLimitData);
                // Return timeToReset + buffer to avoid immediate retry
                return (rateLimitData.timeToReset || 60) * 1000 + 5000;
            }
        }).setToken(process.env.DISCORD_TOKEN);

        console.log(`📤 Deploying ${commands.length} commands...`);
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        // Update last deployment time
        client.lastDeployTime = Date.now();
        console.log(`✅ Successfully deployed ${commands.length} application (/) commands.`);

    } catch (error) {
        if (error.code === 429) {
            console.error('❌ Rate limited by Discord API. Will retry later.');
        } else {
            console.error('❌ Error deploying commands:', error.message);
        }
        // Don't throw the error to prevent bot crash
    }
}

// Load environment variables
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
    console.error('❌ DISCORD_TOKEN and CLIENT_ID must be set in .env file');
    process.exit(1);
}

// Initialize database
try {
    console.log('🔄 Initializing database...');
    initializeDatabase();
    console.log('✅ Database initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize database:', error);
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
    giveawayScheduler.start();
});

client.birthdayScheduler = birthdayScheduler;
client.giveawayScheduler = giveawayScheduler;

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🔄 Shutting down bot...');
    db.close();
    client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);