// ticket.js - Complete ticket command with improved structure and features
import { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType 
} from 'discord.js';
import { 
    handleTicketWizard, 
    editTicketSetup,
    handleTicketCreation
} from './ticketWizard.js';
import { get, run } from '../utils/database.js';
import ReplyManager from '../../modules/utils/replyManager.js';
import fs from 'fs/promises';
import path from 'path';

const data = new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage ticket systems')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('setup')
            .setDescription('Set up a new ticket system using the wizard')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('edit')
            .setDescription('Edit an existing ticket system')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('panel')
            .setDescription('Recreate the ticket panel in the configured channel')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('close')
            .setDescription('Close a ticket (use in ticket channels)')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('User whose ticket to close (optional)')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Add a user to the current ticket')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('User to add to the ticket')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Remove a user from the current ticket')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('User to remove from the ticket')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('transcript')
            .setDescription('Generate a transcript of the current ticket')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('View ticket system statistics')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('delete')
            .setDescription('Delete the entire ticket system configuration')
    );

async function execute(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    // Permission check for most commands
    const subcommand = interaction.options.getSubcommand();
    const publicCommands = ['transcript']; // Commands that don't require admin
    
    if (!publicCommands.includes(subcommand) && 
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('You need administrator permissions to use this command.')
            ],
            ephemeral: true
        });
    }

    try {
        switch (subcommand) {
            case 'setup':
                await handleTicketWizard(interaction);
                break;
                
            case 'edit':
                await editTicketSetup(interaction);
                break;
                
            case 'panel':
                await handlePanelRecreate(interaction);
                break;
                
            case 'close':
                await handleTicketClose(interaction);
                break;
                
            case 'add':
                await handleTicketAdd(interaction);
                break;
                
            case 'remove':
                await handleTicketRemove(interaction);
                break;
                
            case 'transcript':
                await handleTicketTranscript(interaction);
                break;
                
            case 'stats':
                await handleTicketStats(interaction);
                break;
                
            case 'delete':
                await handleTicketSystemDelete(interaction);
                break;
                
            default:
                await replyManager.send({
                    content: '❌ Unknown subcommand.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error in ticket command:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Command Error')
            .setDescription('An error occurred while processing your request. Please try again.')
            .addFields({
                name: 'Error Details',
                value: `\`\`\`${error.message}\`\`\``,
                inline: false
            })
            .setTimestamp();

        if (!interaction.replied && !interaction.deferred) {
            await replyManager.send({
                embeds: [errorEmbed],
                ephemeral: true
            });
        }
    }
}

async function handlePanelRecreate(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        await replyManager.defer({ ephemeral: true });
        
        // Get ticket system configuration
        const config = await get('SELECT * FROM ticket_systems WHERE guild_id = ?', [interaction.guildId]);
        
        if (!config) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('⚠️ No Configuration Found')
                        .setDescription('No ticket system is configured. Use `/ticket setup` first.')
                ]
            });
        }

        const channel = await interaction.guild.channels.fetch(config.channel_id);
        if (!channel) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Channel Not Found')
                        .setDescription('The configured panel channel no longer exists.')
                ]
            });
        }

        // Parse ticket types
        const types = JSON.parse(config.types || '[]');
        
        if (types.length === 0) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('⚠️ No Ticket Types')
                        .setDescription('No ticket types are configured. Use `/ticket edit` to add some.')
                ]
            });
        }

        // Create panel embed
        const panelEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(config.panel_title || 'Support Tickets')
            .setDescription(config.panel_description || 'Click a button below to create a ticket for assistance.')
            .setFooter({ text: 'Select a ticket type below' })
            .setTimestamp();

        // Create buttons for ticket types
        const components = [];
        let currentRow = new ActionRowBuilder();
        let buttonCount = 0;

        // Add a unique timestamp to each button ID to prevent caching issues
        const timestamp = Date.now();

        for (const type of types) {
            if (buttonCount === 5) {
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
                buttonCount = 0;
            }

            if (components.length === 5) break;

            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_create_${type.value}_${timestamp}`)
                    .setLabel(type.label)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(type.emoji || '🎫')
            );

            buttonCount++;
        }

        if (currentRow.components.length > 0) {
            components.push(currentRow);
        }

        // Clear previous messages in the channel
        try {
            const messages = await channel.messages.fetch({ limit: 50 });
            const botMessages = messages.filter(m => m.author.id === interaction.client.user.id);
            
            // Delete messages in chunks to avoid rate limits
            const messageChunks = [];
            let currentChunk = [];
            
            for (const message of botMessages.values()) {
                currentChunk.push(message);
                if (currentChunk.length === 5) {
                    messageChunks.push([...currentChunk]);
                    currentChunk = [];
                }
            }
            
            if (currentChunk.length > 0) {
                messageChunks.push(currentChunk);
            }
            
            for (const chunk of messageChunks) {
                await Promise.all(chunk.map(msg => msg.delete().catch(console.error)));
                // Small delay between chunk deletions to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Error clearing previous messages:', error);
        }

        // Send the panel
        await channel.send({
            embeds: [panelEmbed],
            components
        });

        // Update the ticket system with the new timestamp
        await run(
            'UPDATE ticket_systems SET panel_timestamp = ? WHERE guild_id = ?',
            [timestamp, interaction.guildId]
        );

        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Panel Recreated')
                    .setDescription(`The ticket panel has been recreated in ${channel}.`)
            ]
        });

    } catch (error) {
        console.error('Error in handlePanelRecreate:', error);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('An error occurred while recreating the ticket panel.')
            ],
            ephemeral: true
        });
    }
}

async function handleTicketClose(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        const targetUser = interaction.options.getUser('user');
        
        // Check if we're in a ticket channel
        const ticket = await get(
            'SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? AND status != "closed"',
            [interaction.guildId, interaction.channel.id]
        );

        if (!ticket) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('⚠️ Not a Ticket Channel')
                        .setDescription('This command can only be used in active ticket channels.')
                ],
                ephemeral: true
            });
        }

        // If a user is specified, check if this is their ticket or if user has permission
        if (targetUser && 
            targetUser.id !== ticket.user_id && 
            !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Permission Denied')
                        .setDescription('You can only close your own tickets or need Manage Channels permission.')
                ],
                ephemeral: true
            });
        }

        // Create confirmation embed
        const confirmEmbed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('🔒 Close Ticket')
            .setDescription('Are you sure you want to close this ticket?')
            .addFields({
                name: 'Ticket Owner',
                value: `<@${ticket.user_id}>`,
                inline: true
            }, {
                name: 'Created',
                value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:R>`,
                inline: true
            })
            .setFooter({ text: 'This action cannot be undone' });

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_close_confirm_${ticket.id}`)
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒'),
                new ButtonBuilder()
                    .setCustomId('ticket_close_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❌')
            );

        await replyManager.send({
            embeds: [confirmEmbed],
            components: [confirmRow],
            ephemeral: false
        });

    } catch (error) {
        console.error('Error in ticket close:', error);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Close Failed')
                    .setDescription(`Failed to close ticket: ${error.message}`)
            ],
            ephemeral: true
        });
    }
}

async function handleTicketAdd(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        const userToAdd = interaction.options.getUser('user');
        
        // Check if we're in a ticket channel
        const ticket = await get(
            'SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? AND status != "closed"',
            [interaction.guildId, interaction.channel.id]
        );

        if (!ticket) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('⚠️ Not a Ticket Channel')
                        .setDescription('This command can only be used in active ticket channels.')
                ],
                ephemeral: true
            });
        }

        // Add user to the channel
        await interaction.channel.permissionOverwrites.create(userToAdd, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true
        });

        const successEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ User Added')
            .setDescription(`${userToAdd} has been added to this ticket.`)
            .setTimestamp();

        await replyManager.send({
            embeds: [successEmbed]
        });

    } catch (error) {
        console.error('Error adding user to ticket:', error);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Add Failed')
                    .setDescription(`Failed to add user: ${error.message}`)
            ],
            ephemeral: true
        });
    }
}

async function handleTicketRemove(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        const userToRemove = interaction.options.getUser('user');
        
        // Check if we're in a ticket channel
        const ticket = await get(
            'SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? AND status != "closed"',
            [interaction.guildId, interaction.channel.id]
        );

        if (!ticket) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('⚠️ Not a Ticket Channel')
                        .setDescription('This command can only be used in active ticket channels.')
                ],
                ephemeral: true
            });
        }

        // Don't allow removing the ticket owner
        if (userToRemove.id === ticket.user_id) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Cannot Remove Owner')
                        .setDescription('Cannot remove the ticket owner from their own ticket.')
                ],
                ephemeral: true
            });
        }

        // Remove user from the channel
        await interaction.channel.permissionOverwrites.delete(userToRemove);

        const successEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ User Removed')
            .setDescription(`${userToRemove} has been removed from this ticket.`)
            .setTimestamp();

        await replyManager.send({
            embeds: [successEmbed]
        });

    } catch (error) {
        console.error('Error removing user from ticket:', error);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Remove Failed')
                    .setDescription(`Failed to remove user: ${error.message}`)
            ],
            ephemeral: true
        });
    }
}

async function handleTicketTranscript(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        await replyManager.defer({ ephemeral: false });
        
        // Check if we're in a ticket channel
        const ticket = await get(
            'SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ?',
            [interaction.guildId, interaction.channel.id]
        );

        if (!ticket) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('⚠️ Not a Ticket Channel')
                        .setDescription('This command can only be used in ticket channels.')
                ]
            });
        }

        // Fetch all messages in the channel
        let allMessages = [];
        let lastId;

        while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const messages = await interaction.channel.messages.fetch(options);
            if (messages.size === 0) break;

            allMessages = allMessages.concat(Array.from(messages.values()));
            lastId = messages.last().id;
        }

        // Sort messages chronologically
        allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        // Generate transcript
        let transcript = `TICKET TRANSCRIPT\n`;
        transcript += `================\n\n`;
        transcript += `Ticket ID: ${ticket.id}\n`;
        transcript += `Channel: #${interaction.channel.name}\n`;
        transcript += `Owner: ${interaction.guild.members.cache.get(ticket.user_id)?.user.tag || 'Unknown User'}\n`;
        transcript += `Created: ${new Date(ticket.created_at).toLocaleString()}\n`;
        transcript += `Messages: ${allMessages.length}\n\n`;
        transcript += `MESSAGES\n`;
        transcript += `========\n\n`;

        for (const message of allMessages) {
            const timestamp = message.createdAt.toLocaleString();
            const author = message.author.tag;
            let content = message.content || '[No text content]';
            
            // Handle embeds
            if (message.embeds.length > 0) {
                content += '\n[EMBEDS]:';
                message.embeds.forEach(embed => {
                    if (embed.title) content += `\n  Title: ${embed.title}`;
                    if (embed.description) content += `\n  Description: ${embed.description}`;
                });
            }
            
            // Handle attachments
            if (message.attachments.size > 0) {
                content += '\n[ATTACHMENTS]:';
                message.attachments.forEach(attachment => {
                    content += `\n  ${attachment.name} (${attachment.url})`;
                });
            }

            transcript += `[${timestamp}] ${author}: ${content}\n\n`;
        }

        // Save transcript to file
        const fileName = `transcript-${ticket.id}-${Date.now()}.txt`;
        const filePath = path.join(process.cwd(), 'temp', fileName);
        
        // Ensure temp directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, transcript);

        const transcriptEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📄 Transcript Generated')
            .setDescription(`Transcript for ticket #${ticket.id}`)
            .addFields({
                name: 'Messages Captured',
                value: allMessages.length.toString(),
                inline: true
            }, {
                name: 'File Size',
                value: `${Math.round(transcript.length / 1024)} KB`,
                inline: true
            })
            .setTimestamp();

        await replyManager.send({
            embeds: [transcriptEmbed],
            files: [{
                attachment: filePath,
                name: fileName
            }]
        });

        // Clean up temp file
        setTimeout(async () => {
            try {
                await fs.unlink(filePath);
            } catch (error) {
                console.log('Failed to delete temp transcript file:', error);
            }
        }, 30000); // Delete after 30 seconds

    } catch (error) {
        console.error('Error generating transcript:', error);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Transcript Failed')
                    .setDescription(`Failed to generate transcript: ${error.message}`)
            ]
        });
    }
}

async function handleTicketStats(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        await replyManager.defer({ ephemeral: true });

        // Get various statistics
        const totalTickets = await get(
            'SELECT COUNT(*) as count FROM tickets WHERE guild_id = ?',
            [interaction.guildId]
        );

        const openTickets = await get(
            'SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status = "open"',
            [interaction.guildId]
        );

        const closedTickets = await get(
            'SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status = "closed"',
            [interaction.guildId]
        );

        // Get tickets created in the last 7 days
        const recentTickets = await get(
            'SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND created_at > datetime("now", "-7 days")',
            [interaction.guildId]
        );

        // Get most active ticket type
        const typeStats = await get(
            'SELECT type, COUNT(*) as count FROM tickets WHERE guild_id = ? GROUP BY type ORDER BY count DESC LIMIT 5',
            [interaction.guildId]
        );

        const statsEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📊 Ticket Statistics')
            .addFields({
                name: 'Total Tickets',
                value: totalTickets.count.toString(),
                inline: true
            }, {
                name: 'Open Tickets',
                value: openTickets.count.toString(),
                inline: true
            }, {
                name: 'Closed Tickets',
                value: closedTickets.count.toString(),
                inline: true
            }, {
                name: 'This Week',
                value: recentTickets.count.toString(),
                inline: true
            })
            .setTimestamp();

        if (typeStats) {
            const typeText = `${typeStats.type}: ${typeStats.count}`;
            statsEmbed.addFields({
                name: 'Popular Types',
                value: typeText,
                inline: false
            });
        }

        await replyManager.send({
            embeds: [statsEmbed]
        });

    } catch (error) {
        console.error('Error getting ticket stats:', error);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Stats Failed')
                    .setDescription(`Failed to get statistics: ${error.message}`)
            ]
        });
    }
}

async function handleTicketSystemDelete(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        // Confirmation step
        const confirmEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('⚠️ Delete Ticket System')
            .setDescription('This will permanently delete the entire ticket system configuration and all ticket data. This action cannot be undone!')
            .setFooter({ text: 'Are you absolutely sure?' });

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_system_delete_confirm')
                    .setLabel('Delete Everything')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId('ticket_system_delete_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❌')
            );

        await replyManager.send({
            embeds: [confirmEmbed],
            components: [confirmRow],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in ticket system delete:', error);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Delete Failed')
                    .setDescription(`Failed to delete system: ${error.message}`)
            ],
            ephemeral: true
        });
    }
}

export { data, execute };