// index.js - Main entry point
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { initializeDatabase, getDb } from 'commands/utils/database.js';
import BirthdayScheduler from 'commands/utils/birthdayScheduler.js';
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

// Load commands from subdirectories
const commandFolders = readdirSync('./commands');

for (const folder of commandFolders) {
    const commandFiles = readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        try {
            const command = await import(`./commands/${folder}/${file}`);
            if (command.default?.data?.name) {
                client.commands.set(command.default.data.name, command.default);
                console.log(`✅ Loaded command: ${command.default.data.name} from ${folder}`);
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
client.once('ready', () => {
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