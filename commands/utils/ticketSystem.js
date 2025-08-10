// utils/ticketSystem.js
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { createTicketChannelOrThread } from '../../modules/tickets/ticketCreate.js';
import { getTicketConfig } from '../../modules/tickets/ticketConfig.js';

/**
 * Creates and sends the initial ticket creation embed to a channel.
 * @param {import('discord.js').TextChannel} channel The channel to send the embed to.
 */
export async function createTicketEmbed(channel) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎫 Ticket Systeem')
        .setDescription('Heb je hulp nodig? Klik op de knop hieronder om een ticket aan te maken!\n\n**Wanneer een ticket aanmaken?**\n• Voor algemene vragen\n• Voor hulp van staff\n• Voor het rapporteren van problemen\n• Voor suggesties')
        .addFields(
            { name: '📋 Instructies', value: '1. Klik op "🎫 Ticket Aanmaken"\n2. Wacht tot je ticket kanaal wordt aangemaakt\n3. Beschrijf je probleem/vraag\n4. Wacht op antwoord van staff', inline: false }
        )
        .setFooter({ text: 'Misbruik van het ticket systeem kan leiden tot sancties' })
        .setTimestamp();

    const button = new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('🎫 Ticket Aanmaken')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
        .addComponents(button);

    await channel.send({ embeds: [embed], components: [row] });
}

/**
 * Creates a simple ticket (legacy support for existing system)
 * @param {import('discord.js').ButtonInteraction} interaction The button interaction.
 */
export async function createTicket(interaction) {
    // We gebruiken flags: 64 voor een bericht dat alleen de gebruiker kan zien
    await interaction.deferReply({ flags: 64 });

    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Check for existing open ticket
    const stmt = db.prepare('SELECT * FROM tickets WHERE user_id = ? AND guild_id = ? AND status = "open"');
    const existingTicket = stmt.get(userId, guildId);

    if (existingTicket) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('⚠️ Ticket Bestaat Al')
            .setDescription(`Je hebt al een open ticket: <#${existingTicket.channel_id}>`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    // Get guild ticket config
    const config = getTicketConfig(db, guildId);

    if (!config || (!config.ticket_category_id && !config.thread_mode)) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Configuratie Fout')
            .setDescription('Ticket systeem is niet geconfigureerd. Neem contact op met een administrator.')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    try {
        // Create ticket channel or thread
        const ticketResult = await createTicketChannelOrThread(
            interaction, 
            db, 
            config, 
            'general', 
            null
        );

        // Save ticket to database
        const insertStmt = db.prepare(`
            INSERT INTO tickets (guild_id, user_id, channel_id, status, ticket_type)
            VALUES (?, ?, ?, "open", ?)
        `);
        insertStmt.run(guildId, userId, ticketResult.channel.id, 'general');

        const successEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Ticket Aangemaakt')
            .setDescription(`Je ticket is aangemaakt: ${ticketResult.channel}`)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
        console.error('Error creating ticket:', error);
        
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Er is een fout opgetreden bij het aanmaken van je ticket. Probeer het later opnieuw.')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
}

/**
 * Handles the logic for creating a new ticket channel.
 * @param {import('discord.js').ButtonInteraction} interaction The button interaction.
 */
export async function createTicket(interaction) {
    // We gebruiken flags: 64 voor een bericht dat alleen de gebruiker kan zien
    await interaction.deferReply({ flags: 64 });

    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const stmt = db.prepare('SELECT * FROM tickets WHERE user_id = ? AND guild_id = ? AND status = "open"');
    const existingTicket = stmt.get(userId, guildId);

    if (existingTicket) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('⚠️ Ticket Bestaat Al')
            .setDescription(`Je hebt al een open ticket: <#${existingTicket.channel_id}>`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    const configStmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    const config = configStmt.get(guildId);

    if (!config || !config.ticket_category) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Configuratie Fout')
            .setDescription('Ticket systeem is niet geconfigureerd. Neem contact op met een administrator.')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    try {
        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: config.ticket_category,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
            ],
        });

        const insertStmt = db.prepare('INSERT INTO tickets (guild_id, user_id, channel_id, status) VALUES (?, ?, ?, "open")');
        insertStmt.run(guildId, userId, ticketChannel.id);

        const ticketEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🎫 Ticket Aangemaakt')
            .setDescription(`Hallo ${interaction.user}! Je ticket is succesvol aangemaakt.\n\nBeschrijf je probleem of vraag hieronder en een staff lid zal zo snel mogelijk reageren.`)
            .addFields(
                { name: '👤 Ticket Eigenaar', value: interaction.user.tag, inline: true },
                { name: '🕐 Aangemaakt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        const closeButton = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('🔒 Sluiten')
            .setStyle(ButtonStyle.Danger);

        const claimButton = new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('🙋 Claimen')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder()
            .addComponents(claimButton, closeButton);

        await ticketChannel.send({ embeds: [ticketEmbed], components: [row] });

        const successEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Ticket Aangemaakt')
            .setDescription(`Je ticket is aangemaakt: ${ticketChannel}`)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
        console.error('Error creating ticket:', error);
        
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Er is een fout opgetreden bij het aanmaken van je ticket. Probeer het later opnieuw.')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
}

/**
 * Handles the logic for claiming a ticket.
 * @param {import('discord.js').ButtonInteraction} interaction The button interaction.
 */
export async function claimTicket(interaction) {
    // We gebruiken geen flags voor een openbaar bericht
    await interaction.deferReply();

    const db = interaction.client.db;
    const guildId = interaction.guild.id;
    const channelId = interaction.channel.id;

    const configStmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    const config = configStmt.get(guildId);

    if (config?.ticket_staff_role) {
        const hasStaffRole = interaction.member.roles.cache.has(config.ticket_staff_role);
        if (!hasStaffRole) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Toegang')
                .setDescription('Je hebt niet de juiste rol om tickets te claimen.')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed], flags: 64 });
            return;
        }
    }

    const ticketStmt = db.prepare('SELECT * FROM tickets WHERE channel_id = ? AND status = "open"');
    const ticket = ticketStmt.get(channelId);

    if (!ticket) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Geen Ticket')
            .setDescription('Dit kanaal is geen actief ticket.')
            .setTimestamp();
        await interaction.editReply({ embeds: [embed], flags: 64 });
        return;
    }

    const updateStmt = db.prepare('UPDATE tickets SET status = "claimed" WHERE channel_id = ?');
    updateStmt.run(channelId);

    try {
        await interaction.channel.setName(`claimed-${interaction.channel.name.replace('ticket-', '')}`);
    } catch (error) {
        console.error('Error renaming ticket channel:', error);
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🙋 Ticket Geclaimd')
        .setDescription(`Dit ticket is geclaimd door ${interaction.user}`)
        .addFields(
            { name: '👮 Staff Lid', value: interaction.user.tag, inline: true },
            { name: '🕐 Geclaimd op', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Handles the logic for closing a ticket channel.
 * @param {import('discord.js').ButtonInteraction} interaction The button interaction.
 */
export async function closeTicket(interaction) {
    // We gebruiken flags: 64 voor een bericht dat alleen de gebruiker kan zien
    await interaction.deferReply({ flags: 64 });

    const db = interaction.client.db;
    const channelId = interaction.channel.id;

    const ticketStmt = db.prepare('SELECT * FROM tickets WHERE channel_id = ? AND (status = "open" OR status = "claimed")');
    const ticket = ticketStmt.get(channelId);

    if (!ticket) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Geen Ticket')
            .setDescription('Dit kanaal is geen actief ticket.')
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    const isOwner = ticket.user_id === interaction.user.id;
    const configStmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    const config = configStmt.get(interaction.guild.id);
    const hasStaffRole = config?.ticket_staff_role ? interaction.member.roles.cache.has(config.ticket_staff_role) : false;
    const hasManageChannels = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

    if (!isOwner && !hasStaffRole && !hasManageChannels) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Geen Toegang')
            .setDescription('Je kunt dit ticket niet sluiten.')
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    const updateStmt = db.prepare('UPDATE tickets SET status = "closed" WHERE channel_id = ?');
    updateStmt.run(channelId);

    // Haal alle berichten uit het kanaal op om een log te maken
    let messages = await interaction.channel.messages.fetch({ limit: 100 });
    messages = messages.reverse();
    let logContent = `Ticket Log voor #${interaction.channel.name}\nTicket Eigenaar: ${interaction.user.tag}\nGesloten door: ${interaction.user.tag}\n\n`;

    messages.forEach(msg => {
        logContent += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content}\n`;
    });

    const logBuffer = Buffer.from(logContent, 'utf-8');
    const attachment = new AttachmentBuilder(logBuffer, { name: `ticket-log-${interaction.channel.name}.txt` });

    const logChannelId = config.ticket_log_channel;
    if (logChannelId) {
        const logChannel = await interaction.guild.channels.fetch(logChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🔒 Ticket Gesloten')
                .setDescription(`Het ticket van ${interaction.user} is gesloten.`)
                .addFields(
                    { name: 'Ticket ID', value: `\`${interaction.channel.id}\``, inline: true },
                    { name: 'Gesloten door', value: `${interaction.user.tag}`, inline: true }
                )
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed], files: [attachment] });
        }
    }

    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔒 Ticket Wordt Gesloten')
        .setDescription('Dit ticket wordt over 5 seconden gesloten...')
        .addFields(
            { name: '👤 Gesloten door', value: interaction.user.tag, inline: true },
            { name: '🕐 Gesloten op', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    setTimeout(async () => {
        try {
            await interaction.channel.delete();
        } catch (error) {
            console.error('Error deleting ticket channel:', error);
        }
    }, 5000);
}
