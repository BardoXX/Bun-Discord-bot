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
 * Creates a new ticket channel with support for different ticket types
 * @param {import('discord.js').ButtonInteraction} interaction The button interaction.
 * @param {Object} [ticketType] The type of ticket to create
 */
export async function createTicket(interaction, ticketType = null) {
    // Defer the reply to prevent interaction timeout
    await interaction.deferReply({ ephemeral: true });

    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
        // Check for existing open ticket
        const existingTicket = await get(
            'SELECT * FROM tickets WHERE user_id = ? AND guild_id = ? AND status = "open"',
            [userId, guildId]
        );

        if (existingTicket) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('⚠️ Ticket Already Exists')
                .setDescription(`You already have an open ticket: <#${existingTicket.channel_id}>`)
                .setTimestamp();

            return await interaction.editReply({ embeds: [embed] });
        }

        // Get ticket system configuration
        const ticketSystem = await get(
            'SELECT * FROM ticket_systems WHERE guild_id = ?',
            [guildId]
        );

        if (!ticketSystem) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Configuration Error')
                .setDescription('Ticket system is not configured. Please contact an administrator.')
                .setTimestamp();

            return await interaction.editReply({ embeds: [embed] });
        }

        // Parse ticket types
        const ticketTypes = JSON.parse(ticketSystem.types || '[]');
        const selectedType = ticketType || {};

        // Create channel name based on naming format
        let channelName = 'ticket';
        if (ticketSystem.naming_format) {
            channelName = ticketSystem.naming_format
                .replace('{type}', selectedType.value || 'ticket')
                .replace('{user}', interaction.user.username.toLowerCase())
                .substring(0, 100); // Ensure channel name is within Discord's limits
        } else {
            channelName = `ticket-${selectedType.value || 'new'}-${interaction.user.username}`.toLowerCase();
        }

        // Clean up channel name to match Discord's requirements
        channelName = channelName
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 100);

        // Create the ticket channel
        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: ticketSystem.category_id || null,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                    ],
                },
                {
                    id: interaction.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.ManageMessages,
                    ],
                },
            ],
        });

        // Add to database
        await run(
            'INSERT INTO tickets (guild_id, user_id, channel_id, status, type) VALUES (?, ?, ?, "open", ?)',
            [guildId, userId, ticketChannel.id, selectedType.value || 'general']
        );

        // Create ticket embed
        const ticketEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(selectedType.label ? `${selectedType.emoji || '🎫'} ${selectedType.label} Ticket` : '🎫 New Ticket')
            .setDescription(selectedType.description || 'Please describe your issue below and our staff will assist you shortly.')
            .addFields(
                { name: '👤 Ticket Owner', value: interaction.user.toString(), inline: true },
                { name: '🕐 Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                { name: '🔢 Ticket ID', value: `#${ticketChannel.name}`, inline: true }
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        // Create action buttons
        const closeButton = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒');

        const claimButton = new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Claim')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🙋');

        const row = new ActionRowBuilder().addComponents(claimButton, closeButton);

        // Send initial message
        const ticketMessage = await ticketChannel.send({
            content: `${interaction.user} ${ticketSystem.required_role_id ? `<@&${ticketSystem.required_role_id}>` : ''}`,
            embeds: [ticketEmbed],
            components: [row],
        });

        // Send success message to user
        const successEmbed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('✅ Ticket Created')
            .setDescription(`Your ticket has been created: ${ticketChannel}`)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });

        // If log channel is set, send a log message
        if (ticketSystem.log_channel_id) {
            try {
                const logChannel = await interaction.guild.channels.fetch(ticketSystem.log_channel_id);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('🎫 Ticket Created')
                        .setDescription(`**User:** ${interaction.user.tag} (${interaction.user.id})\n**Channel:** ${ticketChannel}\n**Type:** ${selectedType.label || 'General'}`)
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (error) {
                console.error('Failed to send log message:', error);
            }
        }

    } catch (error) {
        console.error('Error in createTicket:', error);
        
        try {
            await interaction.editReply({
                content: '❌ An error occurred while creating the ticket. Please try again.',
                ephemeral: true
            });
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
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
