// modules/tickets/ticketButtonHandler.js
import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { ackReply } from '../utils/ack.js';
import { createTicketChannelOrThread } from './ticketCreate.js';
import { getButton, getTicketConfig } from './ticketConfig.js';

// Cache for panels and buttons to reduce DB hits
const panelCache = new Map();
const buttonCache = new Map();

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION = 5 * 60 * 1000;

// Track processed interactions with timestamps and their completion status
const processedInteractions = new Map();
const INTERACTION_TIMEOUT = 30000; // 30 seconds

/**
 * Checks if an interaction should be processed
 * @param {string} interactionKey - Unique key for the interaction
 * @returns {boolean} True if the interaction should be processed
 */
function shouldProcessInteraction(interactionKey) {
    const now = Date.now();
    const interactionData = processedInteractions.get(interactionKey);
    
    // Clean up old entries
    for (const [key, data] of processedInteractions.entries()) {
        if (now - data.timestamp > INTERACTION_TIMEOUT) {
            processedInteractions.delete(key);
        }
    }
    
    // If we're currently processing this interaction, don't process it again
    if (interactionData?.processing) {
        return false;
    }
    
    // If we've seen this interaction recently, don't process it
    if (interactionData?.completed && (now - interactionData.timestamp < 5000)) {
        return false;
    }
    
    // Mark as processing
    processedInteractions.set(interactionKey, {
        timestamp: now,
        processing: true,
        completed: false
    });
    
    return true;
}

/**
 * Marks an interaction as completed
 * @param {string} interactionKey - Unique key for the interaction
 */
function markInteractionComplete(interactionKey) {
    const data = processedInteractions.get(interactionKey);
    if (data) {
        data.processing = false;
        data.completed = true;
        data.timestamp = Date.now();
    }
}

/**
 * Marks an interaction as being processed
 * @param {string} interactionKey - Unique key for the interaction
 */
function markInteractionProcessing(interactionKey) {
    const data = processedInteractions.get(interactionKey);
    if (data) {
        data.processing = true;
    }
}

/**
 * Handles a ticket button click
 * @param {Object} interaction - Button interaction
 * @param {Object} db - Database instance
 * @param {Object} replyManager - Reply manager instance
 */
export async function handleTicketButtonClick(interaction, db, replyManager) {
    const interactionKey = `${interaction.id}_${interaction.customId}`;
    
    // Check if we should process this interaction
    if (!shouldProcessInteraction(interactionKey)) {
        return;
    }

    // Mark this interaction as being processed
    markInteractionProcessing(interactionKey);
    
    try {
        // Always defer the interaction first to prevent timeouts
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.deferReply({ ephemeral: true });
            } catch (deferError) {
                console.error('Failed to defer reply:', deferError);
                // Mark as deferred anyway to prevent follow-up errors
                interaction.deferred = true;
            }
        }
        
        // Extract button ID from custom ID
        const buttonId = parseInt(interaction.customId.replace('ticket_button_', ''));
        if (isNaN(buttonId)) {
            await replyManager.send(replyManager.error('Ongeldige knop ID'));
            return;
        }

        // Get button configuration
        const button = await getButton(db, buttonId);
        if (!button) {
            await replyManager.send(replyManager.error('Deze knop is niet langer geldig. De ticket configuratie is mogelijk gewijzigd.'));
            return;
        }

        // Check if user has required role for this button
        if (button.required_role_id) {
            const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            if (!member || !member.roles.cache.has(button.required_role_id)) {
                await replyManager.send(replyManager.error('Je hebt niet de juiste rechten om deze actie uit te voeren.'));
                return;
            }
        }

        // Check if user already has an open ticket of this type
        const existingTicketStmt = db.prepare(`
            SELECT * FROM tickets 
            WHERE user_id = ? AND guild_id = ? AND ticket_type = ? AND status = 'open'
        `);
        const existingTicket = existingTicketStmt.get(interaction.user.id, interaction.guild.id, button.ticket_type);
        
        if (existingTicket) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('⚠️ Ticket Bestaat Al')
                .setDescription(`Je hebt al een open ${button.ticket_type} ticket.`)
                .setTimestamp();
            await replyManager.send({ embeds: [embed] });
            return;
        }

        // If button uses a form, show modal first
        if (button.use_form && button.form_fields) {
            let formFields;
            try {
                formFields = typeof button.form_fields === 'string' ? JSON.parse(button.form_fields) : button.form_fields;
            } catch (e) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Ongeldig formulier')
                    .setDescription('De opgeslagen Form JSON is ongeldig. Bewerk de knop en corrigeer de JSON.')
                    .setTimestamp();
                await replyManager.send({ embeds: [embed] });
                return;
            }
            const normalized = normalizeFormFields(formFields);
            if (!normalized.length) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚠️ Leeg formulier')
                    .setDescription('Er zijn geen geldige velden gevonden in het formulier.')
                    .setTimestamp();
                await replyManager.send({ embeds: [embed] });
                return;
            }
            await showTicketFormModal(interaction, button, normalized, replyManager);
            return;
        }
        
        // Otherwise create ticket directly
        await createTicketFromButton(interaction, db, button, null, replyManager);
        
    } catch (error) {
        console.error('Error handling ticket button click:', error);
        
        await replyManager.send(replyManager.error(error.message || 'Er is een onverwachte fout opgetreden.'));
    } finally {
        // Mark the interaction as completed when done
        markInteractionComplete(interactionKey);
        
        // Clean up after the interaction is complete
        setTimeout(() => {
            processedInteractions.delete(interactionKey);
        }, INTERACTION_TIMEOUT);
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
    const modal = new ModalBuilder()
        .setCustomId(`ticket_form_${button.id}`)
        .setTitle(`Ticket: ${button.label || 'Aanvraag'}`);

    const actionRows = formFields.map(field => {
        const input = new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label || field.id)
            .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(!!field.required);
            
        if (field.placeholder) input.setPlaceholder(field.placeholder);
        if (field.value) input.setValue(field.value);
        if (field.min_length) input.setMinLength(field.min_length);
        if (field.max_length) input.setMaxLength(field.max_length);
        
        return new ActionRowBuilder().addComponents(input);
    });

    try {
        modal.addComponents(...actionRows);
        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error showing modal:', error);
        await replyManager.send(replyManager.error('Er is een fout opgetreden bij het openen van het formulier.'));
    }
}

/**
 * Handles ticket form submission
 * @param {Object} interaction - Modal submit interaction
 * @param {Object} db - Database instance
 * @param {Object} replyManager - Reply manager instance
 */
export async function handleTicketFormSubmit(interaction, db, replyManager) {
    try {
        // Extract button ID from custom ID
        const buttonId = parseInt(interaction.customId.replace('ticket_form_', ''));
        if (isNaN(buttonId)) {
            await replyManager.send(replyManager.error('Ongeldig formulier ID'));
            return;
        }

        // Get button data
        const button = getButton(db, buttonId);
        if (!button) {
            await replyManager.send(replyManager.error('Kon de bijbehorende knop niet vinden.'));
            return;
        }

        // Extract form data
        const formData = {};
        interaction.fields.fields.forEach((field, key) => {
            formData[key] = field.value;
        });

        // Create ticket with form data
        await createTicketFromButton(interaction, db, button, formData, replyManager);

    } catch (error) {
        console.error('Error handling ticket form submit:', error);
        await replyManager.send(replyManager.error(error.message || 'Er is een onverwachte fout opgetreden.'));
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
export async function createTicketFromButton(interaction, db, button, formData, replyManager) {
    try {
        // Get guild configuration
        const config = getTicketConfig(db, interaction.guildId);
        if (!config) {
            await replyManager.send(replyManager.error('Ticket systeem is niet geconfigureerd voor deze server.'));
            return;
        }

        // Create the ticket channel or thread
        const ticketResult = await createTicketChannelOrThread(interaction, db, config, button.ticket_type, formData);

        // Insert ticket into database
        const stmt = db.prepare(`
            INSERT INTO tickets (guild_id, channel_id, user_id, ticket_type, status, created_at, claimed_by)
            VALUES (?, ?, ?, ?, 'open', ?, ?)
        `);
        
        stmt.run(
            interaction.guildId,
            ticketResult.channel.id,
            interaction.user.id,
            button.ticket_type,
            Date.now(),
            button.button_type === 'claim' ? interaction.user.id : null
        );

        // Send success message
        await replyManager.send(
            replyManager.success(
                `Je ${button.ticket_type} ticket is aangemaakt: ${ticketResult.channel}`,
                '✅ Ticket Aangemaakt'
            )
        );
        
    } catch (error) {
        console.error('Error creating ticket from button:', error);
        await replyManager.send(replyManager.error(error.message || 'Er is een fout opgetreden bij het aanmaken van het ticket.'));
    }
}

function normalizeFormFields(fields) {
    const arr = Array.isArray(fields) ? fields : [];
    return arr
        .filter(f => f && (typeof f === 'object'))
        .map((f, idx) => ({
            id: typeof f.id === 'string' ? f.id : `field_${idx}`,
            label: (typeof f.label === 'string' && f.label.trim()) ? f.label.trim() : `Veld ${idx + 1}`,
            style: (typeof f.style === 'string' ? f.style : 'SHORT').toUpperCase(),
            required: f.required !== false,
            placeholder: typeof f.placeholder === 'string' ? f.placeholder : '',
            min_length: Number.isInteger(f.min_length) ? f.min_length : undefined,
            max_length: Number.isInteger(f.max_length) ? f.max_length : undefined,
        }));
}

/**
 * Clears the button cache (for use when buttons are updated)
 */
export function clearButtonCache() {
    buttonCache.clear();
}

/**
 * Clears the panel cache (for use when panels are updated)
 */
export function clearPanelCache() {
    panelCache.clear();
    buttonCache.clear(); // Clear buttons too since they're related to panels
}

/**
 * Handles ticket button interactions (wrapper for handleTicketButtonClick)
 * @param {Object} interaction - Button interaction
 * @param {Object} replyManager - Reply manager instance
 */
export async function handleTicketButtonInteraction(interaction, replyManager) {
    const db = interaction.client.db;
    await handleTicketButtonClick(interaction, db, replyManager);
}

/**
 * Gets a ticket panel by ID, using cache if available
 * @param {Object} db - Database instance
 * @param {number} panelId - Panel ID
 * @returns {Object|null} Panel data or null if not found
 */
export function getTicketPanel(db, panelId) {
    // Check cache first
    if (panelCache.has(panelId)) {
        const cached = panelCache.get(panelId);
        // Check if cache is still valid
        if (Date.now() - cached.timestamp < CACHE_EXPIRATION) {
            return cached.data;
        } else {
            // Remove expired cache entry
            panelCache.delete(panelId);
        }
    }
    
    const stmt = db.prepare('SELECT * FROM ticket_panels WHERE id = ?');
    const panel = stmt.get(panelId);
    
    if (panel) {
        panelCache.set(panelId, {
            data: panel,
            timestamp: Date.now()
        });
    }
    
    return panel;
}

/**
 * Gets a ticket button by ID, using cache if available
 * @param {Object} db - Database instance
 * @param {number} buttonId - Button ID
 * @returns {Object|null} Button data or null if not found
 */
export function getTicketButton(db, buttonId) {
    // Check cache first
    if (buttonCache.has(buttonId)) {
        const cached = buttonCache.get(buttonId);
        // Check if cache is still valid
        if (Date.now() - cached.timestamp < CACHE_EXPIRATION) {
            return cached.data;
        } else {
            // Remove expired cache entry
            buttonCache.delete(buttonId);
        }
    }
    
    const stmt = db.prepare('SELECT * FROM ticket_buttons WHERE id = ?');
    const button = stmt.get(buttonId);
    
    if (button) {
        buttonCache.set(buttonId, {
            data: button,
            timestamp: Date.now()
        });
    }
    
    return button;
}
