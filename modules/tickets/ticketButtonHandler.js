// modules/tickets/ticketButtonHandler.js
import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { createTicketChannelOrThread } from './ticketCreate.js';

// Cache for panels and buttons to reduce DB hits
const panelCache = new Map();
const buttonCache = new Map();

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION = 5 * 60 * 1000;

// Track active interactions with timestamps
const activeInteractions = new Map();
const INTERACTION_TIMEOUT = 10000; // 10 seconds

/**
 * Checks if an interaction should be processed (prevents duplicates)
 */
function shouldProcessInteraction(interactionKey) {
    const now = Date.now();
    
    // Clean up old interactions
    for (const [key, timestamp] of activeInteractions.entries()) {
        if (now - timestamp > INTERACTION_TIMEOUT) {
            activeInteractions.delete(key);
        }
    }
    
    // Check if already processing
    if (activeInteractions.has(interactionKey)) {
        return false;
    }
    
    // Mark as processing
    activeInteractions.set(interactionKey, now);
    return true;
}

/**
 * Marks an interaction as complete
 */
function markInteractionComplete(interactionKey) {
    activeInteractions.delete(interactionKey);
}

/**
 * Safely reply to an interaction, handling already-acknowledged cases
 */
async function safeReply(interaction, options) {
    try {
        if (interaction.replied) {
            return interaction.followUp({
                ...options,
                ephemeral: options.ephemeral !== false,
                fetchReply: false
            });
        }
        
        if (interaction.deferred) {
            return interaction.editReply({
                ...options,
                ephemeral: options.ephemeral !== false
            });
        }
        
        return interaction.reply({
            ...options,
            ephemeral: options.ephemeral !== false,
            fetchReply: false
        });
    } catch (error) {
        console.error('Error in safeReply:', error);
        // If all else fails, try a direct message
        if (error.code === 10062 || error.code === 40060) { // Unknown interaction or already acknowledged
            try {
                await interaction.user.send({
                    content: '❌ Er is een fout opgetreden bij het verwerken van je verzoek. Probeer het opnieuw.'
                }).catch(() => {});
            } catch (e) {
                console.error('Failed to send DM:', e);
            }
        }
        return null;
    }
}

/**
 * Handles a ticket button click
 * @param {Object} interaction - Button interaction
 * @param {Object} db - Database instance
 * @param {Object} replyManager - Reply manager instance
 */
async function handleTicketButtonClick(interaction, db, replyManager) {
    try {
        // Parse the button ID from the custom ID
        const buttonId = interaction.customId.replace('ticket_', '');
        if (!buttonId) {
            await replyManager.error('❌ Ongeldig knop ID');
            return;
        }

        console.log(`🔄 Handling Button: ${interaction.customId}`);

        // Get the button data from the database
        const button = await getTicketButton(db, buttonId);
        if (!button) {
            await replyManager.error('❌ Kon de ticketknop niet vinden in de database.');
            return;
        }

        // Get the panel data
        const panel = await getTicketPanel(db, button.panel_id);
        if (!panel) {
            await replyManager.error('❌ Kon het ticketpaneel niet vinden in de database.');
            return;
        }

        // Check if this is a ticket creation button
        if (button.type === 'create') {
            // If the button has form fields, show the form modal
            if (button.form_fields && button.form_fields.length > 0) {
                await showTicketFormModal(interaction, button, button.form_fields, replyManager);
            } else {
                // Otherwise, create the ticket directly
                await createTicketFromButton(interaction, db, button, null, replyManager);
            }
        }
        // Add handling for other button types (close, delete, etc.) here
        
    } catch (error) {
        console.error('Error in handleTicketButtonClick:', error);
        await replyManager.error('Er is een fout opgetreden bij het verwerken van je verzoek.');
    }
}

/**
 * Shows a modal form for ticket creation
 * @param {Object} interaction - Button interaction
 * @param {Object} button - Button data
 * @param {Array} formFields - Form fields configuration
 * @param {Object} replyManager - Reply manager instance
 */
async function showTicketFormModal(interaction, button, formFields, replyManager) {
    try {
        const modal = new ModalBuilder()
            .setCustomId(`ticket_form_${button.id}`)
            .setTitle(button.label || 'Ticket Form');

        const components = [];
        const normalizedFields = normalizeFormFields(formFields);

        for (const field of normalizedFields) {
            const input = new TextInputBuilder()
                .setCustomId(field.id || field.label.toLowerCase().replace(/\s+/g, '_'))
                .setLabel(field.label)
                .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                .setRequired(!!field.required);

            if (field.placeholder) input.setPlaceholder(field.placeholder);
            if (field.value) input.setValue(field.value);
            if (field.min_length) input.setMinLength(field.min_length);
            if (field.max_length) input.setMaxLength(field.max_length);

            components.push(new ActionRowBuilder().addComponents(input));
        }

        modal.addComponents(...components);
        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error showing ticket form modal:', error);
        await replyManager.error('Failed to load the ticket form. Please try again.');
    }
}

/**
 * Creates a ticket from a button click
 * @param {Object} interaction - The interaction that triggered this
 * @param {Object} db - Database instance
 * @param {Object} button - Button configuration
 * @param {Object|null} formData - Form data if applicable
 * @param {Object} replyManager - Reply manager instance
 */
async function createTicketFromButton(interaction, db, button, formData, replyManager) {
    try {
        // Check if user already has an open ticket of this type
        const { checkExistingTicket } = await import('./ticketUtils.js');
        const existingTicket = await checkExistingTicket(db, interaction.user.id, interaction.guild.id, button.ticket_type);
        
        if (existingTicket) {
            await replyManager.error(`You already have an open ${button.ticket_type} ticket: <#${existingTicket.channel_id}>`);
            return;
        }

        // Create the ticket
        const ticket = await createTicketChannelOrThread(interaction, db, {
            type: button.ticket_type,
            userId: interaction.user.id,
            formData: formData,
            threadMode: button.thread_mode
        });

        if (!ticket) {
            throw new Error('Failed to create ticket');
        }

        // Send success message
        await replyManager.success(`Ticket created: <#${ticket.channel_id}>`);
    } catch (error) {
        console.error('Error creating ticket:', error);
        await replyManager.error('Failed to create ticket. Please try again or contact an admin.');
    }
}

/**
 * Handles ticket form submission
 * @param {Object} interaction - Modal submit interaction
 * @param {Object} db - Database instance
 * @param {Object} replyManager - Reply manager instance
 */
async function handleTicketFormSubmit(interaction, db, replyManager) {
    try {
        await replyManager.defer(true);
        
        const buttonId = interaction.customId.replace('ticket_form_', '');
        if (!buttonId) {
            await replyManager.error('Invalid form submission');
            return;
        }

        // Get the button configuration
        const button = await getTicketButton(db, buttonId);
        if (!button) {
            await replyManager.error('Button configuration not found');
            return;
        }

        // Extract form data
        const formData = {};
        const normalizedFields = normalizeFormFields(button.form_fields || []);
        
        for (const field of normalizedFields) {
            const fieldId = field.id || field.label.toLowerCase().replace(/\s+/g, '_');
            formData[fieldId] = interaction.fields.getTextInputValue(fieldId);
        }

        // Create the ticket with form data
        await createTicketFromButton(interaction, db, button, formData, replyManager);
    } catch (error) {
        console.error('Error handling ticket form submission:', error);
        await replyManager.error('An error occurred while processing your ticket request.');
    }
}

/**
 * Normalizes form fields to ensure they have required properties
 * @param {Array} fields - Array of form fields
 * @returns {Array} Normalized form fields
 */
function normalizeFormFields(fields) {
    if (!Array.isArray(fields)) return [];
    
    return fields.map((field, index) => ({
        id: field.id || `field_${index}`,
        label: field.label || `Field ${index + 1}`,
        style: field.style || 'short',
        placeholder: field.placeholder || '',
        required: field.required !== undefined ? field.required : true,
        min_length: field.min_length || 0,
        max_length: field.max_length || 4000,
        value: field.value || ''
    }));
}

/**
 * Main handler for ticket button interactions
 * @param {Object} interaction - Button interaction
 * @param {Object} replyManager - Reply manager instance
 * @param {Object} db - Database instance
 */
async function handleTicketButtonInteraction(interaction, replyManager, db) {
    const interactionKey = `ticket_button_${interaction.id}`;
    
    // Check if this interaction has already been processed
    if (!shouldProcessInteraction(interactionKey)) {
        console.log('⚠️ Duplicate interaction, skipping:', interactionKey);
        return;
    }

    try {
        // Defer the reply immediately to prevent timeouts
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true }).catch(console.error);
        }

        // Ensure we have a database instance
        if (!db) {
            console.error('Database not available in interaction client');
            await replyManager.error('Database connection error. Please try again later.');
            return;
        }

        // Handle the button click
        await handleTicketButtonClick(interaction, db, replyManager);
    } catch (error) {
        console.error('Error in handleTicketButtonInteraction:', error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ 
                    content: '❌ Er is een fout opgetreden bij het verwerken van je verzoek.',
                    ephemeral: true 
                }).catch(console.error);
            } else {
                await interaction.reply({ 
                    content: '❌ Er is een fout opgetreden bij het verwerken van je verzoek.',
                    ephemeral: true 
                }).catch(console.error);
            }
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    } finally {
        markInteractionComplete(interactionKey);
    }
}

/**
 * Gets a ticket button by ID, using cache if available
 * @param {Object} db - Database instance
 * @param {number} buttonId - Button ID
 * @returns {Promise<Object|null>} Button data or null if not found
 */
async function getTicketButton(db, buttonId) {
    const cacheKey = `button_${buttonId}`;
    const cached = buttonCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_EXPIRATION)) {
        return cached.data;
    }
    
    try {
        // Use consistent database method - adjust based on your DB setup
        const button = await new Promise((resolve, reject) => {
            if (db.prepare) {
                // Synchronous SQLite
                try {
                    const stmt = db.prepare('SELECT * FROM ticket_buttons WHERE id = ?');
                    resolve(stmt.get(buttonId));
                } catch (error) {
                    reject(error);
                }
            } else {
                // Asynchronous database
                db.get('SELECT * FROM ticket_buttons WHERE id = ?', [buttonId])
                    .then(resolve)
                    .catch(reject);
            }
        });
        
        if (button) {
            // Parse JSON fields
            if (button.form_fields && typeof button.form_fields === 'string') {
                try {
                    button.form_fields = JSON.parse(button.form_fields);
                } catch (e) {
                    console.error('Error parsing form_fields for button', buttonId, e);
                    button.form_fields = [];
                }
            }
            
            // Cache the result
            buttonCache.set(cacheKey, {
                data: button,
                timestamp: Date.now()
            });
            
            return button;
        }
    } catch (error) {
        console.error('Error getting ticket button:', error);
    }
    
    return null;
}

/**
 * Gets a ticket panel by ID, using cache if available
 * @param {Object} db - Database instance
 * @param {number} panelId - Panel ID
 * @returns {Promise<Object|null>} Panel data or null if not found
 */
async function getTicketPanel(db, panelId) {
    const cacheKey = `panel_${panelId}`;
    const cached = panelCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_EXPIRATION)) {
        return cached.data;
    }
    
    try {
        // Use consistent database method
        const panel = await new Promise((resolve, reject) => {
            if (db.prepare) {
                // Synchronous SQLite
                try {
                    const stmt = db.prepare('SELECT * FROM ticket_panels WHERE id = ?');
                    resolve(stmt.get(panelId));
                } catch (error) {
                    reject(error);
                }
            } else {
                // Asynchronous database
                db.get('SELECT * FROM ticket_panels WHERE id = ?', [panelId])
                    .then(resolve)
                    .catch(reject);
            }
        });

        if (panel) {
            // Cache the result
            panelCache.set(cacheKey, {
                data: panel,
                timestamp: Date.now()
            });
            
            return panel;
        }
    } catch (error) {
        console.error('Error getting ticket panel:', error);
    }
    
    return null;
}

// Cache management functions
function clearButtonCache() {
    buttonCache.clear();
}

function clearPanelCache() {
    panelCache.clear();
}

// Export all functions
export default {
    handleTicketButtonInteraction,
    handleTicketFormSubmit,
    getTicketButton,
    getTicketPanel,
    clearButtonCache,
    clearPanelCache
};

export {
    handleTicketButtonInteraction,
    handleTicketFormSubmit,
    getTicketButton,
    getTicketPanel,
    clearButtonCache,
    clearPanelCache
};