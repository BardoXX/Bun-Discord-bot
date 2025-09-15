// events/interactionCreate.js - Enhanced with better button handling
import { 
    Events, 
    EmbedBuilder, 
    ButtonBuilder, 
    ActionRowBuilder, 
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { handleEconomyWizardComponent } from '../commands/configuratie/economyWizard.js';
import { handleWelcomeWizardComponent } from '../commands/configuratie/welcomeWizard.js';
import { handleBirthdayWizardComponent } from '../commands/configuratie/birthdayWizard.js';
import { handleAIWizardComponent } from '../commands/configuratie/aiwizard.js';
import { handleTicketWizardComponent } from '../commands/configuratie/ticketWizard.js';
import { handleWorkSelectMenu, handleWorkCooldownInteraction } from '../commands/economie/work.js';
import { handleShopInteraction, handleShopSelectMenu, handleShopButton } from '../commands/economie/shop.js';
import ticketButtonHandler from '../modules/tickets/ticketButtonHandler.js';
import ReplyManager from '../modules/utils/replyManager.js';
import { handleRobSettingsModal } from '../commands/configuratie/economyWizard.js';

// Button Factory for consistent button creation
class ButtonFactory {
    static createButton(customId, label, style = ButtonStyle.Primary, emoji = null, disabled = false) {
        if (customId.length > 100) {
            throw new Error(`Button customId too long: ${customId} (${customId.length}/100)`);
        }
        
        const button = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(style)
            .setDisabled(disabled);
            
        if (emoji) {
            button.setEmoji(emoji);
        }
        
        return button;
    }

    static createActionRow(components) {
        return new ActionRowBuilder().addComponents(components);
    }

    static disableButtons(components) {
        return components.map(row => {
            const newRow = new ActionRowBuilder();
            newRow.addComponents(
                row.components.map(component => 
                    ButtonBuilder.from(component).setDisabled(true)
                )
            );
            return newRow;
        });
    }
}

// Button interaction handler mapping
const BUTTON_HANDLERS = {
    // Wizard buttons
    wizard: {
        prefix: 'wizard_',
        handler: handleTicketWizardComponent,
        subHandlers: {
            'set_panel': handleTicketWizardComponent,
            'set_role': handleTicketWizardComponent,
            'toggle_mode': handleTicketWizardComponent,
            'set_format': handleTicketWizardComponent,
            'set_limits': handleTicketWizardComponent,
            'quick_setup': handleTicketWizardComponent,
            'add_type': handleTicketWizardComponent,
            'next': handleTicketWizardComponent,
            'back': handleTicketWizardComponent,
            'finish': handleTicketWizardComponent,
            'cancel': handleTicketWizardComponent,
            'ticket_button_other': handleTicketWizardComponent,
            'ticket_button_close': handleTicketWizardComponent,
            'ticket_button_claim': handleTicketWizardComponent,
            'ticket_button_delete': handleTicketWizardComponent,
        }
    },
    ticket_wizard: {
        prefix: 'ticket_wizard_',
        handler: handleTicketWizardComponent
    },
    ticket: {
        prefix: 'ticket_',
        handler: async (interaction) => {
            const replyManager = new ReplyManager(interaction);
            return await ticketButtonHandler.handleTicketButtonInteraction(
                interaction, 
                replyManager, 
                interaction.client.db
            );
        }
    },
    welcome_wizard: {
        prefix: 'welcome_wizard_',
        handler: handleWelcomeWizardComponent
    },
    economy_wizard: {
        prefix: 'economy_wizard_',
        handler: async (interaction) => {
            try {
                const { handleEconomyWizardComponent } = await import('../commands/configuratie/economyWizard.js');
                await handleEconomyWizardComponent(interaction);
            } catch (error) {
                console.error('Error in economy wizard handler:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'Er is een fout opgetreden bij het verwerken van deze actie.', 
                        ephemeral: true 
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({ 
                        content: 'Er is een fout opgetreden bij het verwerken van deze actie.',
                        components: []
                    });
                }
            }
        },
        subHandlers: {
            'start': async (interaction) => {
                const { handleEconomyWizardComponent } = await import('../commands/configuratie/economyWizard.js');
                return handleEconomyWizardComponent(interaction);
            },
            'cancel': async (interaction) => {
                const { handleEconomyWizardComponent } = await import('../commands/configuratie/economyWizard.js');
                return handleEconomyWizardComponent(interaction);
            },
            'menu_main': async (interaction) => {
                const { handleEconomyWizardComponent } = await import('../commands/configuratie/economyWizard.js');
                return handleEconomyWizardComponent(interaction);
            },
            'menu_rob': async (interaction) => {
                const { handleEconomyWizardComponent } = await import('../commands/configuratie/economyWizard.js');
                return handleEconomyWizardComponent(interaction);
            },
            'toggle_rob': async (interaction) => {
                const { handleEconomyWizardComponent } = await import('../commands/configuratie/economyWizard.js');
                return handleEconomyWizardComponent(interaction);
            },
            'back': async (interaction) => {
                const { handleEconomyWizardComponent } = await import('../commands/configuratie/economyWizard.js');
                return handleEconomyWizardComponent(interaction);
            },
            'next': async (interaction) => {
                const { handleEconomyWizardComponent } = await import('../commands/configuratie/economyWizard.js');
                return handleEconomyWizardComponent(interaction);
            },
            'finish': async (interaction) => {
                const { handleEconomyWizardComponent } = await import('../commands/configuratie/economyWizard.js');
                return handleEconomyWizardComponent(interaction);
            }
        }
    },
    ai_wizard: {
        prefix: 'ai_wizard_',
        handler: handleAIWizardComponent
    },
    shop: {
        prefix: 'shop_',
        handler: handleShopButton
    },
    work: {
        prefix: 'work_',
        subHandlers: {
            'cd_': handleWorkCooldownInteraction,
            'select': handleWorkSelectMenu
        }
    },
    birthday_wizard: {
        prefix: 'birthday_wizard_',
        handler: handleBirthdayWizardComponent
    },
};

// Enhanced tracking system
const processingInteractions = new Map();
const interactionStats = {
    total: 0,
    duplicates: 0,
    processed: 0,
    errors: 0,
    commands: 0
};

// Log stats every 60 seconds
setInterval(() => {
    if (interactionStats.total > 0) {
        console.log(`\n📊 Interaction Stats (last 60s):`);
        console.log(`  Total received: ${interactionStats.total}`);
        console.log(`  Commands: ${interactionStats.commands}`);
        console.log(`  Components processed: ${interactionStats.processed}`);
        console.log(`  Duplicates blocked: ${interactionStats.duplicates}`);
        console.log(`  Errors: ${interactionStats.errors}`);
        console.log(`  Currently processing: ${processingInteractions.size}\n`);
        
        // Reset stats
        Object.keys(interactionStats).forEach(key => interactionStats[key] = 0);
    }
}, 60000);

// Cleanup stuck interactions
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, data] of processingInteractions.entries()) {
        if (now - data.startTime > 30000) { // 30 seconds timeout
            processingInteractions.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} stuck interactions`);
    }
}, 30000);

// Helper function to get interaction type name
function getInteractionTypeName(type) {
    const types = {
        1: 'PING',
        2: 'APPLICATION_COMMAND',
        3: 'MESSAGE_COMPONENT',
        4: 'APPLICATION_COMMAND_AUTOCOMPLETE',
        5: 'MODAL_SUBMIT'
    };
    return types[type] || 'UNKNOWN';
}

export default {
    name: Events.InteractionCreate,
    once: false,
    
    async execute(interaction) {
        const startTime = Date.now();
        interactionStats.total++;
        
        try {
            // Handle slash commands first
            if (interaction.isCommand()) {
                await this.handleSlashCommand(interaction);
                return;
            }
            
            // Handle component interactions (buttons, select menus, modals)
            if (interaction.isButton() || interaction.isStringSelectMenu() || 
                interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu() ||
                interaction.isUserSelectMenu() || interaction.isModalSubmit()) {
                await this.handleComponentInteraction(interaction, startTime);
                return;
            }
            
            // Handle autocomplete
            if (interaction.isAutocomplete()) {
                await this.handleAutocomplete(interaction);
                return;
            }
            
            console.log(`❓ Unhandled interaction type: ${getInteractionTypeName(interaction.type)}`);
            
        } catch (error) {
            console.error(`Error handling interaction (${interaction.id}):`, error);
            interactionStats.errors++;
            await this.handleInteractionError(interaction, error);
        }
    },
    
    // Handle slash commands
    async handleSlashCommand(interaction) {
        const command = interaction.client.commands.get(interaction.commandName);
        
        if (!command) {
            console.error(`❌ No command matching ${interaction.commandName} was found.`);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('❌ Command Not Found')
                            .setDescription('This command is not available or has been disabled.')
                    ],
                    ephemeral: true
                });
            }
            return;
        }
        
        try {
            console.log(`⚡ Executing command: /${interaction.commandName}`);
            const startTime = Date.now();
            
            await command.execute(interaction);
            
            const duration = Date.now() - startTime;
            console.log(`✅ Command /${interaction.commandName} executed in ${duration}ms`);
            interactionStats.commands++;
            
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            interactionStats.errors++;
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Command Error')
                .setDescription('There was an error while executing this command.')
                .setTimestamp();
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        }
    },
    
    // Handle autocomplete interactions
    async handleAutocomplete(interaction) {
        const command = interaction.client.commands.get(interaction.commandName);
        
        if (!command || !command.autocomplete) {
            return;
        }
        
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(`Error in autocomplete for ${interaction.commandName}:`, error);
        }
    },
    
    // Handle component interactions with duplicate protection
    async handleComponentInteraction(interaction, startTime) {
        const { customId } = interaction;
        const interactionKey = `${interaction.id}:${interaction.user.id}`;
        
        // Check for duplicate processing
        if (processingInteractions.has(interactionKey)) {
            console.log(`⚠️ Duplicate interaction ${interaction.id} detected, skipping`);
            interactionStats.duplicates++;
            return;
        }
        
        // Mark as processing
        processingInteractions.set(interactionKey, {
            startTime: Date.now(),
            type: this.getComponentType(interaction),
            customId
        });
        
        try {
            console.log(`🔄 Handling ${this.getComponentType(interaction)}: ${customId}`);
            
            // Route to appropriate handler based on customId
            if (interaction.isButton()) {
                await this.handleButtonInteraction(interaction, customId);
            } else if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || 
                      interaction.isRoleSelectMenu() || interaction.isUserSelectMenu()) {
                await this.handleSelectMenuInteraction(interaction);
            } else if (interaction.isModalSubmit()) {
                const handled = await handleRobSettingsModal(interaction, interaction.client.db);
                if (handled) return;
                await this.handleModalSubmit(interaction);
            }
            
            const duration = Date.now() - startTime;
            console.log(`✅ Component interaction handled in ${duration}ms`);
            interactionStats.processed++;
            
        } catch (error) {
            console.error('Error in handleComponentInteraction:', error);
            interactionStats.errors++;
            await this.handleInteractionError(interaction, error);
        } finally {
            // Always clean up processing tracking
            processingInteractions.delete(interactionKey);
        }
    },
    
    // Get component type for logging
    getComponentType(interaction) {
        if (interaction.isButton()) return 'Button';
        if (interaction.isStringSelectMenu()) return 'StringSelect';
        if (interaction.isChannelSelectMenu()) return 'ChannelSelect';
        if (interaction.isRoleSelectMenu()) return 'RoleSelect';
        if (interaction.isUserSelectMenu()) return 'UserSelect';
        if (interaction.isModalSubmit()) return 'Modal';
        return 'Unknown';
    },
    
    // Handle button interactions
    async handleButtonInteraction(interaction, customId) {
        const log = (message, data) => {
            const timestamp = new Date().toISOString();
            if (data !== undefined) {
                console.log(`[${timestamp}] ${message}`, data);
            } else {
                console.log(`[${timestamp}] ${message}`);
            }
        };

        log('='.repeat(80));
        log(`[Button] Handling button: "${customId}"`);
        log(`[Button] Available handler keys:`, Object.keys(BUTTON_HANDLERS));
        
        try {
            // Handle back to main menu button
            if (customId === 'eco_back_to_main') {
                const { EconomyWizard } = await import('../commands/configuratie/economyWizard.js');
                const wizard = new EconomyWizard(interaction.client.db);
                return await wizard.handleEconomyWizard(interaction);
            }
            
            // Handle economy wizard pagination
            if (customId.startsWith('eco_page_')) {
                const page = parseInt(customId.split('_')[2]);
                if (!isNaN(page)) {
                    const { EconomyWizard } = await import('../commands/configuratie/economyWizard.js');
                    const wizard = new EconomyWizard(interaction.client.db);
                    return await wizard.handleEconomyWizard(interaction, page);
                }
            }
            
            let handlerFound = false;
            
            // Find the appropriate handler for this button
            for (const [handlerName, config] of Object.entries(BUTTON_HANDLERS)) {
                log(`[Button] Checking handler: ${handlerName} (prefix: ${config.prefix})`);
                
                if (customId.startsWith(config.prefix)) {
                    log(`[Button] PREFIX MATCHED: ${handlerName}`);
                    
                    // Remove the prefix for sub-handler matching
                    const buttonAction = customId.replace(config.prefix, '');
                    log(`[Button] Action after prefix removal: "${buttonAction}"`);
                    
                    // Check for sub-handlers first
                    if (config.subHandlers) {
                        log(`[Button] Checking ${Object.keys(config.subHandlers).length} sub-handlers...`);
                        
                        for (const [subKey, handler] of Object.entries(config.subHandlers)) {
                            log(`[Button]   • Checking sub-handler: "${subKey}"`);
                            
                            if (buttonAction === subKey || buttonAction.startsWith(subKey + '_')) {
                                log(`[Button]   ✓ USING SUB-HANDLER: ${subKey}`);
                                try {
                                    await handler(interaction);
                                    handlerFound = true;
                                    log(`[Button] ✓ Successfully executed sub-handler: ${handlerName}.${subKey}`);
                                } catch (error) {
                                    log(`[Button] ERROR in sub-handler ${handlerName}.${subKey}:`, error);
                                    throw error;
                                }
                                break;
                            }
                        }
                    }
                    
                    // If no sub-handler matched, use the main handler
                    if (!handlerFound && config.handler) {
                        log(`[Button] No matching sub-handler, using main handler: ${handlerName}`);
                        try {
                            await config.handler(interaction);
                            handlerFound = true;
                            log(`[Button] ✓ Successfully executed main handler: ${handlerName}`);
                        } catch (error) {
                            log(`[Button] ERROR in main handler ${handlerName}:`, error);
                            throw error;
                        }
                    }
                    
                    if (handlerFound) {
                        log(`[Button] Successfully handled button "${customId}"`);
                        log('='.repeat(80));
                        return;
                    }
                } else {
                    log(`[Button] Prefix does not match for handler: ${handlerName}`);
                }
            }

            if (!handlerFound) {
                log(`[Button] WARNING: No handler found for button: "${customId}"`);
                log(`[Button] Available prefixes:`, Object.entries(BUTTON_HANDLERS).map(([name, h]) => `${name}: "${h.prefix}"`));
                await this.sendUnknownInteractionError(interaction);
                log('='.repeat(80));
            }
        } catch (error) {
            log(`[Button] UNHANDLED ERROR for button "${customId}":`, error);
            await this.handleInteractionError(interaction, error);
            log('='.repeat(80));
        }
    },
    
    // Handle select menu interactions
    async handleSelectMenuInteraction(interaction) {
        const { customId } = interaction;
        const startTime = Date.now();

        try {
            console.log(`🔄 Handling StringSelect: ${customId}`);
            
            // Handle economy wizard select menu
            if (customId === 'eco_category_select') {
                const [selectedValue] = interaction.values;
                console.log(`📝 Select menu: ${customId} - Selected: ${selectedValue}`);
                
                const wizard = new (await import('../commands/configuratie/economyWizard.js')).EconomyWizard(interaction.client.db);
                
                // Handle different menu selections
                switch(selectedValue) {
                    case 'eco_work_menu':
                        // Handle work menu
                        await wizard.showWorkMenu(interaction);
                        break;
                    case 'eco_currency_menu':
                        // Handle currency menu
                        await wizard.showCurrencyMenu(interaction);
                        break;
                    case 'eco_bank_menu':
                        // Handle bank menu
                        await wizard.showBankMenu(interaction);
                        break;
                    case 'eco_shop_menu':
                        // Handle shop menu
                        await wizard.showShopMenu(interaction);
                        break;
                    case 'eco_robbery_menu':
                        // Handle robbery menu
                        await wizard.showRobberyMenu(interaction);
                        break;
                    // Add more cases for other menu options
                    default:
                        console.log(`❓ Unknown selection: ${selectedValue}`);
                        await interaction.reply({ 
                            content: 'Deze optie is nog niet beschikbaar.', 
                            ephemeral: true 
                        });
                }
                return;
            }
            
            // Ticket wizard select menus
            if (customId.startsWith('wizard_') || customId.startsWith('ticket_wizard_')) {
                return await handleTicketWizardComponent(interaction);
            }
            
            // Economy wizard select menus
            if (customId.startsWith('economy_wizard_')) {
                return await handleEconomyWizardComponent(interaction);
            }
            
            // Welcome wizard select menus
            if (customId.startsWith('welcome_wizard_')) {
                return await handleWelcomeWizardComponent(interaction);
            }
            
            // Birthday wizard select menus
            if (customId.startsWith('birthday_wizard_')) {
                return await handleBirthdayWizardComponent(interaction);
            }
            
            // AI wizard select menus
            if (customId.startsWith('ai_wizard_')) {
                return await handleAIWizardComponent(interaction);
            }
            
            // Shop select menus
            if (customId.startsWith('shop_')) {
                return await handleShopSelectMenu(interaction);
            }
            
            // Work select menus
            if (customId.startsWith('work_')) {
                return await handleWorkSelectMenu(interaction);
            }
            
            // Handle unknown select menus
            console.log(`❓ Unknown select menu: ${customId}`);
            await this.sendUnknownInteractionError(interaction);
        } catch (error) {
            console.error('Error in handleSelectMenuInteraction:', error);
            interactionStats.errors++;
            await this.handleInteractionError(interaction, error);
        }
    },
    
    // Handle modal submissions
    async handleModalSubmit(interaction) {
        const { customId } = interaction;
        
        console.log(`📝 Modal submitted: ${customId}`);
        
        // Ticket wizard modals
        if (customId.startsWith('ticket_') || customId.startsWith('wizard_')) {
            return await handleTicketWizardComponent(interaction);
        }
        
        // Economy wizard modals
        if (customId.startsWith('economy_wizard_') || 
            customId === 'rob_settings_modal' || 
            customId === 'quick_setup_modal') {
            try {
                const { EconomyWizard } = await import('../commands/configuratie/economyWizard.js');
                const wizard = new EconomyWizard(interaction.client.db);
                return await wizard.handleEconomyWizardComponent(interaction);
            } catch (error) {
                console.error('Error handling economy wizard modal:', error);
                return await interaction.reply({ 
                    content: 'Er is een fout opgetreden bij het verwerken van dit formulier.', 
                    ephemeral: true 
                });
            }
        }
        
        // Welcome wizard modals
        if (customId.startsWith('welcome_wizard_')) {
            return await handleWelcomeWizardComponent(interaction);
        }
        
        // Birthday wizard modals
        if (customId.startsWith('birthday_wizard_')) {
            return await handleBirthdayWizardComponent(interaction);
        }
        
        // AI wizard modals
        if (customId.startsWith('ai_wizard_')) {
            return await handleAIWizardComponent(interaction);
        }
        
        // Handle unknown modals
        console.log(`❓ Unknown modal: ${customId}`);
        await this.sendUnknownInteractionError(interaction);
    },
    
    // Send unknown interaction error
    async sendUnknownInteractionError(interaction) {
        if (interaction.replied || interaction.deferred) {
            console.log(`⚠️ Cannot send unknown error - interaction already handled`);
            return;
        }

        try {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('❓ Unknown Interaction')
                .setDescription('This interaction is not recognized or may have expired. Please try again.')
                .setFooter({ text: `Interaction ID: ${interaction.id}` })
                .setTimestamp();
            
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            console.log(`📨 Sent unknown interaction error to user`);
        } catch (error) {
            console.error('❌ Failed to send unknown interaction error:', error);
        }
    },
    
    // Handle interaction errors with better error classification
    async handleInteractionError(interaction, error) {
        console.log(`🚨 Handling interaction error:`);
        console.log(`   Error Code: ${error.code || 'N/A'}`);
        console.log(`   Error Message: ${error.message}`);
        console.log(`   Interaction Type: ${getInteractionTypeName(interaction.type)}`);
        console.log(`   Custom ID: ${interaction.customId || 'N/A'}`);
        
        // Handle specific Discord API errors
        if (error.code === 10062) {
            console.log('⚠️ Interaction expired - this is normal for old interactions');
            return;
        }

        if (error.code === 40060) {
            console.log('⚠️ Interaction already acknowledged');
            return;
        }
        
        if (error.code === 50013) {
            console.log('⚠️ Missing permissions to respond to interaction');
            return;
        }
        
        if (error.code === 10008) {
            console.log('⚠️ Message was deleted before interaction could be processed');
            return;
        }

        // Try to send error message to user if possible
        if (!interaction.replied && !interaction.deferred) {
            try {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('An unexpected error occurred while processing your request.')
                    .setFooter({ text: `Error ID: ${interaction.id}` })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                console.log(`📨 Sent error message to user`);
            } catch (replyError) {
                console.error('❌ Failed to send error reply:', replyError);
            }
        } else if (interaction.deferred && !interaction.replied) {
            try {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('An unexpected error occurred while processing your request.')
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [errorEmbed] });
                console.log(`📨 Edited deferred interaction with error message`);
            } catch (editError) {
                console.error('❌ Failed to edit error reply:', editError);
            }
        }
    },
    
    // Export the ButtonFactory for use in other files
    ButtonFactory
};