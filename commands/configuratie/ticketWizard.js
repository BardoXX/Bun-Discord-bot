import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } from 'discord.js';
import { ackUpdate } from '../../modules/utils/ack.js';
import { getTicketSystemsByGuild } from '../../modules/tickets/ticketUtils.js';
import { get, run } from '../utils/database.js';
import { handleInteractionReply } from '../../modules/utils/interactionUtils.js';

// Wizard steps
const STEPS = {
    WELCOME: 0,
    CHANNELS: 1,
    TICKET_TYPES: 2,
    ADVANCED: 3,
    REVIEW: 4
};

const ticketWizardState = new Map();

function getWizardKey(interaction) {
    return `${interaction.guild.id}:${interaction.user.id}`;
}

function buildWelcomeEmbed() {
    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎫 Ticket Setup Wizard')
        .setDescription('Welcome to the ticket system setup! This wizard will guide you through the process of setting up your ticket system.')
        .addFields(
            { name: 'What\'s included', value: '• Custom ticket types\n• Role management\n• Thread/Channel support\n• Logging options' },
            { name: 'Quick Start', value: 'Use the buttons below to get started. You can always go back to change your settings.' }
        );
}

function buildStepEmbed(step, state) {
    const embeds = [];
    const mainEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🎫 Ticket Setup (${step + 1}/4)`)
        .setDescription('Configure your ticket system settings.');

    switch (step) {
        case STEPS.CHANNELS:
            mainEmbed
                .addFields(
                    { name: '🔄 Channel Setup', value: 'Select where you want the ticket panel to appear and where tickets should be created.' },
                    { name: 'Panel Channel', value: state.channelId ? `<#${state.channelId}>` : '❌ Not selected', inline: true },
                    { name: 'Ticket Category', value: state.categoryId ? `<#${state.categoryId}>` : '❌ Not selected', inline: true },
                    { name: 'Log Channel', value: state.logChannelId ? `<#${state.logChannelId}>` : '❌ Not selected', inline: true }
                );
            break;
            
        case STEPS.TICKET_TYPES:
            const ticketTypes = state.types?.length > 0 
                ? state.types.map((t, i) => `${i + 1}. ${t.emoji} ${t.label} (${t.value})`).join('\n')
                : 'No ticket types added yet.';
            
            mainEmbed
                .addFields(
                    { name: '🎫 Ticket Types', value: 'Add and configure different types of tickets.' },
                    { name: 'Current Types', value: ticketTypes }
                );
            break;
            
        case STEPS.ADVANCED:
            mainEmbed
                .addFields(
                    { name: '⚙️ Advanced Settings', value: 'Configure additional options for your ticket system.' },
                    { name: 'Ticket Mode', value: state.thread_mode ? 'Thread' : 'Channel', inline: true },
                    { name: 'Required Role', value: state.requiredRoleId ? `<@&${state.requiredRoleId}>` : 'None', inline: true },
                    { name: 'Naming Format', value: state.namingFormat || 'ticket-{type}-{user}', inline: true }
                );
            break;
            
        case STEPS.REVIEW:
            mainEmbed
                .setTitle('✅ Review & Create')
                .setDescription('Please review your settings before creating the ticket system.')
                .addFields(
                    { name: 'Panel Channel', value: `<#${state.channelId}>`, inline: true },
                    { name: 'Ticket Category', value: `<#${state.categoryId}>`, inline: true },
                    { name: 'Log Channel', value: state.logChannelId ? `<#${state.logChannelId}>` : '❌ Not set', inline: true },
                    { name: 'Ticket Types', value: `${state.types?.length || 0} types configured`, inline: true },
                    { name: 'Ticket Mode', value: state.thread_mode ? 'Thread' : 'Channel', inline: true },
                    { name: 'Required Role', value: state.requiredRoleId ? `<@&${state.requiredRoleId}>` : 'None', inline: true }
                );
            break;
    }
    
    embeds.push(mainEmbed);
    return embeds;
}

function buildWelcomeComponents() {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_wizard_start')
            .setLabel('Start Setup')
            .setStyle(ButtonStyle.Primary)
    );
    return [row];
}

function buildStepComponents(step, state) {
    const components = [];
    
    // Navigation row (back/next/confirm)
    const navRow = new ActionRowBuilder();
    
    if (step > STEPS.WELCOME) {
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_wizard_prev')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    
    if (step < STEPS.REVIEW) {
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_wizard_next')
                .setLabel(step === STEPS.REVIEW - 1 ? 'Review & Create' : 'Next')
                .setStyle(step === STEPS.REVIEW - 1 ? ButtonStyle.Success : ButtonStyle.Primary)
        );
    } else {
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_wizard_confirm')
                .setLabel('Create Ticket System')
                .setStyle(ButtonStyle.Success)
        );
    }
    
    components.push(navRow);
    
    // Step-specific components
    switch (step) {
        case STEPS.CHANNELS:
            const channelRow = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('ticket_wizard_select_channel')
                    .setChannelTypes([ChannelType.GuildText])
                    .setPlaceholder('Select a channel for the ticket panel')
                    .setMaxValues(1)
            );
            
            const categoryRow = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('ticket_wizard_select_category')
                    .setChannelTypes([ChannelType.GuildCategory])
                    .setPlaceholder('Select a category for ticket channels')
                    .setMaxValues(1)
            );
            
            const logRow = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('ticket_wizard_log_channel')
                    .setChannelTypes([ChannelType.GuildText])
                    .setPlaceholder('Select a log channel (optional)')
                    .setMaxValues(1)
            );
            
            components.push(channelRow, categoryRow, logRow);
            break;
            
        case STEPS.TICKET_TYPES:
            const addTypeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_wizard_add_type')
                    .setLabel('Add Ticket Type')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('➕')
            );
            
            components.push(addTypeRow);
            
            if (state.types && state.types.length > 0) {
                const typesRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('ticket_wizard_remove_type')
                        .setPlaceholder('Click to remove a ticket type')
                        .setMinValues(1)
                        .setMaxValues(1)
                        .addOptions(
                            state.types.map(type => ({
                                label: type.label,
                                value: type.value,
                                emoji: type.emoji || '🎟️',
                                description: type.description || 'No description'
                            }))
                        )
                );
                components.push(typesRow);
            }
            break;
            
        case STEPS.ADVANCED:
            const modeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_wizard_toggle_mode')
                    .setLabel(`Mode: ${state.thread_mode ? 'Thread' : 'Channel'}`)
                    .setStyle(ButtonStyle.Secondary)
            );
            
            const roleFormatRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_wizard_advanced_set_role')
                    .setLabel('Set Required Role')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👥'),
                new ButtonBuilder()
                    .setCustomId('ticket_wizard_advanced_set_format')
                    .setLabel('Set Naming Format')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🏷️')
            );
            
            components.push(modeRow, roleFormatRow);
            break;
            
        case STEPS.REVIEW:
            const reviewActionsRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_wizard_review_set_role')
                    .setLabel('Set Required Role')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👥'),
                new ButtonBuilder()
                    .setCustomId('ticket_wizard_review_set_format')
                    .setLabel('Set Naming Format')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🏷️')
            );
            
            components.push(reviewActionsRow);
            break;
    }
    
    return components;
}

export async function handleTicketWizard(interaction) {
    const key = getWizardKey(interaction);
    const state = {
        step: STEPS.WELCOME,
        channelId: null,
        categoryId: null,
        logChannelId: null,
        types: [],
        thread_mode: false,
        requiredRoleId: null,
        namingFormat: 'ticket-{type}-{user}'
    };
    
    ticketWizardState.set(key, state);
    
    const embed = buildWelcomeEmbed();
    const components = buildWelcomeComponents();
    
    const reply = async (options) => {
        try {
            if (interaction.deferred || interaction.replied) {
                return await interaction.followUp(options);
            } else {
                return await interaction.reply(options);
            }
        } catch (error) {
            console.error('Error sending reply:', error);
        }
    };

    // Check if the interaction has already been replied to
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ 
            embeds: [embed],
            components,
            ephemeral: true 
        });
    } else {
        await reply({ 
            embeds: [embed],
            components,
            ephemeral: true 
        });
    }
}

export async function editTicketSetup(interaction) {
    try {
        // Get all ticket systems for this guild
        const db = interaction.client.db;
        const ticketSystems = await db.all(
            'SELECT * FROM ticket_systems WHERE guild_id = ?',
            [interaction.guild.id]
        );

        if (ticketSystems.length === 0) {
            return await handleInteractionReply(interaction, {
                content: '❌ No ticket systems found to edit. Please create one first using `/ticket setup`.',
                ephemeral: true
            });
        }

        // Create a select menu with existing ticket systems
        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_ticket_system')
                .setPlaceholder('Select a ticket system to edit')
                .addOptions(
                    ticketSystems.map(sys => ({
                        label: `Ticket System #${sys.id}`,
                        description: `Panel in: ${sys.channel_id ? `<#${sys.channel_id}>` : 'Not set'}`,
                        value: sys.id.toString()
                    }))
                )
        );

        await handleInteractionReply(interaction, {
            content: 'Select the ticket system you want to edit:',
            components: [selectRow],
            ephemeral: true
        });
    } catch (error) {
        console.error('Error in editTicketSetup:', error);
        await handleInteractionReply(interaction, {
            content: '❌ An error occurred while trying to edit the ticket system.',
            ephemeral: true
        });
    }
}

export async function handleTicketWizardComponent(interaction) {
    const key = getWizardKey(interaction);
    const state = ticketWizardState.get(key) || { step: STEPS.WELCOME };
    
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChannelSelectMenu()) {
        return;
    }
    
    try {
        // Handle navigation
        if (interaction.customId === 'ticket_wizard_start') {
            state.step = STEPS.CHANNELS;
        } 
        else if (interaction.customId === 'ticket_wizard_next') {
            if (state.step === STEPS.ADVANCED) {
                // Move to review step first
                state.step = STEPS.REVIEW;
                ticketWizardState.set(key, state);
                
                // Show the review step
                const updatePromise = interaction.update({
                    embeds: buildStepEmbed(state.step, state),
                    components: buildStepComponents(state.step, state)
                });
                
                // After showing the review step, handle the confirmation
                updatePromise.then(() => {
                    // Use a small delay to ensure the update is complete
                    setTimeout(() => {
                        handleTicketWizardConfirm(interaction, state).catch(error => {
                            console.error('Error in auto-confirmation:', error);
                        });
                    }, 500);
                });
                
                return;
            }
            state.step++;
        }
        else if (interaction.customId === 'ticket_wizard_prev') {
            if (state.step > STEPS.WELCOME) {
                state.step--;
                ticketWizardState.set(key, state);
                
                const embeds = buildStepEmbed(state.step, state);
                const components = buildStepComponents(state.step, state);
                await interaction.update({ embeds, components });
            } else {
                await interaction.deferUpdate();
            }
            return;
        }
        
        // Handle confirmation
        else if (interaction.customId === 'ticket_wizard_confirm') {
            if (!state.channelId || !state.categoryId) {
                if (!interaction.replied && !interaction.deferred) {
                    await handleInteractionReply(interaction, { 
                        content: '❌ Please complete all required fields first.', 
                        ephemeral: true 
                    });
                } else {
                    await handleInteractionReply(interaction, { 
                        content: '❌ Please complete all required fields first.', 
                        ephemeral: true 
                    });
                }
                return;
            }

            // Defer the interaction if not already done
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferUpdate();
            }
            
            try {
                // Auto-confirm if we're in a DM (for testing)
                if (!interaction.guild) {
                    // For DMs, use a different state key and skip guild-specific checks
                    const dmKey = `dm:${interaction.user.id}`;
                    const dmState = ticketWizardState.get(dmKey) || { ...state };
                    
                    // Set some default values for testing
                    dmState.guildId = 'test';
                    dmState.channelId = dmState.channelId || 'test-channel';
                    dmState.categoryId = dmState.categoryId || 'test-category';
                    
                    // Update the state and proceed with confirmation
                    ticketWizardState.set(dmKey, dmState);
                    await handleTicketWizardConfirm(interaction, dmState);
                    return;
                } else {
                    // For guild interactions, proceed normally
                    state.guildId = interaction.guild.id;
                    state.channelId = interaction.channelId;
                    
                    // Check if a ticket system already exists for this guild
                    const existingSystem = await get(
                        'SELECT id FROM ticket_systems WHERE guild_id = ?', 
                        [state.guildId]
                    );
                    
                    if (existingSystem) {
                        // Update existing system instead of creating a new one
                        await run(
                            'UPDATE ticket_systems SET channel_id = ?, category_id = ?, log_channel_id = ?, thread_mode = ?, required_role_id = ?, naming_format = ?, types = ? WHERE guild_id = ?',
                            [
                                state.channelId, 
                                state.categoryId, 
                                state.logChannelId, 
                                state.thread_mode ? 1 : 0, 
                                state.requiredRoleId, 
                                state.namingFormat, 
                                JSON.stringify(state.types || []), 
                                state.guildId
                            ]
                        );
                        
                        await handleInteractionReply(interaction, {
                            content: '✅ Successfully updated ticket system!',
                            ephemeral: true
                        });
                    } else {
                        // Create new ticket system
                        await run(
                            'INSERT INTO ticket_systems (guild_id, channel_id, category_id, log_channel_id, thread_mode, required_role_id, naming_format, types) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            [
                                state.guildId, 
                                state.channelId, 
                                state.categoryId, 
                                state.logChannelId, 
                                state.thread_mode ? 1 : 0, 
                                state.requiredRoleId, 
                                state.namingFormat, 
                                JSON.stringify(state.types || [])
                            ]
                        );
                        
                        await handleInteractionReply(interaction, {
                            content: '✅ Successfully created ticket system!',
                            ephemeral: true
                        });
                    }
                    
                    // Clean up the state
                    ticketWizardState.delete(key);
                }
            } catch (error) {
                console.error('Error saving ticket system:', error);
                await interaction.update({
                    content: '❌ An error occurred while saving the ticket system.',
                    components: []
                });
            }
            return;
        }
        
        // Handle channel selections
        else if (interaction.isChannelSelectMenu()) {
            const value = interaction.values?.[0];
            if (interaction.customId === 'ticket_wizard_select_channel') state.channelId = value;
            else if (interaction.customId === 'ticket_wizard_select_category') state.categoryId = value;
            else if (interaction.customId === 'ticket_wizard_log_channel') state.logChannelId = value;
        }
        
        // Handle ticket type management
        else if (interaction.customId === 'ticket_wizard_add_type') {
            // Show modal to add new ticket type
            const modal = new ModalBuilder()
                .setCustomId('ticket_type_modal')
                .setTitle('Add Ticket Type');
                
            const typeName = new TextInputBuilder()
                .setCustomId('type_name')
                .setLabel('Ticket Type Name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('e.g., Support, Report, Application');
                
            const typeEmoji = new TextInputBuilder()
                .setCustomId('type_emoji')
                .setLabel('Emoji (optional)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder('e.g., 🆘, ❓, 📝');
                
            const typeDescription = new TextInputBuilder()
                .setCustomId('type_description')
                .setLabel('Description (optional)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setPlaceholder('A brief description of this ticket type');
                
            const firstActionRow = new ActionRowBuilder().addComponents(typeName);
            const secondActionRow = new ActionRowBuilder().addComponents(typeEmoji);
            const thirdActionRow = new ActionRowBuilder().addComponents(typeDescription);
            
            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
            await interaction.showModal(modal);
            return;
        }
        
        // Toggle thread mode
        else if (interaction.customId === 'ticket_wizard_toggle_mode') {
            state.thread_mode = !state.thread_mode;
            ticketWizardState.set(key, state);
            
            const embeds = buildStepEmbed(state.step, state);
            const components = buildStepComponents(state.step, state);
            await interaction.update({ embeds, components });
            return;
        }
        
        // Handle setting naming format
        else if (interaction.customId === 'ticket_wizard_advanced_set_format' || interaction.customId === 'ticket_wizard_review_set_format') {
            // Show a modal for the naming format
            const modal = new ModalBuilder()
                .setCustomId('ticket_naming_modal')
                .setTitle('Ticket Naming Format');
                
            const formatInput = new TextInputBuilder()
                .setCustomId('naming_format')
                .setLabel('Format (use {type} and {user} as placeholders)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(state.namingFormat || 'ticket-{type}-{user}')
                .setPlaceholder('Example: ticket-{type}-{user}');
                
            const firstActionRow = new ActionRowBuilder().addComponents(formatInput);
            modal.addComponents(firstActionRow);
            
            await interaction.showModal(modal);
            return;
        }
        
        // Handle setting required role
        else if (interaction.customId === 'ticket_wizard_advanced_set_role' || interaction.customId === 'ticket_wizard_review_set_role') {
            // Show a modal for the required role
            const modal = new ModalBuilder()
                .setCustomId('ticket_role_modal')
                .setTitle('Required Role');
                
            const roleInput = new TextInputBuilder()
                .setCustomId('required_role')
                .setLabel('Role ID (leave empty to disable)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setValue(state.requiredRoleId || '')
                .setPlaceholder('Example: 1234567890');
                
            const firstActionRow = new ActionRowBuilder().addComponents(roleInput);
            modal.addComponents(firstActionRow);
            
            await interaction.showModal(modal);
            return;
        }
        
        // Handle select ticket system
        else if (interaction.customId === 'select_ticket_system') {
            if (interaction.isStringSelectMenu()) {
                const ticketId = interaction.values[0];
                try {
                    const ticketSystem = await get(
                        'SELECT * FROM ticket_systems WHERE id = ?', 
                        [ticketId]
                    );

                    if (!ticketSystem) {
                        return interaction.update({
                            content: '❌ Ticket system not found.',
                            components: []
                        });
                    }

                    // Parse the existing configuration
                    const state = {
                        guildId: interaction.guild.id,
                        channelId: ticketSystem.channel_id,
                        categoryId: ticketSystem.category_id,
                        logChannelId: ticketSystem.log_channel_id,
                        thread_mode: ticketSystem.thread_mode,
                        requiredRoleId: ticketSystem.required_role_id,
                        namingFormat: ticketSystem.naming_format,
                        types: JSON.parse(ticketSystem.types || '[]'),
                        step: STEPS.CHANNELS,
                        isEditing: true,
                        editId: ticketSystem.id
                    };

                    const key = getWizardKey(interaction);
                    ticketWizardState.set(key, state);

                    await interaction.update({
                        content: 'Editing ticket system:',
                        embeds: buildStepEmbed(state.step, state),
                        components: buildStepComponents(state.step, state)
                    });
                } catch (error) {
                    console.error('Error loading ticket system:', error);
                    await interaction.update({
                        content: '❌ Failed to load ticket system. Please try again.',
                        components: []
                    });
                }
            }
        }
        
        // Save state and update message
        ticketWizardState.set(key, state);
        
        // Only update if we haven't shown a modal
        if (!interaction.isModalSubmit()) {
            const embeds = state.step === STEPS.WELCOME 
                ? [buildWelcomeEmbed()] 
                : buildStepEmbed(state.step, state);
                
            const components = state.step === STEPS.WELCOME
                ? buildWelcomeComponents()
                : buildStepComponents(state.step, state);
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds, components });
            } else {
                await interaction.update({ embeds, components });
            }
        }
        
    } catch (error) {
        console.error('Error in ticket wizard:', error);
        
        // Only send error if we haven't already replied
        if (!interaction.replied && !interaction.deferred) {
            await handleInteractionReply(interaction, { 
                content: 'An error occurred while processing your request.', 
                ephemeral: true 
            });
        } else {
            try {
                await handleInteractionReply(interaction, { 
                    content: 'An error occurred while processing your request.', 
                    ephemeral: true 
                });
            } catch (e) {
                console.error('Failed to send error follow-up:', e);
            }
        }
    }
}

export async function handleTicketWizardConfirm(interaction, state) {
    const interactionToUse = interaction.deferred || interaction.replied ? 
        interaction.followUp.bind(interaction) : 
        interaction.reply.bind(interaction);
    
    try {
        // For DMs, use test values
        if (!interaction.guild) {
            const dmKey = `dm:${interaction.user.id}`;
            const dmState = ticketWizardState.get(dmKey) || { ...state };
            
            // Set test values
            dmState.guildId = 'test';
            dmState.channelId = dmState.channelId || 'test-channel';
            dmState.categoryId = dmState.categoryId || 'test-category';
            
            await handleInteractionReply(interaction, {
                content: '✅ Test configuration saved! (DM mode)',
                ephemeral: true
            });
            
            ticketWizardState.delete(dmKey);
            return;
        }
        
        // For guild interactions
        state.guildId = interaction.guild.id;
        
        // Get database connection
        const db = getDb();
        if (!db) {
            throw new Error('Database connection not available');
        }
        
        // Check if a ticket system already exists for this guild
        const existingSystem = await get(
            'SELECT id FROM ticket_systems WHERE guild_id = ?', 
            [state.guildId]
        );
        
        if (existingSystem) {
            // Update existing system
            await run(
                'UPDATE ticket_systems SET channel_id = ?, category_id = ?, log_channel_id = ?, thread_mode = ?, required_role_id = ?, naming_format = ?, types = ? WHERE guild_id = ?',
                [
                    state.channelId, 
                    state.categoryId, 
                    state.logChannelId, 
                    state.thread_mode ? 1 : 0, 
                    state.requiredRoleId, 
                    state.namingFormat, 
                    JSON.stringify(state.types || []), 
                    state.guildId
                ]
            );
            
            await handleInteractionReply(interaction, {
                content: '✅ Successfully updated ticket system!',
                ephemeral: true
            });
        } else {
            // Create new ticket system
            await run(
                'INSERT INTO ticket_systems (guild_id, channel_id, category_id, log_channel_id, thread_mode, required_role_id, naming_format, types) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    state.guildId, 
                    state.channelId, 
                    state.categoryId, 
                    state.logChannelId, 
                    state.thread_mode ? 1 : 0, 
                    state.requiredRoleId, 
                    state.namingFormat, 
                    JSON.stringify(state.types || [])
                ]
            );
            
            await handleInteractionReply(interaction, {
                content: '✅ Successfully created ticket system!',
                ephemeral: true
            });
        }
        
        // Clean up the state
        ticketWizardState.delete(getWizardKey(interaction));
        
    } catch (error) {
        console.error('Error in handleTicketWizardConfirm:', error);
        
        // Try to send an error message, but don't fail if we can't
        try {
            await handleInteractionReply(interaction, {
                content: '❌ An error occurred while saving the ticket system. Please try again.',
                ephemeral: true
            });
        } catch (e) {
            console.error('Could not send error message:', e);
        }
    }
}

// Handle modal submissions
export async function handleTicketWizardModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    
    const key = getWizardKey(interaction);
    const state = ticketWizardState.get(key);
    
    if (!state) {
        await handleInteractionReply(interaction, { 
            content: 'Your ticket wizard session has expired. Please start over.', 
            ephemeral: true 
        });
        return;
    }
    
    try {
        // Handle ticket type modal
        if (interaction.customId === 'ticket_type_modal') {
            const typeName = interaction.fields.getTextInputValue('type_name');
            const typeEmoji = interaction.fields.getTextInputValue('type_emoji') || '🎫';
            const typeDescription = interaction.fields.getTextInputValue('type_description') || '';
            
            if (!state.types) state.types = [];
            state.types.push({
                label: typeName,
                value: typeName.toLowerCase().replace(/\s+/g, '-'),
                emoji: typeEmoji,
                description: typeDescription
            });
            
            ticketWizardState.set(key, state);
            
            await interaction.deferUpdate();
            const embeds = buildStepEmbed(state.step, state);
            const components = buildStepComponents(state.step, state);
            await interaction.editReply({ embeds, components });
        }
        // Handle naming format modal
        else if (interaction.customId === 'ticket_naming_modal') {
            const format = interaction.fields.getTextInputValue('naming_format');
            state.namingFormat = format || 'ticket-{type}-{user}';
            ticketWizardState.set(key, state);
            
            await interaction.deferUpdate();
            const embeds = buildStepEmbed(state.step, state);
            const components = buildStepComponents(state.step, state);
            await interaction.editReply({ embeds, components });
        }
        // Handle required role modal
        else if (interaction.customId === 'ticket_role_modal') {
            const roleId = interaction.fields.getTextInputValue('required_role');
            state.requiredRoleId = roleId || null;
            ticketWizardState.set(key, state);
            
            await interaction.deferUpdate();
            const embeds = buildStepEmbed(state.step, state);
            const components = buildStepComponents(state.step, state);
            await interaction.editReply({ embeds, components });
        }
    } catch (error) {
        console.error('Error in ticket wizard modal:', error);
        
        // Try to send an error message, but don't crash if it fails
        try {
            await handleInteractionReply(interaction, { 
                content: '❌ An error occurred while processing your input.', 
                ephemeral: true 
            });
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    }
}
