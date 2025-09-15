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
        const channelName = `ticket-${ticketType}-${interaction.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .slice(0, 90);

        // Validate parent category - check both category_id and ticket_category_id
        let parentId = config.ticket_category_id || config.category_id;
        let parentChannel = null;
        
        try {
            if (parentId) {
                parentChannel = await interaction.guild.channels.fetch(parentId).catch(() => null);
                if (!parentChannel || parentChannel.type !== ChannelType.GuildCategory) {
                    parentChannel = null;
                }
            }
        } catch {
            parentChannel = null;
        }

        const baseOptions = {
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
            ],
        };

        // Add required role to the ticket channel permissions
        if (config.required_role_id) {
            baseOptions.permissionOverwrites.push({
                id: config.required_role_id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            });
        }

        // Try with parent first (if valid), then without as fallback
        let channel;
        try {
            channel = await interaction.guild.channels.create({
                ...baseOptions,
                ...(parentChannel ? { parent: parentChannel.id } : {})
            });
        } catch (e1) {
            // Retry without parent
            try {
                channel = await interaction.guild.channels.create(baseOptions);
            } catch (e2) {
                throw new Error(`Failed to create ticket channel: ${e2.message || e1.message}`);
            }
        }

        // Send initial ticket message
        await sendTicketInitialMessage(channel, interaction.user, ticketType, formData);

        // Send success message
        const successEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Ticket Aangemaakt')
            .setDescription(`Je ${ticketType} ticket is aangemaakt in ${channel}`)
            .setTimestamp();

        await interaction.editReply({ 
            embeds: [successEmbed],
            ephemeral: true 
        });

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
        
        // Add required role to the thread permissions
        if (config.required_role_id) {
            await thread.permissionOverwrites.create(config.required_role_id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
        }

        // Add the user to the thread
        await thread.members.add(interaction.user.id);
        
        // Send initial ticket message
        await sendTicketInitialMessage(thread, interaction.user, ticketType, formData);

        // Send success message
        const successEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Ticket Aangemaakt')
            .setDescription(`Je ${ticketType} ticket is aangemaakt in ${thread}`)
            .setTimestamp();

        await interaction.editReply({ 
            embeds: [successEmbed],
            ephemeral: true 
        });

        return { channel: thread, isThread: true };
    } catch (error) {
        throw new Error(`Failed to create ticket thread: ${error.message}`);
    }
}

/**
 * Sends the initial message in a ticket channel/thread
 * @param {TextChannel|ThreadChannel} channel - The channel to send the message to
 * @param {User} user - The user who created the ticket
 * @param {string} ticketType - Type of ticket
 * @param {Object|null} formData - Form data if applicable
 * @returns {Promise<Message>} The sent message
 */
async function sendTicketInitialMessage(channel, user, ticketType, formData = null) {
    try {
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`🎫 ${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} Ticket`)
            .setDescription(
                `Bedankt voor het aanmaken van een ticket, ${user}!
` +
                'On team zal zo snel mogelijk reageren.\n\n' +
                '**Gebruik onderstaande opties om het ticket te beheren:**\n' +
                '🔒 `/ticket sluiten` - Sluit het ticket\n' +
                '🔓 `/ticket heropenen` - Heropen het ticket\n' +
                '📝 `/ticket hernoem <naam>` - Hernoem het ticket\n' +
                '👥 `/ticket toevoegen <gebruiker>` - Voeg iemand toe aan het ticket\n' +
                '❌ `/ticket verwijderen <gebruiker>` - Verwijder iemand van het ticket\n\n' +
                '**Let op:** Ongepaste tickets worden verwijderd!'
            )
            .setFooter({ text: `Ticket aangemaakt door: ${user.tag}`, iconURL: user.displayAvatarURL() })
            .setTimestamp();

        // Add form data if available
        if (formData && Object.keys(formData).length > 0) {
            const formFields = [];
            for (const [key, value] of Object.entries(formData)) {
                if (value && value.trim() !== '') {
                    formFields.push({
                        name: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
                        value: value.length > 1024 ? value.substring(0, 1000) + '...' : value,
                        inline: false
                    });
                }
            }
            
            if (formFields.length > 0) {
                embed.addFields([
                    { name: '\u200B', value: '**Ingevulde gegevens:**' },
                    ...formFields
                ]);
            }
        }

        // Create action row with close button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Ticket sluiten')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        // Send the message
        const message = await channel.send({
            content: `${user} | <@&${process.env.STAFF_ROLE_ID || ''}>`,
            embeds: [embed],
            components: [row]
        });

        // Pin the message if it's a channel
        if (channel.type === ChannelType.GuildText) {
            await message.pin().catch(console.error);
        }

        return message;
    } catch (error) {
        console.error('Error sending initial ticket message:', error);
        // Try to send a basic message if the embed fails
        try {
            return await channel.send({
                content: `Hallo ${user}, bedankt voor het aanmaken van dit ticket! On team zal zo snel mogelijk reageren.`
            });
        } catch (e) {
            console.error('Failed to send fallback ticket message:', e);
            throw new Error('Failed to send initial ticket message');
        }
    }
}
