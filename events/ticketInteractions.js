import { Events, EmbedBuilder } from 'discord.js';
import { handleTicketWizardComponent, handleTicketWizardModal } from '../commands/configuratie/ticketWizard.js';
import ticketButtonHandler from '../modules/tickets/ticketButtonHandler.js';
import { createTicket, claimTicket, closeTicket } from '../commands/utils/ticketSystem.js';
import ReplyManager from '../modules/utils/replyManager.js';

export default {
    name: Events.InteractionCreate,
    once: false,
    
    /**
     * Handles all ticket-related interactions
     * @param {import('discord.js').Interaction} interaction - The interaction to handle
     */
    async execute(interaction) {
        // Only handle ticket-related interactions
        if (!this.isTicketInteraction(interaction)) return;

        const replyManager = new ReplyManager(interaction);
        const interactionKey = `${interaction.id}_${interaction.user.id}`;

        try {
            // Handle ticket wizard components
            if (this.isTicketWizardInteraction(interaction)) {
                await handleTicketWizardComponent(interaction);
                return;
            }

            // Handle ticket button interactions
            if (interaction.isButton() && interaction.customId?.startsWith('ticket_')) {
                // Only process if not already handling this interaction
                if (this.isProcessingInteraction(interactionKey)) {
                    return;
                }
                this.markInteractionProcessing(interactionKey);
                
                try {
                    await ticketButtonHandler.handleTicketButtonInteraction(interaction, replyManager);
                } finally {
                    this.markInteractionComplete(interactionKey);
                }
                return;
            }

            // Handle ticket form submissions
            if (interaction.isModalSubmit() && interaction.customId?.startsWith('ticket_form_')) {
                // Only process if not already handling this interaction
                if (this.isProcessingInteraction(interactionKey)) {
                    return;
                }
                this.markInteractionProcessing(interactionKey);
                
                try {
                    await ticketButtonHandler.handleTicketFormSubmit(interaction, interaction.client.db, replyManager);
                } finally {
                    this.markInteractionComplete(interactionKey);
                }
                return;
            }

            // Fallback for unhandled ticket interactions
            await this.handleUnknownTicketInteraction(interaction, replyManager);
            
        } catch (error) {
            console.error('Error in ticket interaction handler:', error);
            await this.handleInteractionError(interaction, error, replyManager);
        }
    },

    // Track processing interactions to prevent duplicate handling
    processingInteractions: new Set(),
    interactionTimeouts: new Map(),

    /**
     * Checks if an interaction is currently being processed
     * @param {string} interactionKey - Unique key for the interaction
     * @returns {boolean} True if the interaction is being processed
     */
    isProcessingInteraction(interactionKey) {
        return this.processingInteractions.has(interactionKey);
    },

    /**
     * Marks an interaction as being processed
     * @param {string} interactionKey - Unique key for the interaction
     */
    markInteractionProcessing(interactionKey) {
        this.processingInteractions.add(interactionKey);
        
        // Set a timeout to clean up in case something goes wrong
        const timeout = setTimeout(() => {
            this.markInteractionComplete(interactionKey);
        }, 60000); // 1 minute timeout

        this.interactionTimeouts.set(interactionKey, timeout);
    },

    /**
     * Marks an interaction as complete
     * @param {string} interactionKey - Unique key for the interaction
     */
    markInteractionComplete(interactionKey) {
        this.processingInteractions.delete(interactionKey);
        
        // Clear the timeout if it exists
        if (this.interactionTimeouts.has(interactionKey)) {
            clearTimeout(this.interactionTimeouts.get(interactionKey));
            this.interactionTimeouts.delete(interactionKey);
        }
    },

    /**
     * Checks if an interaction is related to tickets
     * @param {import('discord.js').Interaction} interaction - The interaction to check
     * @returns {boolean} True if the interaction is ticket-related
     */
    isTicketInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isModalSubmit()) return false;
        
        const customId = interaction.customId;
        if (!customId) return false;
        
        return customId.startsWith('ticket_') || 
               customId.startsWith('ticket_wizard_') ||
               customId.startsWith('ticket_form_');
    },

    /**
     * Checks if an interaction is related to the ticket wizard
     * @param {import('discord.js').Interaction} interaction - The interaction to check
     * @returns {boolean} True if the interaction is ticket wizard related
     */
    isTicketWizardInteraction(interaction) {
        return (
            (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isModalSubmit()) &&
            (interaction.customId?.startsWith('ticket_wizard_') ||
             interaction.customId?.startsWith('ticket_type_modal') ||
             interaction.customId?.startsWith('ticket_naming_modal') ||
             interaction.customId?.startsWith('ticket_role_modal'))
        );
    },

    /**
     * Handles unknown ticket interactions
     * @param {import('discord.js').Interaction} interaction - The interaction to handle
     * @param {ReplyManager} replyManager - The reply manager instance
     */
    async handleUnknownTicketInteraction(interaction, replyManager = new ReplyManager(interaction)) {
        try {
            await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('❌ Onbekende interactie')
                        .setDescription('Deze ticketactie wordt niet herkend of is verlopen.')
                ],
                ephemeral: true
            });
        } catch (error) {
            console.error('Failed to send unknown interaction message:', error);
        }
    },

    /**
     * Handles errors for ticket interactions
     * @param {import('discord.js').Interaction} interaction - The interaction that caused the error
     * @param {Error} error - The error that occurred
     * @param {ReplyManager} replyManager - The reply manager instance
     */
    async handleInteractionError(interaction, error, replyManager = new ReplyManager(interaction)) {
        console.error('Ticket interaction error:', error);
        
        try {
            // Handle specific error codes
            if (error.code === 40060) { // Interaction already acknowledged
                console.log('Interaction already acknowledged, skipping error reply');
                return;
            }
            
            if (error.code === 10062) { // Interaction token expired
                console.log('Interaction token expired, cannot send error message');
                return;
            }
            
            // Send error message to user
            await replyManager.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Fout')
                        .setDescription('Er is een fout opgetreden bij het verwerken van je verzoek.')
                        .addFields(
                            { name: 'Foutcode', value: error.code || 'Onbekend', inline: true },
                            { name: 'Foutmelding', value: error.message || 'Geen details beschikbaar' }
                        )
                ],
                ephemeral: true
            });
        } catch (error) {
            console.error('Failed to send error message:', error);
        }
    }
};
