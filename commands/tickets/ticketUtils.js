import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, Colors, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

/**
 * Error class for ticket-related errors
 */
class TicketError extends Error {
    constructor(message, userFriendlyMessage = 'Er is een fout opgetreden met het ticketsysteem.') {
        super(message);
        this.name = 'TicketError';
        this.userFriendlyMessage = userFriendlyMessage;
    }
}

/**
 * Database table initialization with proper error handling and indexes
 */

export function createTicketTables(db) {
    try {
        // Enable foreign key support for bun:sqlite
        db.run('PRAGMA foreign_keys = ON');

        // Create systems table for global settings
        db.run(`
            CREATE TABLE IF NOT EXISTS ticket_systems (
                guild_id TEXT PRIMARY KEY,
                max_tickets_per_user INTEGER DEFAULT 3,
                log_channel_id TEXT DEFAULT '',
                support_role_id TEXT DEFAULT '',
                channel_id TEXT DEFAULT '',
                category_id TEXT DEFAULT '',
                ticket_counter INTEGER DEFAULT 0
            )`);

        // Ensure all expected columns exist (migrations for older DBs)
        try {
            const cols = db.prepare(`PRAGMA table_info(ticket_systems)`).all().map(c => c.name);
            if (!cols.includes('max_tickets_per_user')) {
                db.exec(`ALTER TABLE ticket_systems ADD COLUMN max_tickets_per_user INTEGER DEFAULT 3`);
            }
            if (!cols.includes('log_channel_id')) {
                db.exec(`ALTER TABLE ticket_systems ADD COLUMN log_channel_id TEXT DEFAULT ''`);
            }
            if (!cols.includes('support_role_id')) {
                db.exec(`ALTER TABLE ticket_systems ADD COLUMN support_role_id TEXT DEFAULT ''`);
            }
            if (!cols.includes('channel_id')) {
                db.exec(`ALTER TABLE ticket_systems ADD COLUMN channel_id TEXT DEFAULT ''`);
            }
            if (!cols.includes('category_id')) {
                db.exec(`ALTER TABLE ticket_systems ADD COLUMN category_id TEXT DEFAULT ''`);
            }
            if (!cols.includes('ticket_counter')) {
                db.exec(`ALTER TABLE ticket_systems ADD COLUMN ticket_counter INTEGER DEFAULT 0`);
            }
        } catch {}

        // Create ticket categories table
        // Create tables one by one
        db.run(`
            CREATE TABLE IF NOT EXISTS ticket_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                emoji TEXT,
                category_id TEXT,
                support_roles TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, name)
            )`);
            
        db.run(`
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL UNIQUE,
                user_id TEXT NOT NULL,
                category_id INTEGER,
                status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed', 'resolved', 'pending')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMP,
                closed_by TEXT,
                transcript_url TEXT,
                claimed_by TEXT,
                claimed_at TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES ticket_categories (id) ON DELETE SET NULL
            )`);
            
        db.run(`
            CREATE TABLE IF NOT EXISTS ticket_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER NOT NULL,
                message_id TEXT NOT NULL,
                author_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                attachments TEXT,
                system BOOLEAN DEFAULT 0,
                FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
                UNIQUE(ticket_id, message_id)
            )`);
            
        // Create indexes
        db.run('CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)');
        db.run('CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id)');
        
        console.log('✅ Ticket tables initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing ticket tables:', error);
        throw new TicketError('Failed to initialize ticket database', 'Er is een fout opgetreden bij het initialiseren van de database.');
    }
}

export async function showConfigPanel(interaction, db) {
    try {
        const categories = await getTicketCategories(db, interaction.guild.id);

        const embed = new EmbedBuilder()
            .setTitle('📋 Ticket Configuratie')
            .setDescription('Beheer hier alle instellingen voor het ticketsysteem.')
            .setColor(Colors.Blue)
            .addFields(
                { name: 'Categorieën', value: categories.length > 0 ? categories.map(c => `${c.emoji || '📌'} **${c.name}**`).join('\n') : 'Geen categorieën gevonden', inline: false },
                { name: 'Standaard instellingen', value: 'Configureer hier de standaard instellingen voor tickets', inline: false }
            )
            .setFooter({ text: 'Kies een optie hieronder om te bewerken' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_config_categories')
                .setLabel('Beheer Categorieën')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId('ticket_config_create_panel')
                .setLabel('Plaats ticket in kanaal')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🧩'),
            new ButtonBuilder()
                .setCustomId('ticket_config_settings')
                .setLabel('Instellingen')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚙️')
        );

        // Always defer if not already handled
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
        }

        await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error('Error showing config panel:', error);
        throw new TicketError('Failed to show config panel', 'Er is een fout opgetreden bij het tonen van het configuratiescherm.');
    }
}

export function getTicketCategories(db, guildId) {
    try {
        const stmt = db.prepare('SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY name ASC');
        return stmt.all(guildId);
    } catch (error) {
        console.error('Error getting ticket categories:', error);
        return [];
    }
}

export async function createTicketCategory(db, guildId, name, description, emoji = '📋', categoryId = null, supportRoles = []) {
    try {
        const stmt = db.prepare(`
            INSERT INTO ticket_categories (guild_id, name, description, emoji, category_id, support_roles) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(guildId, name, description, emoji, categoryId, JSON.stringify(supportRoles));
        
        return {
            id: result.lastInsertRowid,
            guild_id: guildId,
            name,
            description,
            emoji,
            category_id: categoryId,
            support_roles: supportRoles
        };
    } catch (error) {
        console.error('Error creating ticket category:', error);
        throw new TicketError('Failed to create ticket category', 'Er is een fout opgetreden bij het aanmaken van de categorie.');
    }
}

export async function deleteTicketCategory(db, guildId, categoryId) {
    try {
        const stmt = db.prepare('DELETE FROM ticket_categories WHERE id = ? AND guild_id = ?');
        stmt.run(categoryId, guildId);
        return true;
    } catch (error) {
        console.error('Error deleting ticket category:', error);
        throw new TicketError('Failed to delete ticket category', 'Er is een fout opgetreden bij het verwijderen van de categorie.');
    }
}

export async function handleCategoryManagement(interaction, db) {
    const categories = getTicketCategories(db, interaction.guild.id);

    const embed = new EmbedBuilder()
        .setTitle('📋 Beheer Ticket Categorieën')
        .setDescription('Beheer hier alle ticket categorieën.')
        .setColor(Colors.Blue);

    const buttons = [
        new ButtonBuilder()
            .setCustomId('ticket_category_add')
            .setLabel('Toevoegen')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➕'),
        new ButtonBuilder()
            .setCustomId('ticket_category_delete')
            .setLabel('Verwijderen')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(categories.length === 0),
        new ButtonBuilder()
            .setCustomId('ticket_category_set_discord_category')
            .setLabel('Discord Categorie Instellen')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📁')
            .setDisabled(categories.length === 0)
    ];

    if (categories.length > 0) {
        embed.addFields({
            name: 'Huidige Categorieën',
            value: categories.map(c => `${c.emoji || '📌'} **${c.name}**\n└─ Discord Categorie: ${c.category_id ? `<#${c.category_id}>` : 'Geen'}`).join('\n\n'),
            inline: false
        });
    }

    const row = new ActionRowBuilder().addComponents(buttons);
    const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_config_back')
            .setLabel('Terug')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );

    // Always defer if not already handled
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    await interaction.editReply({
        embeds: [embed],
        components: [row, backButton]
    });
}

/**
 * Get ticket configuration for a guild
 * @param {Object} db - Database connection
 * @param {string} guildId - Guild ID
 * @returns {Object} Ticket configuration
 */
export function getTicketConfig(db, guildId) {
    if (!db || !guildId) {
        throw new TicketError('Missing required parameters', 'Ongeldige aanvraag.');
    }
    
    try {
        const categories = db.prepare('SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY name ASC').all(guildId);
        // Ensure ticket_systems row exists for this guild
        const sysRow = db.prepare('SELECT * FROM ticket_systems WHERE guild_id = ?').get(guildId);
        if (!sysRow) {
            db.prepare(`INSERT INTO ticket_systems (guild_id, max_tickets_per_user, log_channel_id, support_role_id, channel_id, category_id, ticket_counter) VALUES (?, 3, '', '', '', '', 0)`).run(guildId);
        }
        const sys = sysRow || { max_tickets_per_user: 3, log_channel_id: '', support_role_id: '', channel_id: '', category_id: '', ticket_counter: 0 };
        
        return {
            categories: categories || [],
            max_tickets_per_user: Number.isFinite(Number(sys.max_tickets_per_user)) ? Number(sys.max_tickets_per_user) : 3,
            log_channel_id: sys.log_channel_id || '',
            support_role_id: sys.support_role_id || '',
            channel_id: sys.channel_id || '',
            category_id: sys.category_id || '',
            ticket_counter: Number.isFinite(Number(sys.ticket_counter)) ? Number(sys.ticket_counter) : 0,
        };
    } catch (error) {
        console.error(`❌ Error getting ticket config for guild ${guildId}:`, error);
        throw new TicketError('Failed to get ticket config', 'Kon de ticketconfiguratie niet ophalen.');
    }
}

export function setMaxTicketsPerUser(db, guildId, value) {
    try {
        const row = db.prepare('SELECT 1 FROM ticket_systems WHERE guild_id = ?').get(guildId);
        if (!row) db.prepare('INSERT INTO ticket_systems (guild_id, max_tickets_per_user, log_channel_id, support_role_id, channel_id, category_id, ticket_counter) VALUES (?, ?, \'\', \'\', \'\', \'\', 0)').run(guildId, value);
        else db.prepare('UPDATE ticket_systems SET max_tickets_per_user = ? WHERE guild_id = ?').run(value, guildId);
        return true;
    } catch (error) {
        console.error('❌ Error setting max_tickets_per_user:', error);
        throw new TicketError('Failed to update settings', 'Kon de instellingen niet opslaan.');
    }
}

/**
 * Build the ticket panel embed
 * @param {Guild} guild - Discord Guild
 * @param {Object} config - Ticket configuration
 * @returns {EmbedBuilder} Embed for the ticket panel
 */
export function buildTicketEmbed(guild, config) {
    if (!guild || !config) {
        throw new TicketError('Missing required parameters', 'Ongeldige aanvraag.');
    }

    try {
        const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('🎫 Tickets')
            .setDescription('**Kies een categorie hieronder om een ticket aan te maken**')
            .setFooter({
                text: guild.name,
                iconURL: guild.iconURL({ dynamic: true, size: 64 }) || undefined
            })
            .setTimestamp();

        if (config.categories.length === 0) {
            embed.addFields({
                name: '❌ Geen categorieën',
                value: 'Er zijn nog geen ticket categorieën ingesteld.',
                inline: false
            });
        } else {
            // Create a clean, concise category list
            const categoryList = config.categories.map(cat => {
                const emoji = cat.emoji || '📌';
                const name = cat.name;
                const description = cat.description.length > 60
                    ? `${cat.description.substring(0, 57)}...`
                    : cat.description;

                return `**${emoji} ${name}**\n${description}`;
            }).join('\n\n');

            embed.addFields({
                name: `📋 Beschikbare categorieën (${config.categories.length})`,
                value: categoryList,
                inline: false
            });

            // Add brief instructions
            embed.addFields({
                name: '💡 Hoe werkt het?',
                value: '• Selecteer een categorie\n• Wacht op hulp van een medewerker\n• Gebruik de knoppen in je ticket kanaal',
                inline: false
            });
        }

        return embed;
    } catch (error) {
        console.error('❌ Error building ticket embed:', error);
        throw new TicketError('Failed to build ticket embed', 'Kon het ticketpaneel niet aanmaken.');
    }
}

/**
 * Build the ticket panel components (select menu)
 * @param {Object} config - Ticket configuration
 * @returns {ActionRowBuilder[]} Array of message action rows
 */
export function buildTicketComponents(config) {
    if (!config) {
        throw new TicketError('Missing config parameter', 'Ongeldige configuratie.');
    }
    
    try {
        if (!config.categories || config.categories.length === 0) {
            return [];
        }

        const row = new ActionRowBuilder();
        
        // Add category select menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_create')
            .setPlaceholder('Kies een categorie...')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                config.categories.map(cat => ({
                    label: cat.name.length > 25 ? `${cat.name.substring(0, 22)}...` : cat.name,
                    description: cat.description.length > 50
                        ? `${cat.description.substring(0, 47)}...`
                        : cat.description || 'Maak een ticket aan',
                    value: cat.id.toString(),
                    emoji: cat.emoji || '📌'
                }))
            );

        row.addComponents(selectMenu);
        return [row];
    } catch (error) {
        console.error('❌ Error building ticket components:', error);
        throw new TicketError('Failed to build ticket components', 'Kon de ticketknoppen niet aanmaken.');
    }
}

/**
 * Build the complete ticket panel
 * @param {Guild} guild - Discord Guild
 * @param {Object} config - Ticket configuration
 * @returns {Object} Message options for the ticket panel
 */
export function buildTicketPanel(guild, config) {
    try {
        if (!guild || !config) {
            throw new TicketError('Missing required parameters', 'Ongeldige aanvraag.');
        }
        
        const embed = buildTicketEmbed(guild, config);
        const components = buildTicketComponents(config);
        
        return {
            embeds: [embed],
            components: components,
            fetchReply: true
        };
    } catch (error) {
        console.error('❌ Error building ticket panel:', error);
        throw new TicketError(
            'Failed to build ticket panel', 
            error.userFriendlyMessage || 'Kon het ticketpaneel niet aanmaken.'
        );
    }
}

export async function createTicketChannel(guild, category, userId, db) {
    // Get current ticket counter and increment it
    const currentCounter = Number(db.prepare('SELECT ticket_counter FROM ticket_systems WHERE guild_id = ?').get(guild.id)?.ticket_counter) || 0;
    const newCounter = currentCounter + 1;

    // Format ticket number with leading zeros (e.g., 001, 002, 010, 100)
    const ticketNumber = newCounter.toString().padStart(3, '0');

    // Build a safe username for the channel name
    let safeUsername = `user-${userId}`;
    try {
        const member = await guild.members.fetch(userId);
        const base = (member?.user?.username || `user-${userId}`)
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[^a-z0-9\-_. ]+/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^[-_.]+|[-_.]+$/g, '');
        // Limit username length to fit within Discord's 100 char limit for channel names
        safeUsername = base ? base.substring(0, 80) : `user-${userId}`;
    } catch {}

    // Create channel name with ticket number and username
    const channelName = `ticket-${ticketNumber}-${safeUsername}`.substring(0, 100); // Discord channel name limit is 100 chars

    // Create ticket channel
    const cfg = getTicketConfig(db, guild.id);

    // Use category-specific Discord category if set, otherwise use global default
    const parentCategoryId = category.category_id || cfg.category_id || null;

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentCategoryId,
        permissionOverwrites: [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: userId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.MentionEveryone,
                    PermissionFlagsBits.UseExternalEmojis,
                    PermissionFlagsBits.UseExternalStickers,
                ],
            },
            ...(category.support_roles ? JSON.parse(category.support_roles).map(roleId => ({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.MentionEveryone,
                    PermissionFlagsBits.UseExternalEmojis,
                    PermissionFlagsBits.UseExternalStickers,
                ],
            })) : []),
            ...(cfg.support_role_id ? [{
                id: cfg.support_role_id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.MentionEveryone,
                    PermissionFlagsBits.UseExternalEmojis,
                    PermissionFlagsBits.UseExternalStickers,
                ],
            }] : [])
        ],
    });

    // Update ticket counter in database
    db.prepare('UPDATE ticket_systems SET ticket_counter = ? WHERE guild_id = ?').run(newCounter, guild.id);

    // Create ticket in database
    const result = db.prepare(
        'INSERT INTO tickets (guild_id, channel_id, user_id, category_id, status) VALUES (?, ?, ?, ?, ?)'
    ).run(guild.id, channel.id, userId, category.id, 'open');

    return { channel, ticketId: result.lastInsertRowid };
}

export function getTicketControlComponents(ticket = null, member = null, category = null, config = null) {
    const components = [];

    // Close button - always visible to ticket creator and support staff
    const closeButton = new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Sluiten')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒');

    components.push(closeButton);

    // Claim button - only visible to support staff if not already claimed
    if (ticket && member && category && config) {
        const isSupport = category?.support_roles &&
            JSON.parse(category.support_roles).some(roleId => member.roles.cache.has(roleId));

        const isGlobalSupport = config.support_role_id && member.roles.cache.has(config.support_role_id);
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        const isClaimed = ticket.claimed_by;

        if ((isSupport || isGlobalSupport || isAdmin) && !isClaimed) {
            const claimButton = new ButtonBuilder()
                .setCustomId('ticket_claim')
                .setLabel('Claimen')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👋');
            components.push(claimButton);
        }
    } else {
        // Fallback: show claim button if we don't have enough context to check permissions
        const claimButton = new ButtonBuilder()
            .setCustomId('ticket_claim')
            .setLabel('Claimen')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👋');
        components.push(claimButton);
    }

    const row = new ActionRowBuilder().addComponents(components);
    return [row];
}

// Settings helpers
export function setLogChannel(db, guildId, channelId) {
    try {
        // Ensure table and column exist
        createTicketTables(db);
        try {
            const cols = db.prepare(`PRAGMA table_info(ticket_systems)`).all().map(c => c.name);
            if (!cols.includes('log_channel_id')) {
                db.exec(`ALTER TABLE ticket_systems ADD COLUMN log_channel_id TEXT DEFAULT ''`);
            }
        } catch {}

        const exists = db.prepare('SELECT 1 FROM ticket_systems WHERE guild_id = ?').get(guildId);
        if (!exists) {
            db.prepare('INSERT INTO ticket_systems (guild_id, log_channel_id, max_tickets_per_user, support_role_id, channel_id, category_id, ticket_counter) VALUES (?, ?, 3, \'\', \'\', \'\', 0)').run(guildId, channelId);
        } else {
            db.prepare('UPDATE ticket_systems SET log_channel_id = ? WHERE guild_id = ?').run(channelId, guildId);
        }
        return true;
    } catch (error) {
        throw new TicketError('Failed to update settings', 'Kon het log kanaal niet opslaan.');
    }
}

export function setSupportRole(db, guildId, roleId) {
    try {
        // Ensure table and column exist
        createTicketTables(db);
        try {
            const cols = db.prepare(`PRAGMA table_info(ticket_systems)`).all().map(c => c.name);
            if (!cols.includes('support_role_id')) {
                db.exec(`ALTER TABLE ticket_systems ADD COLUMN support_role_id TEXT DEFAULT ''`);
            }
        } catch {}

        const exists = db.prepare('SELECT 1 FROM ticket_systems WHERE guild_id = ?').get(guildId);
        if (!exists) {
            db.prepare('INSERT INTO ticket_systems (guild_id, support_role_id, max_tickets_per_user, log_channel_id, channel_id, category_id, ticket_counter) VALUES (?, ?, 3, \'\', \'\', \'\', 0)').run(guildId, roleId);
        } else {
            db.prepare('UPDATE ticket_systems SET support_role_id = ? WHERE guild_id = ?').run(roleId, guildId);
        }
        return true;
    } catch (error) {
        console.error('❌ Error setting support_role_id:', error);
        throw new TicketError('Failed to update settings', 'Kon de support rol niet opslaan.');
    }
}

export function setDefaultCategory(db, guildId, categoryId) {
    try {
        // Ensure table and column exist
        createTicketTables(db);
        try {
            const cols = db.prepare(`PRAGMA table_info(ticket_systems)`).all().map(c => c.name);
            if (!cols.includes('category_id')) {
                db.exec(`ALTER TABLE ticket_systems ADD COLUMN category_id TEXT DEFAULT ''`);
            }
        } catch {}

        const exists = db.prepare('SELECT 1 FROM ticket_systems WHERE guild_id = ?').get(guildId);
        if (!exists) {
            db.prepare('INSERT INTO ticket_systems (guild_id, category_id, max_tickets_per_user, log_channel_id, support_role_id, channel_id, ticket_counter) VALUES (?, ?, 3, \'\', \'\', \'\', 0)').run(guildId, categoryId);
        } else {
            db.prepare('UPDATE ticket_systems SET category_id = ? WHERE guild_id = ?').run(categoryId, guildId);
        }
        return true;
    } catch (error) {
        console.error('❌ Error setting default category:', error);
        throw new TicketError('Failed to update settings', 'Kon de standaard categorie niet opslaan.');
    }
}

export function setTicketCategoryDiscordCategory(db, categoryId, discordCategoryId) {
    try {
        const stmt = db.prepare('UPDATE ticket_categories SET category_id = ? WHERE id = ?');
        stmt.run(discordCategoryId, categoryId);
        return true;
    } catch (error) {
        console.error('❌ Error setting ticket category Discord category:', error);
        throw new TicketError('Failed to update category', 'Kon de Discord categorie niet instellen voor deze ticket categorie.');
    }
}

/**
 * Get current ticket counter for a guild
 * @param {Object} db - Database connection
 * @param {string} guildId - Guild ID
 * @returns {number} Current ticket counter value
 */
export function getTicketCounter(db, guildId) {
    try {
        const result = db.prepare('SELECT ticket_counter FROM ticket_systems WHERE guild_id = ?').get(guildId);
        return Number(result?.ticket_counter) || 0;
    } catch (error) {
        console.error('❌ Error getting ticket counter:', error);
        return 0;
    }
}

/**
 * Reset ticket counter for a guild (admin function)
 * @param {Object} db - Database connection
 * @param {string} guildId - Guild ID
 * @param {number} newValue - New counter value (optional, defaults to 0)
 * @returns {boolean} Success status
 */
export function resetTicketCounter(db, guildId, newValue = 0) {
    try {
        // Ensure table and column exist
        createTicketTables(db);

        const exists = db.prepare('SELECT 1 FROM ticket_systems WHERE guild_id = ?').get(guildId);
        if (!exists) {
            db.prepare('INSERT INTO ticket_systems (guild_id, ticket_counter, max_tickets_per_user, log_channel_id, support_role_id, channel_id, category_id) VALUES (?, ?, 3, \'\', \'\', \'\', \'\')').run(guildId, newValue);
        } else {
            db.prepare('UPDATE ticket_systems SET ticket_counter = ? WHERE guild_id = ?').run(newValue, guildId);
        }
        return true;
    } catch (error) {
        console.error('❌ Error resetting ticket counter:', error);
        throw new TicketError('Failed to reset ticket counter', 'Kon de ticket teller niet resetten.');
    }
}
