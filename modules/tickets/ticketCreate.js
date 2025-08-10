// modules/tickets/ticketCreate.js
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } from 'discord.js';

/**
 * Creates a ticket channel or thread based on guild configuration
 * @param {Object} interaction - Interaction that triggered ticket creation
 * @param {Object} db - Database instance
 * @param {Object} config - Guild ticket configuration
 * @param {string} ticketType - Type of ticket being created
 * @param {Object|null} formData - Form data if applicable
 * @returns {Object} Created channel/thread
 */
export async function createTicketChannelOrThread(interaction, db, config, ticketType, formData) {
    if (config.thread_mode) {
        // Create ticket as thread
        return await createTicketThread(interaction, db, config, ticketType, formData);
    } else {
        // Create ticket as channel
        return await createTicketChannel(interaction, db, config, ticketType, formData);
    }
}

/**
 * Creates a ticket as a channel
 * @param {Object} interaction - Interaction that triggered ticket creation
 * @param {Object} db - Database instance
 * @param {Object} config - Guild ticket configuration
 * @param {string} ticketType - Type of ticket being created
 * @param {Object|null} formData - Form data if applicable
 * @returns {Object} Created channel
 */
async function createTicketChannel(interaction, db, config, ticketType, formData) {
    try {
        const channelName = `ticket-${ticketType}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: config.ticket_category_id,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
            ],
        });
        
        // Send initial ticket message
        await sendTicketInitialMessage(channel, interaction.user, ticketType, formData);
        
        return { channel, isThread: false };
    } catch (error) {
        throw new Error(`Failed to create ticket channel: ${error.message}`);
    }
}

/**
 * Creates a ticket as a thread
 * @param {Object} interaction - Interaction that triggered ticket creation
 * @param {Object} db - Database instance
 * @param {Object} config - Guild ticket configuration
 * @param {string} ticketType - Type of ticket being created
 * @param {Object|null} formData - Form data if applicable
 * @returns {Object} Created thread
 */
async function createTicketThread(interaction, db, config, ticketType, formData) {
    try {
        // Try to find a suitable channel for the thread
        let parentChannel = null;
        
        // First try the configured ticket channel
        if (config.ticket_channel_id) {
            parentChannel = await interaction.guild.channels.fetch(config.ticket_channel_id);
        }
        
        // If not found, try to find any text channel in the guild
        if (!parentChannel) {
            parentChannel = interaction.guild.channels.cache.find(
                c => c.type === ChannelType.GuildText
            );
        }
        
        if (!parentChannel) {
            throw new Error('No suitable channel found for ticket thread');
        }
        
        const threadName = `ticket-${ticketType}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        
        const thread = await parentChannel.threads.create({
            name: threadName,
            autoArchiveDuration: 1440, // 24 hours
            type: ChannelType.PrivateThread,
            invitable: false
        });
        
        // Add the user to the thread
        await thread.members.add(interaction.user.id);
        
        // Send initial ticket message
        await sendTicketInitialMessage(thread, interaction.user, ticketType, formData);
        
        return { channel: thread, isThread: true };
    } catch (error) {
        throw new Error(`Failed to create ticket thread: ${error.message}`);
    }
}

/**
 * Sends the initial message in a newly created ticket
 * @param {Object} channel - Channel or thread where to send the message
 * @param {Object} user - User who created the ticket
 * @param {string} ticketType - Type of ticket
 * @param {Object|null} formData - Form data if applicable
 */
async function sendTicketInitialMessage(channel, user, ticketType, formData) {
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`🎫 ${ticketType} Ticket Aangemaakt`)
        .setDescription(`Hallo ${user}! Je ${ticketType} ticket is succesvol aangemaakt.`)
        .addFields(
            { name: '👤 Ticket Eigenaar', value: user.tag, inline: true },
            { name: '🎫 Ticket Type', value: ticketType, inline: true },
            { name: '🕐 Aangemaakt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();
    
    // Add form data if present
    if (formData) {
        let formDescription = '';
        for (const [key, value] of Object.entries(formData)) {
            formDescription += `**${key}:** ${value}\n`;
        }
        
        if (formDescription) {
            embed.addFields({ name: '📄 Formulier Informatie', value: formDescription, inline: false });
        }
    }
    
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
    
    await channel.send({ embeds: [embed], components: [row] });
}
