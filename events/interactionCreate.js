// events/interactionCreate.js - With enhanced debugging
import { Events, EmbedBuilder } from 'discord.js';
import { handleTicketWizardComponent } from '../commands/configuratie/ticketWizard.js';
import { handleEconomyWizardComponent } from '../commands/configuratie/economyWizard.js';
import { handleWelcomeWizardComponent } from '../commands/configuratie/welcomeWizard.js';
import { handleBirthdayWizardComponent } from '../commands/configuratie/birthdayWizard.js';
import { handleAIWizardComponent } from '../commands/configuratie/aiwizard.js';
import { handleWorkSelectMenu, handleWorkCooldownInteraction } from '../commands/economie/work.js';
import { createTicket, claimTicket, closeTicket } from '../commands/utils/ticketSystem.js';
import { handleShopInteraction, handleShopSelectMenu, handleShopButton } from '../commands/economie/shop.js';
import { handleTicketButtonInteraction, handleTicketFormSubmit } from '../modules/tickets/ticketButtonHandler.js';

// Enhanced tracking system
const processingInteractions = new Map();
const interactionStats = {
    total: 0,
    duplicates: 0,
    processed: 0,
    errors: 0
};

// Log stats every 60 seconds
setInterval(() => {
    if (interactionStats.total > 0) {
        console.log(`\n📊 Interaction Stats (last 60s):`);
        console.log(`  Total received: ${interactionStats.total}`);
        console.log(`  Successfully processed: ${interactionStats.processed}`);
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

export default {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction) {
        const startTime = Date.now();
        const interactionKey = interaction.id;
        
        // Increment total counter
        interactionStats.total++;
        
        console.log(`\n🎛️ [${new Date().toISOString()}] Interaction received:`);
        console.log(`   ID: ${interaction.id}`);
        console.log(`   Type: ${interaction.type} (${getInteractionTypeName(interaction.type)})`);
        console.log(`   User: ${interaction.user.tag} (${interaction.user.id})`);
        console.log(`   Guild: ${interaction.guild?.name || 'DM'}`);
        console.log(`   Custom ID: ${interaction.customId || 'N/A'}`);
        console.log(`   Command: ${interaction.commandName || 'N/A'}`);
        
        // Check for duplicate processing
        if (processingInteractions.has(interactionKey)) {
            interactionStats.duplicates++;
            console.log(`⚠️ DUPLICATE INTERACTION BLOCKED: ${interactionKey}`);
            console.log(`   Original started: ${new Date(processingInteractions.get(interactionKey).startTime).toISOString()}`);
            console.log(`   Time since original: ${startTime - processingInteractions.get(interactionKey).startTime}ms`);
            return;
        }
        
        // Mark as processing
        processingInteractions.set(interactionKey, {
            startTime,
            type: interaction.type,
            customId: interaction.customId,
            commandName: interaction.commandName,
            userId: interaction.user.id
        });

        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                console.log(`⚡ Processing slash command: ${interaction.commandName}`);
                
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) {
                    console.error(`❌ No command matching ${interaction.commandName} was found.`);
                    return;
                }

                await command.execute(interaction);
                console.log(`✅ Command ${interaction.commandName} completed in ${Date.now() - startTime}ms`);
            }
            // Handle component interactions
            else if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
                console.log(`🔧 Processing component: ${interaction.customId}`);
                await handleComponentInteraction(interaction, startTime);
            }
            else {
                console.log(`❓ Unhandled interaction type: ${interaction.type}`);
            }
            
            interactionStats.processed++;
            
        } catch (error) {
            interactionStats.errors++;
            console.error(`❌ Interaction error for ${interactionKey}:`, error);
            console.error(`   Stack:`, error.stack);
            
            await handleInteractionError(interaction, error);
        } finally {
            // Always clean up
            processingInteractions.delete(interactionKey);
            console.log(`🏁 Interaction ${interactionKey} completed in ${Date.now() - startTime}ms`);
        }
    }
};

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

// Handle component interactions with detailed logging
async function handleComponentInteraction(interaction, startTime) {
    const customId = interaction.customId;
    
    try {
        // Route with detailed logging for each handler
        if (customId?.startsWith('ticket_wizard_') || customId?.startsWith('ticket_manage_')) {
            console.log(`🎫 Routing to ticket wizard handler`);
            await handleTicketWizardComponent(interaction);
            return;
        }

        if (customId?.startsWith('eco_wizard_') || customId?.startsWith('eco_open_') || 
            customId?.startsWith('eco_jobs_') || customId === 'eco_jobs_select') {
            console.log(`💰 Routing to economy wizard handler`);
            await handleEconomyWizardComponent(interaction);
            return;
        }

        if (customId?.startsWith('ai_wizard_')) {
            console.log(`🤖 Routing to AI wizard handler`);
            await handleAIWizardComponent(interaction);
            return;
        }

        if (customId?.startsWith('welcome_wizard_')) {
            console.log(`👋 Routing to welcome wizard handler`);
            await handleWelcomeWizardComponent(interaction);
            return;
        }

        if (customId?.startsWith('birthday_wizard_')) {
            console.log(`🎂 Routing to birthday wizard handler`);
            await handleBirthdayWizardComponent(interaction);
            return;
        }

        if (customId?.startsWith('shop_')) {
            console.log(`🛒 Routing to shop handler`);
            await handleShopInteraction(interaction);
            return;
        }

        if (interaction.isStringSelectMenu() && customId === 'work_select') {
            console.log(`💼 Routing to work select handler`);
            await handleWorkSelectMenu(interaction);
            return;
        }

        if (interaction.isButton() && customId?.startsWith('work_cd_')) {
            console.log(`⏰ Routing to work cooldown handler`);
            await handleWorkCooldownInteraction(interaction);
            return;
        }

        if (interaction.isModalSubmit() && customId?.startsWith('ticket_form_')) {
            console.log(`📝 Routing to ticket form handler`);
            await handleTicketFormSubmit(interaction, interaction.client.db);
            return;
        }

        if (interaction.isButton()) {
            console.log(`🔘 Routing to button handler`);
            await handleButtonInteraction(interaction, customId);
            return;
        }

        // Unhandled interaction
        console.log(`❓ No handler found for component: ${customId}`);
        await sendUnknownInteractionError(interaction);

    } catch (error) {
        console.error(`❌ Component handler error for ${customId}:`, error);
        throw error; // Re-throw to main error handler
    }
}

// Handle button interactions
async function handleButtonInteraction(interaction, customId) {
    if (customId.startsWith('ticket_button_')) {
        console.log(`🎫 Handling ticket button`);
        await handleTicketButtonInteraction(interaction);
        return;
    }

    if (customId.startsWith('blackjack_hit_') || customId.startsWith('blackjack_stand_')) {
        console.log(`🃏 Handling blackjack button`);
        const { handleBlackjackInteraction } = await import('../commands/fun/jackblack.js');
        await handleBlackjackInteraction(interaction);
        return;
    }

    switch (customId) {
        case 'create_ticket':
            console.log(`📋 Handling create ticket`);
            await createTicket(interaction);
            break;
        case 'claim_ticket':
            console.log(`✋ Handling claim ticket`);
            await claimTicket(interaction);
            break;
        case 'close_ticket':
            console.log(`🔒 Handling close ticket`);
            await closeTicket(interaction);
            break;
        default:
            console.log(`❓ Unknown button: ${customId}`);
            await sendUnknownInteractionError(interaction);
            break;
    }
}

// Send unknown interaction error
async function sendUnknownInteractionError(interaction) {
    if (interaction.replied || interaction.deferred) {
        console.log(`⚠️ Cannot send unknown error - interaction already handled`);
        return;
    }

    try {
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Onbekende Interactie')
            .setDescription('Deze interactie wordt niet herkend of is verlopen.')
            .setFooter({ text: `ID: ${interaction.id}` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        console.log(`📨 Sent unknown interaction error to user`);
    } catch (error) {
        console.error('❌ Failed to send unknown interaction error:', error);
    }
}

// Handle interaction errors
async function handleInteractionError(interaction, error) {
    console.log(`🚨 Handling interaction error:`);
    console.log(`   Error Code: ${error.code || 'N/A'}`);
    console.log(`   Error Message: ${error.message}`);
    
    if (error.code === 10062) {
        console.log('⚠️ Interaction expired - this is normal');
        return;
    }

    if (error.code === 40060) {
        console.log('⚠️ Interaction already acknowledged');
        return;
    }

    if (!interaction.replied && !interaction.deferred) {
        try {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een onverwachte fout opgetreden.')
                .setFooter({ text: `Fout ID: ${interaction.id}` })
                .setTimestamp();
            
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            console.log(`📨 Sent error message to user`);
        } catch (replyError) {
            console.error('❌ Failed to send error reply:', replyError);
        }
    }
}