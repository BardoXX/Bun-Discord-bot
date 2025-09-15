// ticketWizard.js - Improved version with panel creation and ticket handling
import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelSelectMenuBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ChannelType,
    PermissionFlagsBits 
} from 'discord.js';
import { get, run, getDb } from '../utils/database.js';
import ReplyManager from '../../modules/utils/replyManager.js';

// Constants
const STEPS = {
    WELCOME: 'welcome',
    CHANNELS: 'channels',
    TICKET_TYPES: 'ticket_types',
    ADVANCED: 'advanced',
    REVIEW: 'review'
};

const STEP_ORDER = [STEPS.WELCOME, STEPS.CHANNELS, STEPS.TICKET_TYPES, STEPS.ADVANCED, STEPS.REVIEW];

const DEFAULT_TICKET_TYPES = [
    { label: 'General Support', emoji: '🆘', value: 'general-support', description: 'General help and support' },
    { label: 'Bug Report', emoji: '🐛', value: 'bug-report', description: 'Report a bug or issue' },
    { label: 'Feature Request', emoji: '💡', value: 'feature-request', description: 'Request a new feature' },
    { label: 'Other', emoji: '❓', value: 'other', description: 'Other inquiries' }
];

const INTERACTION_TIMEOUT = 15 * 60 * 1000;
const BUTTON_DEBOUNCE = 1000;

// State management
class WizardStateManager {
    constructor() {
        this.states = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);
    }

    getKey(interaction) {
        return `${interaction.guild?.id || 'dm'}:${interaction.user.id}`;
    }

    get(interaction) {
        const key = this.getKey(interaction);
        const state = this.states.get(key);
        
        if (state) {
            state.lastAccess = Date.now();
            return state;
        }
        
        return null;
    }

    set(interaction, data) {
        const key = this.getKey(interaction);
        this.states.set(key, {
            ...data,
            lastAccess: Date.now(),
            createdAt: Date.now()
        });
    }

    delete(interaction) {
        const key = this.getKey(interaction);
        this.states.delete(key);
    }

    cleanup() {
        const now = Date.now();
        const maxAge = 60 * 60 * 1000;

        for (const [key, state] of this.states.entries()) {
            if (now - state.lastAccess > maxAge) {
                this.states.delete(key);
            }
        }
    }

    destroy() {
        clearInterval(this.cleanupInterval);
        this.states.clear();
    }
}

const wizardState = new WizardStateManager();
const activeInteractions = new Map();
const buttonCooldowns = new Map();

// Utility functions
function getStepIndex(step) {
    return STEP_ORDER.indexOf(step);
}

function getNextStep(currentStep) {
    const currentIndex = getStepIndex(currentStep);
    return currentIndex < STEP_ORDER.length - 1 ? STEP_ORDER[currentIndex + 1] : currentStep;
}

function getPreviousStep(currentStep) {
    const currentIndex = getStepIndex(currentStep);
    return currentIndex > 0 ? STEP_ORDER[currentIndex - 1] : currentStep;
}

function createDefaultState(guildId) {
    return {
        step: STEPS.WELCOME,
        guildId,
        channelId: null,
        categoryId: null,
        logChannelId: null,
        types: [],
        threadMode: false,
        requiredRoleId: null,
        namingFormat: 'ticket-{type}-{user}',
        isEditing: false,
        editId: null,
        panelTitle: 'Support Tickets',
        panelDescription: 'Click a button below to create a ticket for assistance.',
        maxTicketsPerUser: 1
    };
}

function validateState(state) {
    const errors = [];
    
    if (!state.channelId) errors.push('Panel channel is required');
    if (!state.categoryId && !state.threadMode) errors.push('Ticket category is required');
    if (!state.types || state.types.length === 0) errors.push('At least one ticket type is required');
    if (state.types && state.types.length > 25) errors.push('Maximum 25 ticket types allowed');
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

function logInteraction(interaction, message, isError = false) {
    const timestamp = new Date().toISOString();
    const guildId = interaction.guildId || 'DM';
    const userId = interaction.user?.id || 'unknown';
    const logMessage = `[${timestamp}] [Guild:${guildId}] [User:${userId}] ${message}`;
    
    if (isError) {
        console.error(logMessage);
    } else {
        console.log(logMessage);
    }
}

function isButtonOnCooldown(interaction) {
    const key = `${interaction.user.id}-${interaction.customId}`;
    const now = Date.now();
    
    for (const [k, timestamp] of buttonCooldowns.entries()) {
        if (now > timestamp) {
            buttonCooldowns.delete(k);
        }
    }
    
    if (buttonCooldowns.has(key)) {
        return true;
    }
    
    buttonCooldowns.set(key, now + BUTTON_DEBOUNCE);
    return false;
}

// Embed builders
function buildWelcomeEmbed() {
    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎫 Ticket Setup Wizard')
        .setDescription('Welcome to the ticket system setup! This wizard will guide you through configuring your ticket system.')
        .addFields(
            { 
                name: '✨ Features Included', 
                value: '• Custom ticket types with emojis\n• Thread or channel support\n• Role-based access control\n• Comprehensive logging\n• Auto-generated ticket panels\n• User ticket limits' 
            },
            { 
                name: '🚀 Getting Started', 
                value: 'Click the button below to begin. You can navigate back and forth to adjust your settings at any time.' 
            }
        )
        .setFooter({ text: 'Step 1 of 5 - Welcome' });
}

function buildStepEmbed(step, state) {
    const stepIndex = getStepIndex(step);
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setFooter({ text: `Step ${stepIndex + 1} of ${STEP_ORDER.length}` });

    switch (step) {
        case STEPS.CHANNELS:
            embed
                .setTitle('📍 Channel Configuration')
                .setDescription('Select the channels for your ticket system.')
                .addFields(
                    { 
                        name: '📋 Panel Channel', 
                        value: state.channelId ? `<#${state.channelId}>` : '❌ Not selected', 
                        inline: true 
                    },
                    { 
                        name: '📁 Ticket Category', 
                        value: state.categoryId ? `<#${state.categoryId}>` : (state.threadMode ? '✅ Using threads' : '❌ Not selected'), 
                        inline: true 
                    },
                    { 
                        name: '📝 Log Channel', 
                        value: state.logChannelId ? `<#${state.logChannelId}>` : '⚠️ Optional', 
                        inline: true 
                    }
                );
            break;
            
        case STEPS.TICKET_TYPES:
            const typesList = state.types?.length > 0 
                ? state.types.map(t => `${t.emoji || '📝'} **${t.label}** - ${t.description || 'No description'}`).join('\n')
                : 'No ticket types configured yet.';
            
            embed
                .setTitle('🎫 Ticket Types')
                .setDescription('Configure the types of tickets users can create.')
                .addFields(
                    { 
                        name: `Configured Types (${state.types?.length || 0}/25)`, 
                        value: typesList.length > 1024 ? typesList.substring(0, 1021) + '...' : typesList
                    }
                );
            break;
            
        case STEPS.ADVANCED:
            embed
                .setTitle('⚙️ Advanced Settings')
                .setDescription('Configure additional options for your ticket system.')
                .addFields(
                    { 
                        name: '🔧 Ticket Mode', 
                        value: state.threadMode ? '🧵 Threads (Recommended)' : '📋 Channels', 
                        inline: true 
                    },
                    { 
                        name: '👥 Required Role', 
                        value: state.requiredRoleId ? `<@&${state.requiredRoleId}>` : 'None (Everyone can create tickets)', 
                        inline: true 
                    },
                    { 
                        name: '🏷️ Naming Format', 
                        value: `\`${state.namingFormat}\`\n*Use {type}, {user}, and {number} as placeholders*`, 
                        inline: false 
                    },
                    { 
                        name: '📋 Panel Title', 
                        value: state.panelTitle, 
                        inline: true 
                    },
                    { 
                        name: '🔢 Max Tickets Per User', 
                        value: state.maxTicketsPerUser.toString(), 
                        inline: true 
                    }
                );
            break;
            
        case STEPS.REVIEW:
            const validation = validateState(state);
            embed
                .setTitle('✅ Review Configuration')
                .setDescription(validation.isValid 
                    ? 'Your ticket system is ready to be created!' 
                    : `⚠️ **Please fix the following issues:**\n${validation.errors.map(e => `• ${e}`).join('\n')}`
                )
                .addFields(
                    { name: '📋 Panel Channel', value: `<#${state.channelId}>`, inline: true },
                    { name: '📁 Category/Mode', value: state.threadMode ? 'Threads' : `<#${state.categoryId}>`, inline: true },
                    { name: '📝 Log Channel', value: state.logChannelId ? `<#${state.logChannelId}>` : 'Not set', inline: true },
                    { name: '🎫 Ticket Types', value: `${state.types?.length || 0} configured`, inline: true },
                    { name: '👥 Role Requirement', value: state.requiredRoleId ? `<@&${state.requiredRoleId}>` : 'None', inline: true },
                    { name: '🔢 Max Per User', value: state.maxTicketsPerUser.toString(), inline: true }
                );
            
            if (!validation.isValid) {
                embed.setColor('#ff9900');
            }
            break;
    }

    return embed;
}

// Component builders
function buildWelcomeComponents() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_wizard_start')
                .setLabel('Start Setup')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🚀')
        )
    ];
}

function buildNavigationRow(step, state) {
    const row = new ActionRowBuilder();
    const stepIndex = getStepIndex(step);
    
    if (stepIndex > 0) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_wizard_prev')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );
    }
    
    if (step === STEPS.REVIEW) {
        const validation = validateState(state);
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_wizard_confirm')
                .setLabel('Create Ticket System')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
                .setDisabled(!validation.isValid)
        );
    } else if (stepIndex < STEP_ORDER.length - 1) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_wizard_next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➡️')
        );
    }
    
    return row;
}

function buildStepComponents(step, state) {
    const components = [buildNavigationRow(step, state)];
    
    switch (step) {
        case STEPS.CHANNELS:
            components.push(
                new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId('wizard_select_panel_channel')
                        .setChannelTypes([ChannelType.GuildText])
                        .setPlaceholder('Select panel channel')
                        .setMaxValues(1)
                ),
                new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId('wizard_select_category')
                        .setChannelTypes([ChannelType.GuildCategory])
                        .setPlaceholder('Select ticket category (skip if using threads)')
                        .setMaxValues(1)
                ),
                new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId('wizard_select_log_channel')
                        .setChannelTypes([ChannelType.GuildText])
                        .setPlaceholder('Select log channel (optional)')
                        .setMaxValues(1)
                )
            );
            break;
            
        case STEPS.TICKET_TYPES:
            const typeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('wizard_add_type')
                    .setLabel('Add Custom Type')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('➕'),
                new ButtonBuilder()
                    .setCustomId('wizard_quick_setup')
                    .setLabel('Add Default Types')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚡')
            );
            
            components.push(typeRow);
            
            if (state.types?.length > 0) {
                const removeRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('wizard_remove_type')
                        .setPlaceholder('Remove a ticket type')
                        .setMaxValues(1)
                        .addOptions(
                            state.types.map(type => ({
                                label: type.label,
                                value: type.value,
                                emoji: type.emoji,
                                description: type.description?.substring(0, 100) || 'No description'
                            }))
                        )
                );
                components.push(removeRow);
            }
            break;
            
        case STEPS.ADVANCED:
            components.push(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('wizard_toggle_mode')
                        .setLabel(`Switch to ${state.threadMode ? 'Channels' : 'Threads'}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(state.threadMode ? '📋' : '🧵'),
                    new ButtonBuilder()
                        .setCustomId('wizard_set_role')
                        .setLabel('Set Required Role')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('👥')
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('wizard_set_format')
                        .setLabel('Set Naming Format')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🏷️'),
                    new ButtonBuilder()
                        .setCustomId('wizard_set_panel')
                        .setLabel('Customize Panel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🎨')
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('wizard_set_limits')
                        .setLabel('Set User Limits')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔢')
                )
            );
            break;
    }
    
    return components;
}

// Modal builders
function createTicketTypeModal() {
    return new ModalBuilder()
        .setCustomId('wizard_type_modal')
        .setTitle('Add Ticket Type')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('type_name')
                    .setLabel('Ticket Type Name')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(80)
                    .setPlaceholder('e.g., General Support, Bug Report')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('type_emoji')
                    .setLabel('Emoji (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(10)
                    .setPlaceholder('e.g., 🆘, 🐛, 💡')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('type_description')
                    .setLabel('Description (optional)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(200)
                    .setPlaceholder('Brief description of this ticket type')
            )
        );
}

function createNamingModal(currentFormat) {
    return new ModalBuilder()
        .setCustomId('wizard_naming_modal')
        .setTitle('Ticket Naming Format')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('naming_format')
                    .setLabel('Format (use {type}, {user}, {number})')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50)
                    .setValue(currentFormat)
                    .setPlaceholder('ticket-{type}-{user}')
            )
        );
}

function createRoleModal(currentRoleId) {
    return new ModalBuilder()
        .setCustomId('wizard_role_modal')
        .setTitle('Required Role')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('required_role_id')
                    .setLabel('Role ID (leave empty for no requirement)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setValue(currentRoleId || '')
                    .setPlaceholder('123456789012345678')
            )
        );
}

function createPanelCustomizationModal(state) {
    return new ModalBuilder()
        .setCustomId('wizard_panel_modal')
        .setTitle('Customize Ticket Panel')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_title')
                    .setLabel('Panel Title')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100)
                    .setValue(state.panelTitle)
                    .setPlaceholder('Support Tickets')
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_description')
                    .setLabel('Panel Description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(500)
                    .setValue(state.panelDescription)
                    .setPlaceholder('Click a button below to create a ticket for assistance.')
            )
        );
}

function createLimitsModal(currentLimit) {
    return new ModalBuilder()
        .setCustomId('wizard_limits_modal')
        .setTitle('User Ticket Limits')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('max_tickets')
                    .setLabel('Max tickets per user (0 = unlimited)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(2)
                    .setValue(currentLimit.toString())
                    .setPlaceholder('1')
            )
        );
}

// Panel creation
async function createTicketPanel(state, interaction) {
    try {
        const channel = await interaction.guild.channels.fetch(state.channelId);
        
        if (!channel) {
            throw new Error('Panel channel not found');
        }

        // Check bot permissions
        const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
        if (!channel.permissionsFor(botMember).has([
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ViewChannel
        ])) {
            throw new Error('Bot lacks permissions in panel channel');
        }

        // Create panel embed
        const panelEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(state.panelTitle)
            .setDescription(state.panelDescription)
            .setFooter({ text: 'Select a ticket type below' })
            .setTimestamp();

        // Create buttons for ticket types (max 5 per row, max 25 total)
        const components = [];
        let currentRow = new ActionRowBuilder();
        let buttonCount = 0;

        for (const type of state.types) {
            if (buttonCount === 5) {
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
                buttonCount = 0;
            }

            if (components.length === 5) break; // Discord limit

            // Use the format expected by the ticket button handler
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_button_${type.value}`)
                    .setLabel(type.label)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(type.emoji || '🎫')
            );

            buttonCount++;
        }

        if (currentRow.components.length > 0) {
            components.push(currentRow);
        }

        // Send the panel
        const message = await channel.send({
            embeds: [panelEmbed],
            components
        });

        // Store message ID for reference
        return message.id;

    } catch (error) {
        logInteraction(interaction, `Error creating ticket panel: ${error.message}`, true);
        throw error;
    }
}

// Database operations
async function saveTicketSystem(state) {
    const db = getDb();
    if (!db) throw new Error('Database connection not available');

    const data = [
        state.channelId || '',
        state.categoryId || state.channelId || '',  // Use channelId as fallback if categoryId is not set
        state.logChannelId || '',
        state.threadMode ? 1 : 0,
        state.requiredRoleId || null,
        state.namingFormat || 'ticket-{type}-{user}',
        JSON.stringify(state.types || []),
        state.panelTitle || 'Open a Ticket',
        state.panelDescription || 'Click the button below to create a ticket',
        state.maxTicketsPerUser || 3,
        state.categoryId || state.channelId || '',  // Use channelId as fallback for ticket_category_id
        state.guildId
    ];

    if (state.isEditing && state.editId) {
        await run(
            'UPDATE ticket_systems SET channel_id = ?, category_id = ?, log_channel_id = ?, thread_mode = ?, required_role_id = ?, naming_format = ?, types = ?, panel_title = ?, panel_description = ?, max_tickets_per_user = ?, ticket_category_id = ? WHERE id = ? AND guild_id = ?',
            [...data, state.editId]
        );
    } else {
        const existing = await get('SELECT id FROM ticket_systems WHERE guild_id = ?', [state.guildId]);
        
        if (existing) {
            await run(
                'UPDATE ticket_systems SET channel_id = ?, category_id = ?, log_channel_id = ?, thread_mode = ?, required_role_id = ?, naming_format = ?, types = ?, panel_title = ?, panel_description = ?, max_tickets_per_user = ?, ticket_category_id = ? WHERE guild_id = ?',
                data
            );
        } else {
            await run(
                'INSERT INTO ticket_systems (channel_id, category_id, log_channel_id, thread_mode, required_role_id, naming_format, types, panel_title, panel_description, max_tickets_per_user, ticket_category_id, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                data
            );
        }
    }
}

// Main handlers
export async function handleTicketWizard(interaction) {
    logInteraction(interaction, 'Starting ticket wizard...');
    
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }
        
        const state = createDefaultState(interaction.guild?.id);
        wizardState.set(interaction, state);
        
        const embed = buildWelcomeEmbed();
        const components = buildWelcomeComponents();
        
        await interaction.editReply({
            embeds: [embed],
            components,
            ephemeral: true
        });
        
        logInteraction(interaction, 'Welcome message sent successfully');
        
    } catch (error) {
        logInteraction(interaction, `Error in handleTicketWizard: ${error.message}`, true);
        
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: '❌ Failed to start the ticket wizard. Please try again.',
                    ephemeral: true
                });
            } catch (e) {
                logInteraction(interaction, `Failed to send error message: ${e.message}`, true);
            }
        }
    }
}

export async function editTicketSetup(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        const db = getDb();
        const existingConfig = await get(
            'SELECT * FROM ticket_systems WHERE guild_id = ?',
            [interaction.guildId]
        );

        if (!existingConfig) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('⚠️ No Ticket System Found')
                        .setDescription('No ticket system is configured for this server. Use `/ticket setup` to create one.')
                ]
            });
        }

        const state = {
            step: STEPS.WELCOME,
            guildId: interaction.guildId,
            channelId: existingConfig.channel_id,
            categoryId: existingConfig.category_id,
            logChannelId: existingConfig.log_channel_id,
            types: JSON.parse(existingConfig.types || '[]'),
            threadMode: existingConfig.thread_mode === 1,
            requiredRoleId: existingConfig.required_role_id,
            namingFormat: existingConfig.naming_format || 'ticket-{type}-{user}',
            panelTitle: existingConfig.panel_title || 'Support Tickets',
            panelDescription: existingConfig.panel_description || 'Click a button below to create a ticket for assistance.',
            maxTicketsPerUser: existingConfig.max_tickets_per_user || 1,
            isEditing: true,
            editId: existingConfig.id
        };

        wizardState.set(interaction, state);

        const embed = buildWelcomeEmbed();
        const components = buildWelcomeComponents();

        await replyManager.send({
            embeds: [embed],
            components,
            ephemeral: true
        });

    } catch (error) {
        logInteraction(interaction, `Error in editTicketSetup: ${error.message}`, true);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('An error occurred while loading the ticket system configuration.')
            ]
        });
    }
}

async function withInteractionLock(interaction, callback) {
    const interactionId = `${interaction.id}-${interaction.user.id}`;
    
    if (activeInteractions.has(interactionId)) {
        logInteraction(interaction, 'Duplicate interaction detected, skipping');
        return { handled: false, reason: 'duplicate' };
    }

    const cleanup = () => {
        clearTimeout(timeoutId);
        activeInteractions.delete(interactionId);
    };

    const timeoutId = setTimeout(cleanup, INTERACTION_TIMEOUT);
    activeInteractions.set(interactionId, { cleanup, timestamp: Date.now() });

    try {
        const result = await callback();
        return { handled: true, result };
    } catch (error) {
        logInteraction(interaction, `Error in interaction handler: ${error.message}`, true);
        return { handled: false, error };
    } finally {
        cleanup();
    }
}

async function handleButtonInteraction(interaction, state, replyManager) {
    const buttonId = interaction.customId;
    
    if (isButtonOnCooldown(interaction)) {
        logInteraction(interaction, `Button ${buttonId} is on cooldown, skipping...`);
        return false;
    }

    logInteraction(interaction, `Processing button: ${buttonId}`);
    
    try {
        let shouldUpdate = false;
        
        switch (buttonId) {
            case 'ticket_wizard_start':
                state.step = STEPS.CHANNELS;
                shouldUpdate = true;
                break;
                
            case 'ticket_wizard_next':
                state.step = getNextStep(state.step);
                shouldUpdate = true;
                break;
                
            case 'ticket_wizard_prev':
                state.step = getPreviousStep(state.step);
                shouldUpdate = true;
                break;
                
            case 'ticket_wizard_confirm':
                await handleConfirmation(interaction, state, replyManager);
                return false;
                
            case 'wizard_add_type':
                await interaction.showModal(createTicketTypeModal())
                    .catch(error => logInteraction(interaction, `Failed to show type modal: ${error.message}`, true));
                return false;
                
            case 'wizard_quick_setup':
                state.types = [...DEFAULT_TICKET_TYPES];
                logInteraction(interaction, 'Applied quick setup with default ticket types');
                shouldUpdate = true;
                break;
                
            case 'wizard_toggle_mode':
                state.threadMode = !state.threadMode;
                logInteraction(interaction, `Toggled thread mode to: ${state.threadMode}`);
                shouldUpdate = true;
                break;
                
            case 'wizard_set_role':
                await interaction.showModal(createRoleModal(state.requiredRoleId))
                    .catch(error => logInteraction(interaction, `Failed to show role modal: ${error.message}`, true));
                return false;
                
            case 'wizard_set_format':
                await interaction.showModal(createNamingModal(state.namingFormat))
                    .catch(error => logInteraction(interaction, `Failed to show format modal: ${error.message}`, true));
                return false;
                
            case 'wizard_set_panel':
                await interaction.showModal(createPanelCustomizationModal(state))
                    .catch(error => logInteraction(interaction, `Failed to show panel modal: ${error.message}`, true));
                return false;
                
            case 'wizard_set_limits':
                await interaction.showModal(createLimitsModal(state.maxTicketsPerUser))
                    .catch(error => logInteraction(interaction, `Failed to show limits modal: ${error.message}`, true));
                return false;
                
            default:
                logInteraction(interaction, `Unknown button ID: ${buttonId}`, true);
                return false;
        }
        
        if (shouldUpdate) {
            wizardState.set(interaction, state);
            return true;
        }
        
        return false;
        
    } catch (error) {
        logInteraction(interaction, `Error in button handler: ${error.message}`, true);
        throw error;
    }
}

async function handleSelectMenuInteraction(interaction, state, replyManager) {
    logInteraction(interaction, `Processing select menu: ${interaction.customId}`);
    
    try {
        if (interaction.customId === 'wizard_remove_type') {
            const valueToRemove = interaction.values[0];
            state.types = state.types.filter(type => type.value !== valueToRemove);
            logInteraction(interaction, `Removed ticket type: ${valueToRemove}`);
            return true;
        }
        
        return false;
    } catch (error) {
        logInteraction(interaction, `Error in select menu handler: ${error.message}`, true);
        throw error;
    }
}

async function handleChannelSelectInteraction(interaction, state, replyManager) {
    try {
        const channelId = interaction.values?.[0];
        if (!channelId) return false;

        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            logInteraction(interaction, `Channel not found: ${channelId}`, true);
            return false;
        }

        logInteraction(interaction, `Setting channel for ${interaction.customId}: ${channel.name} (${channel.id})`);

        switch (interaction.customId) {
            case 'wizard_select_panel_channel':
                state.channelId = channelId;
                break;
                
            case 'wizard_select_category':
                state.categoryId = channelId;
                break;
                
            case 'wizard_select_log_channel':
                state.logChannelId = channelId;
                break;
        }

        return true;
    } catch (error) {
        logInteraction(interaction, `Error in channel select handler: ${error.message}`, true);
        throw error;
    }
}

async function handleConfirmation(interaction, state, replyManager) {
    const validation = validateState(state);
    
    if (!validation.isValid) {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚠️ Configuration Incomplete')
                    .setDescription(`Please fix the following issues:\n${validation.errors.map(e => `• ${e}`).join('\n')}`)
            ],
            components: []
        });
        return;
    }

    try {
        // Save to database
        await saveTicketSystem(state);
        
        // Create the ticket panel
        const panelMessageId = await createTicketPanel(state, interaction);
        
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Success!')
                    .setDescription(`Ticket system ${state.isEditing ? 'updated' : 'created'} successfully!`)
                    .addFields(
                        { name: '📋 Panel Channel', value: `<#${state.channelId}>`, inline: true },
                        { name: '📁 Category/Mode', value: state.threadMode ? 'Threads' : `<#${state.categoryId}>`, inline: true },
                        { name: '🎫 Types', value: `${state.types.length} configured`, inline: true },
                        { name: '📨 Panel Message', value: panelMessageId ? `[View Panel](https://discord.com/channels/${state.guildId}/${state.channelId}/${panelMessageId})` : 'Created', inline: false }
                    )
            ],
            components: []
        });
        
        wizardState.delete(interaction);
        
    } catch (error) {
        logInteraction(interaction, `Error saving ticket system: ${error.message}`, true);
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Save Failed')
                    .setDescription(`Failed to save the ticket system: ${error.message}`)
            ],
            components: []
        });
    }
}

export async function handleTicketWizardComponent(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    if (interaction.replied || interaction.deferred) {
        logInteraction(interaction, 'Interaction already handled, skipping');
        return;
    }
    
    const { handled, error } = await withInteractionLock(interaction, async () => {
        const state = wizardState.get(interaction);
        if (!state) {
            if (!interaction.replied && !interaction.deferred) {
                await replyManager.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#ff9900')
                            .setTitle('⚠️ Session Expired')
                            .setDescription('This wizard session has expired. Please start a new one with `/ticket setup`.')
                    ],
                    ephemeral: true
                });
            }
            return;
        }

        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferUpdate();
            }
        } catch (error) {
            if (error.code === 10062) {
                logInteraction(interaction, 'Interaction expired, skipping...');
                return;
            }
            throw error;
        }

        let shouldUpdate = false;
        
        if (interaction.isButton()) {
            shouldUpdate = await handleButtonInteraction(interaction, state, replyManager);
        } else if (interaction.isStringSelectMenu()) {
            shouldUpdate = await handleSelectMenuInteraction(interaction, state, replyManager);
        } else if (interaction.isChannelSelectMenu()) {
            shouldUpdate = await handleChannelSelectInteraction(interaction, state, replyManager);
        }

        if (shouldUpdate) {
            wizardState.set(interaction, state);
            
            const embed = state.step === STEPS.WELCOME 
                ? buildWelcomeEmbed() 
                : buildStepEmbed(state.step, state);
                
            const components = state.step === STEPS.WELCOME
                ? buildWelcomeComponents()
                : buildStepComponents(state.step, state);
            
            try {
                await interaction.editReply({
                    embeds: [embed],
                    components,
                    ephemeral: true
                });
            } catch (error) {
                if (error.code !== 40060) {
                    logInteraction(interaction, `Error updating message: ${error.message}`, true);
                }
            }
        }
        
        return { success: true };
    });

    if (!handled && error) {
        logInteraction(interaction, `Unhandled error in ticket wizard: ${error.message}`, true);
        
        if (!interaction.replied && !interaction.deferred && error.code !== 10062) {
            try {
                await replyManager.send({
                    content: 'An unexpected error occurred. Please try again.',
                    ephemeral: true
                });
            } catch (sendError) {
                logInteraction(interaction, `Error sending error message: ${sendError.message}`, true);
            }
        }
    }
}

export async function handleTicketWizardModal(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        const state = wizardState.get(interaction);
        if (!state) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('⚠️ Session Expired')
                        .setDescription('This wizard session has expired. Please start a new one.')
                ]
            });
        }

        await replyManager.defer({ ephemeral: true });

        switch (interaction.customId) {
            case 'wizard_type_modal':
                const typeName = interaction.fields.getTextInputValue('type_name');
                const typeEmoji = interaction.fields.getTextInputValue('type_emoji') || '🎫';
                const typeDescription = interaction.fields.getTextInputValue('type_description') || '';
                
                if (state.types.length >= 25) {
                    return await replyManager.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#ff9900')
                                .setTitle('⚠️ Limit Reached')
                                .setDescription('Maximum 25 ticket types allowed.')
                        ]
                    });
                }
                
                state.types.push({
                    label: typeName,
                    value: typeName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    emoji: typeEmoji,
                    description: typeDescription
                });
                break;
                
            case 'wizard_naming_modal':
                state.namingFormat = interaction.fields.getTextInputValue('naming_format');
                break;
                
            case 'wizard_role_modal':
                const roleId = interaction.fields.getTextInputValue('required_role_id');
                state.requiredRoleId = roleId || null;
                break;
                
            case 'wizard_panel_modal':
                state.panelTitle = interaction.fields.getTextInputValue('panel_title');
                state.panelDescription = interaction.fields.getTextInputValue('panel_description');
                break;
                
            case 'wizard_limits_modal':
                const maxTickets = parseInt(interaction.fields.getTextInputValue('max_tickets')) || 1;
                state.maxTicketsPerUser = Math.max(0, Math.min(10, maxTickets));
                break;
        }

        wizardState.set(interaction, state);

        const embed = buildStepEmbed(state.step, state);
        const components = buildStepComponents(state.step, state);
        
        await replyManager.send({
            embeds: [embed],
            components,
            ephemeral: true
        });

    } catch (error) {
        logInteraction(interaction, `Error in handleTicketWizardModal: ${error.message}`, true);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('Failed to process the form. Please try again.')
            ],
            ephemeral: true
        });
    }
}

// Ticket creation handler
export async function handleTicketCreation(interaction) {
    const replyManager = new ReplyManager(interaction);
    
    try {
        // Check if this interaction has already been handled
        const interactionKey = `ticket_create_${interaction.message?.id}_${interaction.user.id}`;
        if (activeInteractions.has(interactionKey)) {
            return; // Skip if already processing this interaction
        }
        activeInteractions.set(interactionKey, true);

        const ticketType = interaction.customId.replace('ticket_button_', '');
        
        // Get ticket system configuration
        const config = await get('SELECT * FROM ticket_systems WHERE guild_id = ?', [interaction.guildId]);
        
        if (!config) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ System Not Found')
                        .setDescription('Ticket system is not configured properly.')
                ],
                ephemeral: true
            });
        }

        // Check if user has required role
        if (config.required_role_id) {
            if (!interaction.member.roles.cache.has(config.required_role_id)) {
                return await replyManager.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#ff9900')
                            .setTitle('❌ Permission Required')
                            .setDescription(`You need the <@&${config.required_role_id}> role to create tickets.`)
                    ],
                    ephemeral: true
                });
            }
        }

        // Check user ticket limit
        if (config.max_tickets_per_user > 0) {
            const userTickets = await get(
                'SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND user_id = ? AND status != "closed"',
                [interaction.guildId, interaction.user.id]
            );

            if (userTickets && userTickets.count >= config.max_tickets_per_user) {
                return await replyManager.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#ff9900')
                            .setTitle('❌ Ticket Limit Reached')
                            .setDescription(`You can only have ${config.max_tickets_per_user} open ticket(s) at a time.`)
                    ],
                    ephemeral: true
                });
            }
        }

        await replyManager.defer({ ephemeral: true });

        // Parse ticket types
        const types = JSON.parse(config.types || '[]');
        const selectedType = types.find(t => t.value === ticketType);

        if (!selectedType) {
            return await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Invalid Ticket Type')
                        .setDescription('The selected ticket type is no longer available.')
                ]
            });
        }

        // Generate ticket number
        const ticketCount = await get('SELECT COUNT(*) as count FROM tickets WHERE guild_id = ?', [interaction.guildId]);
        const ticketNumber = (ticketCount?.count || 0) + 1;

        // Generate ticket name
        const ticketName = config.naming_format
            .replace('{type}', selectedType.value)
            .replace('{user}', interaction.user.username)
            .replace('{number}', ticketNumber.toString());

        let ticketChannel;
        
        if (config.thread_mode) {
            // Create thread in panel channel
            const panelChannel = await interaction.guild.channels.fetch(config.channel_id);
            ticketChannel = await panelChannel.threads.create({
                name: ticketName,
                type: 1, // GUILD_PUBLIC_THREAD
                reason: `Ticket created by ${interaction.user.tag}`
            });
        } else {
            // Create channel in category
            ticketChannel = await interaction.guild.channels.create({
                name: ticketName,
                type: ChannelType.GuildText,
                parent: config.category_id,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    },
                    {
                        id: interaction.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    }
                ],
                reason: `Ticket created by ${interaction.user.tag}`
            });
        }

        // Save ticket to database
        await run(
            'INSERT INTO tickets (guild_id, channel_id, user_id, type, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [interaction.guildId, ticketChannel.id, interaction.user.id, ticketType, 'open', new Date().toISOString()]
        );

        // Create initial ticket message
        const ticketEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎫 ${selectedType.label} Ticket`)
            .setDescription(`Hello ${interaction.user}, welcome to your ticket!\n\n**Ticket Type:** ${selectedType.description || selectedType.label}`)
            .addFields(
                { name: '📝 Instructions', value: 'Please describe your issue or request in detail. A staff member will assist you shortly.' },
                { name: '🔒 Close Ticket', value: 'Click the button below when your issue is resolved.' }
            )
            .setFooter({ text: `Ticket #${ticketNumber} • Created` })
            .setTimestamp();

        const ticketControls = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_close_${ticketChannel.id}`)
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        await ticketChannel.send({
            content: `${interaction.user}`,
            embeds: [ticketEmbed],
            components: [ticketControls]
        });

        // Log if configured
        if (config.log_channel_id) {
            try {
                const logChannel = await interaction.guild.channels.fetch(config.log_channel_id);
                const logEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('🎫 Ticket Created')
                    .addFields(
                        { name: 'User', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                        { name: 'Type', value: selectedType.label, inline: true },
                        { name: 'Channel', value: `${ticketChannel}`, inline: true }
                    )
                    .setTimestamp();
                
                await logChannel.send({ embeds: [logEmbed] });
            } catch (error) {
                logInteraction(interaction, `Error logging ticket creation: ${error.message}`, true);
            }
        }

        // Respond to user
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Ticket Created')
                    .setDescription(`Your ticket has been created: ${ticketChannel}`)
            ]
        });

    } catch (error) {
        logInteraction(interaction, `Error creating ticket: ${error.message}`, true);
        await replyManager.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Creation Failed')
                    .setDescription('Failed to create your ticket. Please try again or contact an administrator.')
            ]
        });
    } finally {
        // Clean up the interaction key after a delay
        const interactionKey = `ticket_create_${interaction.message?.id}_${interaction.user.id}`;
        setTimeout(() => activeInteractions.delete(interactionKey), 5000);
    }
}

// Export all handlers
export {
    handleTicketWizard as ticketWizardHandler,
    handleTicketWizardComponent as ticketWizardComponentHandler,
    handleTicketWizardModal as ticketWizardModalHandler,
    handleTicketCreation as ticketCreationHandler
};