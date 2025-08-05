import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { createTicketEmbed } from '../utils/ticketSystem.js';

export default {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configureer de bot instellingen')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('welkom')
                .setDescription('Stel welkomstberichten in')
                // Verplichte opties eerst
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het kanaal voor welkomstberichten')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                // Optionele opties daarna
                .addRoleOption(option =>
                    option.setName('rol')
                        .setDescription('De rol die toegewezen moet worden aan nieuwe leden')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('titel')
                        .setDescription('De titel van het welkomstbericht')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('bericht')
                        .setDescription('Het welkomstbericht ({user}, {guild}, {member_count})')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('kleur')
                        .setDescription('De kleur van de embed (hex code, bijv. #00ff00)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('afbeelding')
                        .setDescription('De URL van de afbeelding in de embed (gebruik "user_avatar" voor de profielfoto)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('footer')
                        .setDescription('De footer tekst van de embed')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('embed_enabled')
                        .setDescription('Of de welkomstboodschap een embed moet zijn')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tickets')
                .setDescription('Stel ticket systeem in')
                // Verplichte opties eerst
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het kanaal waar het ticket bericht komt')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('categorie')
                        .setDescription('De categorie waar tickets worden aangemaakt')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true))
                // Optionele opties daarna
                .addRoleOption(option =>
                    option.setName('staff_rol')
                        .setDescription('De rol die tickets kan claimen')
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('log_kanaal')
                        .setDescription('Het kanaal waar ticket logs naartoe worden gestuurd')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tellen')
                .setDescription('Stel tel kanaal in')
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het kanaal voor tellen')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('birthday')
                .setDescription('Stel verjaardag kanaal in')
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het kanaal voor verjaardagen')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('shop')
                .setDescription('Shop instellingen beheren')
                // Verplichte opties eerst
                .addStringOption(option =>
                    option.setName('actie')
                        .setDescription('Wat wil je doen?')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Item toevoegen', value: 'add' },
                            { name: 'Item verwijderen', value: 'remove' },
                            { name: 'Shop bekijken', value: 'view' },
                            { name: 'Shop resetten', value: 'reset' }
                        ))
                .addStringOption(option =>
                    option.setName('naam')
                        .setDescription('Naam van het item')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('beschrijving')
                        .setDescription('Beschrijving van het item')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('prijs')
                        .setDescription('Prijs van het item')
                        .setRequired(false)
                        .setMinValue(1))
                .addStringOption(option =>
                    option.setName('categorie')
                        .setDescription('Categorie van het item')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Jobs', value: 'Jobs' },
                            { name: 'Ranks', value: 'Ranks' },
                            { name: 'Items', value: 'Items' },
                            { name: 'Boosters', value: 'Boosters' },
                            { name: 'Cosmetics', value: 'Cosmetics' },
                            { name: 'Tools', value: 'Tools' },
                            { name: 'Food', value: 'Food' },
                            { name: 'Other', value: 'Other' }
                        ))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type van het item')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Job Unlock', value: 'job' },
                            { name: 'Rank/Role', value: 'role' },
                            { name: 'Money Multiplier', value: 'multiplier' },
                            { name: 'Cosmetic Item', value: 'cosmetic' },
                            { name: 'Other', value: 'other' }
                        ))
                .addStringOption(option =>
                    option.setName('data')
                        .setDescription('Extra data (bijv. role ID, job naam, multiplier waarde)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('levels')
                .setDescription('Stel level systeem in')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Level systeem aan/uit')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('level_up_kanaal')
                        .setDescription('Het kanaal waar level up berichten komen')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('xp_per_message')
                        .setDescription('Hoeveel XP per bericht (standaard: 15-25)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100))
                .addIntegerOption(option =>
                    option.setName('xp_per_minute_voice')
                        .setDescription('Hoeveel XP per minuut in voice (standaard: 5)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(50))
                .addIntegerOption(option =>
                    option.setName('message_cooldown')
                        .setDescription('Cooldown tussen XP berichten in seconden (standaard: 60)')
                        .setRequired(false)
                        .setMinValue(10)
                        .setMaxValue(300)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('member_count')
                .setDescription('Stel member count voice kanaal in')
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het voice kanaal dat de member count toont')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('format')
                        .setDescription('Het format voor de member count (gebruik {count} voor aantal)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('invites')
                .setDescription('Stel invite tracking in')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Invite tracking aan/uit')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('log_kanaal')
                        .setDescription('Het kanaal waar invite logs komen')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
                subcommand
                    .setName('warns')
                    .setDescription('Waarschuwingssysteem instellen')
                    .addBooleanOption(option =>
                        option.setName('enabled')
                            .setDescription('Waarschuwingssysteem aan/uit')
                            .setRequired(true)))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Bekijk huidige configuratie')),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 }); 

        const subcommand = interaction.options.getSubcommand();
        const db = interaction.client.db;
        
        console.log(`⚙️ [config] Processing subcommand: ${subcommand} for user ${interaction.user.tag}`);
        
        try {
            await ensureConfigTableExists(db);

            switch (subcommand) {
                case 'welkom':
                    await handleWelcomeConfig(interaction, db);
                    break;
                case 'tickets':
                    await handleTicketConfig(interaction, db);
                    break;
                case 'tellen':
                    await handleCountingConfig(interaction, db);
                    break;
                case 'birthday':
                    await handleBirthdayConfig(interaction, db);
                    break;
                case 'view':
                    await handleViewConfig(interaction, db);
                    break;
                case 'shop':
                    await handleShopConfig(interaction, db);
                    break;
                case 'levels':
                    await handleLevelsConfig(interaction, db);
                    break;
                case 'member_count':
                    await handleMemberCountConfig(interaction, db);
                    break;
                case 'invites':
                    await handleInvitesConfig(interaction, db);
                    break;
                case 'warns':
                    await handleWarnsConfig(interaction, db);
                    break;
                default:
                    console.error(`❌ [config] Unknown subcommand: ${subcommand}`);
                    const unknownEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Onbekend Subcommando')
                        .setDescription(`Het subcommando "${subcommand}" is onbekend.`)
                        .setTimestamp();
                    await interaction.editReply({ embeds: [unknownEmbed] });
                    break;
            }
            
            console.log(`✅ [config] Subcommand ${subcommand} completed successfully`);
            
        } catch (error) {
            console.error(`❌ [config] Error in subcommand ${subcommand}:`, error);
            
            // Check if we can still respond
            if (!interaction.replied) {
                try {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Er is een fout opgetreden')
                        .setDescription('Er is een onverwachte fout opgetreden bij het uitvoeren van dit commando. Probeer het later opnieuw.')
                        .setTimestamp();

                    await interaction.editReply({ embeds: [errorEmbed] });
                } catch (replyError) {
                    console.error('❌ [config] Failed to send error message:', replyError.message);
                }
            }
        }
    },
};

async function ensureConfigTableExists(db) {
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS guild_config (
                guild_id TEXT PRIMARY KEY
            )
        `).run();
        
        const columns = [
            { name: 'welcome_channel', type: 'TEXT' },
            { name: 'welcome_role', type: 'TEXT' },
            { name: 'welcome_title', type: 'TEXT' },
            { name: 'welcome_message', type: 'TEXT' },
            { name: 'welcome_color', type: 'TEXT' },
            { name: 'welcome_image', type: 'TEXT' },
            { name: 'welcome_footer', type: 'TEXT' },
            { name: 'welcome_embed_enabled', type: 'INTEGER' },
            { name: 'counting_channel', type: 'TEXT' },
            { name: 'counting_number', type: 'INTEGER' },
            { name: 'birthday_channel', type: 'TEXT' },
            { name: 'ticket_channel', type: 'TEXT' },
            { name: 'ticket_category', type: 'TEXT' },
            { name: 'ticket_staff_role', type: 'TEXT' },
            { name: 'ticket_log_channel', type: 'TEXT' },
            { name: 'levels_enabled', type: 'INTEGER' },
            { name: 'level_up_channel', type: 'TEXT' },
            { name: 'xp_per_message', type: 'INTEGER' },
            { name: 'xp_per_minute_voice', type: 'INTEGER' },
            { name: 'message_cooldown', type: 'INTEGER' },
            { name: 'member_count_channel', type: 'TEXT' },
            { name: 'member_count_format', type: 'TEXT' },
            { name: 'invites_enabled', type: 'INTEGER' },
            { name: 'invite_log_channel', type: 'TEXT' }
        ];

        // Get existing columns from table
        const existingColumns = db.prepare('PRAGMA table_info(guild_config)').all().map(c => c.name);

        // Add missing columns
        for (const col of columns) {
            if (!existingColumns.includes(col.name)) {
                console.log(`📊 [config] Adding missing column "${col.name}" to guild_config table.`);
                db.prepare(`ALTER TABLE guild_config ADD COLUMN ${col.name} ${col.type}`).run();
            }
        }
        
        // Create additional tables for leveling system
        createLevelingTables(db);
        createInviteTrackingTables(db);
        
    } catch (e) {
        console.error('❌ [config] Error ensuring guild_config table exists:', e);
    }
}

function createLevelingTables(db) {
    // User levels table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_levels (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 0,
            total_xp INTEGER DEFAULT 0,
            last_message DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, guild_id)
        )
    `).run();

    // User boosters table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_boosters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            type TEXT NOT NULL,
            multiplier REAL NOT NULL,
            expires_at DATETIME NOT NULL,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // Voice activity tracking
    db.prepare(`
        CREATE TABLE IF NOT EXISTS voice_activity (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            joined_at DATETIME NOT NULL,
            PRIMARY KEY (user_id, guild_id)
        )
    `).run();
}

function createInviteTrackingTables(db) {
    // Invite tracking table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS invite_tracking (
            guild_id TEXT NOT NULL,
            invite_code TEXT NOT NULL,
            inviter_id TEXT NOT NULL,
            uses INTEGER DEFAULT 0,
            max_uses INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id, invite_code)
        )
    `).run();

    // User invites table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_invites (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            invites INTEGER DEFAULT 0,
            fake_invites INTEGER DEFAULT 0,
            left_invites INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, guild_id)
        )
    `).run();
}

async function handleWelcomeConfig(interaction, db) {
    const channel = interaction.options.getChannel('kanaal');
    const role = interaction.options.getRole('rol');
    const title = interaction.options.getString('titel');
    const message = interaction.options.getString('bericht');
    const color = interaction.options.getString('kleur');
    const image = interaction.options.getString('afbeelding');
    const footer = interaction.options.getString('footer');
    const embedEnabled = interaction.options.getBoolean('embed_enabled');

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO guild_config (
            guild_id, 
            welcome_channel, 
            welcome_role, 
            welcome_title, 
            welcome_message, 
            welcome_color, 
            welcome_image, 
            welcome_footer, 
            welcome_embed_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
        interaction.guild.id, 
        channel.id, 
        role?.id, 
        title, 
        message, 
        color, 
        image, 
        footer,
        embedEnabled === true ? 1 : 0
    );

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Welkomst Configuratie')
        .addFields(
            { name: 'Kanaal', value: `${channel}`, inline: true },
            { name: 'Rol', value: role ? `${role}` : 'Niet ingesteld', inline: true },
            { name: 'Embed Aan?', value: embedEnabled ? 'Ja' : 'Nee', inline: true },
            { name: 'Titel', value: title || 'Niet ingesteld', inline: false },
            { name: 'Bericht', value: message || 'Niet ingesteld', inline: false },
            { name: 'Kleur', value: color || 'Niet ingesteld', inline: true },
            { name: 'Afbeelding', value: image || 'Niet ingesteld', inline: true },
            { name: 'Footer', value: footer || 'Niet ingesteld', inline: false }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleTicketConfig(interaction, db) {
    const channel = interaction.options.getChannel('kanaal');
    const category = interaction.options.getChannel('categorie');
    const staffRole = interaction.options.getRole('staff_rol');
    const logChannel = interaction.options.getChannel('log_kanaal');

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO guild_config (guild_id, ticket_channel, ticket_category, ticket_staff_role, ticket_log_channel) 
        VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(interaction.guild.id, channel.id, category.id, staffRole?.id, logChannel?.id);

    await createTicketEmbed(channel);

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🎫 Ticket Systeem Configuratie')
        .addFields(
            { name: 'Kanaal', value: `${channel}`, inline: true },
            { name: 'Categorie', value: `${category}`, inline: true },
            { name: 'Staff Rol', value: staffRole ? `${staffRole}` : 'Niet ingesteld', inline: true },
            { name: 'Log Kanaal', value: logChannel ? `${logChannel}` : 'Niet ingesteld', inline: true }
        )
        .setDescription('Ticket bericht is aangemaakt in het gekozen kanaal!')
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleCountingConfig(interaction, db) {
    const channel = interaction.options.getChannel('kanaal');

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO guild_config (guild_id, counting_channel, counting_number) 
        VALUES (?, ?, 0)
    `);
    
    stmt.run(interaction.guild.id, channel.id);

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔢 Tel Kanaal Configuratie')
        .addFields(
            { name: 'Kanaal', value: `${channel}`, inline: true },
            { name: 'Startgetal', value: '0', inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleBirthdayConfig(interaction, db) {
    const channel = interaction.options.getChannel('kanaal');

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO guild_config (guild_id, birthday_channel) 
        VALUES (?, ?)
    `);
    
    stmt.run(interaction.guild.id, channel.id);

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🎂 Verjaardag Kanaal Configuratie')
        .addFields(
            { name: 'Kanaal', value: `${channel}`, inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleShopConfig(interaction, db) {
    const action = interaction.options.getString('actie');
    const name = interaction.options.getString('naam');
    const description = interaction.options.getString('beschrijving');
    const price = interaction.options.getInteger('prijs');
    const category = interaction.options.getString('categorie');
    const type = interaction.options.getString('type');
    const data = interaction.options.getString('data');
    const guildId = interaction.guild.id;

    console.log(`🏪 [config.shop] Processing action: ${action} for guild ${interaction.guild.name}`);

    switch (action) {
        case 'add':
            if (!name || !price) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Fout')
                    .setDescription('Naam en prijs zijn verplicht om een item toe te voegen!')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const stmt = db.prepare(`
                INSERT INTO shop_items (guild_id, name, description, price, category, type, data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(
                guildId,
                name,
                description || 'Geen beschrijving',
                price,
                category || 'Other',
                type || 'other',
                data
            );

            console.log(`✅ [config.shop] Added item "${name}" for ${price} coins`);

            const addEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🏪 Item Toegevoegd')
                .addFields(
                    { name: 'Naam', value: name, inline: true },
                    { name: 'Prijs', value: `${price} coins`, inline: true },
                    { name: 'Categorie', value: category || 'Other', inline: true },
                    { name: 'Type', value: type || 'other', inline: true },
                    { name: 'Beschrijving', value: description || 'Geen beschrijving', inline: false }
                )
                .setTimestamp();

            if (data) {
                addEmbed.addFields({ name: 'Extra Data', value: data, inline: false });
            }

            await interaction.editReply({ embeds: [addEmbed] });
            break;

        case 'remove':
            if (!name) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Fout')
                    .setDescription('Naam is verplicht om een item te verwijderen!')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const deleteStmt = db.prepare('DELETE FROM shop_items WHERE guild_id = ? AND name = ?');
            const result = deleteStmt.run(guildId, name);

            if (result.changes === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚠️ Niet Gevonden')
                    .setDescription(`Item "${name}" niet gevonden in de shop.`)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            console.log(`🗑️ [config.shop] Removed item "${name}"`);

            const removeEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🗑️ Item Verwijderd')
                .setDescription(`Item "${name}" is succesvol verwijderd uit de shop.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [removeEmbed] });
            break;

        case 'view':
            const viewStmt = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? ORDER BY category, price');
            const items = viewStmt.all(guildId);

            if (!items || items.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('🏪 Shop Leeg')
                    .setDescription('Er zijn nog geen items in de shop.')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const categories = {};
            items.forEach(item => {
                if (!categories[item.category]) {
                    categories[item.category] = [];
                }
                categories[item.category].push(item);
            });

            const viewEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🏪 Shop Overzicht')
                .setDescription(`Totaal ${items.length} items in de shop`)
                .setTimestamp();

            Object.keys(categories).forEach(cat => {
                const categoryItems = categories[cat];
                const itemList = categoryItems.map(item => 
                    `**${item.name}** - ${item.price} coins (${item.type})`
                ).join('\n');
                
                viewEmbed.addFields({
                    name: `${getCategoryEmoji(cat)} ${cat} (${categoryItems.length})`,
                    value: itemList.length > 1024 ? itemList.substring(0, 1021) + '...' : itemList,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [viewEmbed] });
            break;

        case 'reset':
            const resetStmt = db.prepare('DELETE FROM shop_items WHERE guild_id = ?');
            const resetResult = resetStmt.run(guildId);

            const resetEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🗑️ Shop Gereset')
                .setDescription(`Alle ${resetResult.changes} items zijn verwijderd uit de shop.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [resetEmbed] });
            break;
    }
}

async function handleLevelsConfig(interaction, db) {
    const enabled = interaction.options.getBoolean('enabled');
    const levelUpChannel = interaction.options.getChannel('level_up_kanaal');
    const xpPerMessage = interaction.options.getInteger('xp_per_message') || 20;
    const xpPerMinuteVoice = interaction.options.getInteger('xp_per_minute_voice') || 5;
    const messageCooldown = interaction.options.getInteger('message_cooldown') || 60;

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO guild_config (
            guild_id, 
            levels_enabled, 
            level_up_channel, 
            xp_per_message, 
            xp_per_minute_voice, 
            message_cooldown
        ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
        interaction.guild.id, 
        enabled ? 1 : 0, 
        levelUpChannel?.id, 
        xpPerMessage, 
        xpPerMinuteVoice, 
        messageCooldown
    );

    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00ff00' : '#ff9900')
        .setTitle('📊 Level Systeem Configuratie')
        .addFields(
            { name: 'Status', value: enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld', inline: true },
            { name: 'Level Up Kanaal', value: levelUpChannel ? `${levelUpChannel}` : 'Niet ingesteld', inline: true },
            { name: 'XP per Bericht', value: `${xpPerMessage}`, inline: true },
            { name: 'XP per Minuut Voice', value: `${xpPerMinuteVoice}`, inline: true },
            { name: 'Bericht Cooldown', value: `${messageCooldown}s`, inline: true }
        )
        .setTimestamp();

    if (enabled) {
        embed.setDescription('Het level systeem is nu actief! Gebruikers krijgen XP voor berichten en voice chat.');
    } else {
        embed.setDescription('Het level systeem is uitgeschakeld.');
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleMemberCountConfig(interaction, db) {
    const channel = interaction.options.getChannel('kanaal');
    const format = interaction.options.getString('format') || 'Leden: {count}';

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO guild_config (guild_id, member_count_channel, member_count_format) 
        VALUES (?, ?, ?)
    `);
    
    stmt.run(interaction.guild.id, channel.id, format);

    // Update the channel name immediately
    try {
        const memberCount = interaction.guild.memberCount;
        const channelName = format.replace('{count}', memberCount);
        await channel.setName(channelName);
    } catch (error) {
        console.error('❌ [config] Error updating member count channel:', error);
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('👥 Member Count Configuratie')
        .addFields(
            { name: 'Kanaal', value: `${channel}`, inline: true },
            { name: 'Format', value: format, inline: true },
            { name: 'Huidige Count', value: `${interaction.guild.memberCount}`, inline: true }
        )
        .setDescription('Het member count kanaal is ingesteld en wordt automatisch bijgewerkt!')
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleInvitesConfig(interaction, db) {
    const enabled = interaction.options.getBoolean('enabled');
    const logChannel = interaction.options.getChannel('log_kanaal');

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO guild_config (guild_id, invites_enabled, invite_log_channel) 
        VALUES (?, ?, ?)
    `);
    
    stmt.run(interaction.guild.id, enabled ? 1 : 0, logChannel?.id);

    if (enabled) {
        // Initialize invite tracking for this guild
        try {
            const invites = await interaction.guild.invites.fetch();
            const deleteStmt = db.prepare('DELETE FROM invite_tracking WHERE guild_id = ?');
            deleteStmt.run(interaction.guild.id);

            const insertStmt = db.prepare(`
                INSERT INTO invite_tracking (guild_id, invite_code, inviter_id, uses, max_uses)
                VALUES (?, ?, ?, ?, ?)
            `);

            invites.forEach(invite => {
                insertStmt.run(
                    interaction.guild.id,
                    invite.code,
                    invite.inviter?.id || 'unknown',
                    invite.uses || 0,
                    invite.maxUses || 0
                );
            });

            console.log(`📊 [config] Initialized invite tracking with ${invites.size} invites`);
        } catch (error) {
            console.error('❌ [config] Error initializing invite tracking:', error);
        }
    }

    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00ff00' : '#ff9900')
        .setTitle('📨 Invite Tracking Configuratie')
        .addFields(
            { name: 'Status', value: enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld', inline: true },
            { name: 'Log Kanaal', value: logChannel ? `${logChannel}` : 'Niet ingesteld', inline: true }
        )
        .setTimestamp();

    if (enabled) {
        embed.setDescription('Invite tracking is nu actief! De bot houdt bij wie welke invites gebruikt.');
    } else {
        embed.setDescription('Invite tracking is uitgeschakeld.');
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleViewConfig(interaction, db) {
    const stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    const config = stmt.get(interaction.guild.id);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('⚙️ Server Configuratie')
        .setTimestamp();

    if (!config) {
        embed.setDescription('Geen configuratie gevonden. Gebruik de config commando\'s om de bot in te stellen.');
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    const fields = [];
    
    if (config.welcome_channel) {
        fields.push({
            name: '👋 Welkomst',
            value: `Kanaal: <#${config.welcome_channel}>\n${config.welcome_role ? `Rol: <@&${config.welcome_role}>` : 'Rol: Niet ingesteld'}\nEmbed: ${config.welcome_embed_enabled ? 'Ja' : 'Nee'}\nTitel: ${config.welcome_title || 'Niet ingesteld'}\nBericht: ${config.welcome_message || 'Niet ingesteld'}\nKleur: ${config.welcome_color || 'Niet ingesteld'}\nAfbeelding: ${config.welcome_image || 'Niet ingesteld'}\nFooter: ${config.welcome_footer || 'Niet ingesteld'}`,
            inline: false
        });
    }

    if (config.ticket_channel) {
        fields.push({
            name: '🎫 Tickets',
            value: `Kanaal: <#${config.ticket_channel}>\nCategorie: <#${config.ticket_category}>\nStaff Rol: ${config.ticket_staff_role ? `<@&${config.ticket_staff_role}>` : 'Niet ingesteld'}\nLog Kanaal: ${config.ticket_log_channel ? `<#${config.ticket_log_channel}>` : 'Niet ingesteld'}`,
            inline: false
        });
    }

    if (config.counting_channel) {
        fields.push({
            name: '🔢 Tellen',
            value: `Kanaal: <#${config.counting_channel}>\nHuidig getal: ${config.counting_number || 0}`,
            inline: false
        });
    }

    if (config.birthday_channel) {
        fields.push({
            name: '🎂 Verjaardagen',
            value: `Kanaal: <#${config.birthday_channel}>`,
            inline: false
        });
    }

    if (config.levels_enabled) {
        fields.push({
            name: '📊 Level Systeem',
            value: `Status: ${config.levels_enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld'}\nLevel Up Kanaal: ${config.level_up_channel ? `<#${config.level_up_channel}>` : 'Niet ingesteld'}\nXP per Bericht: ${config.xp_per_message || 20}\nXP per Minuut Voice: ${config.xp_per_minute_voice || 5}\nBericht Cooldown: ${config.message_cooldown || 60}s`,
            inline: false
        });
    }

    if (config.member_count_channel) {
        fields.push({
            name: '👥 Member Count',
            value: `Kanaal: <#${config.member_count_channel}>\nFormat: ${config.member_count_format || 'Leden: {count}'}`,
            inline: false
        });
    }

    if (config.invites_enabled) {
        fields.push({
            name: '📨 Invite Tracking',
            value: `Status: ${config.invites_enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld'}\nLog Kanaal: ${config.invite_log_channel ? `<#${config.invite_log_channel}>` : 'Niet ingesteld'}`,
            inline: false
        });
    }

    if (fields.length === 0) {
        embed.setDescription('Geen modules geconfigureerd.');
    } else {
        embed.addFields(fields);
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleWarnsConfig(interaction, db) {
    const guildId = interaction.guild.id;
    const enabled = interaction.options.getBoolean('enabled');

    const stmt = db.prepare(`
        INSERT INTO guild_config (guild_id, warns_enabled)
        VALUES (?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET warns_enabled = excluded.warns_enabled
    `);
    stmt.run(guildId, enabled ? 1 : 0);

    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00ff00' : '#ff0000')
        .setTitle('⚠️ Waarschuwingssysteem bijgewerkt')
        .setDescription(`Het waarschuwingssysteem is nu **${enabled ? 'ingeschakeld' : 'uitgeschakeld'}**.`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

function getCategoryEmoji(category) {
    const emojis = {
        'Jobs': '💼',
        'Ranks': '🏆',
        'Items': '📦',
        'Boosters': '⚡',
        'Cosmetics': '✨',
        'Tools': '🔧',
        'Food': '🍕',
        'Other': '❓'
    };
    return emojis[category] || '📦';
}