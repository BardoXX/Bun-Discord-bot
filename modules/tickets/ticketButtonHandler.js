// modules/tickets/ticketButtonHandler.js
import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { ackReply } from '../utils/ack.js';
import { createTicketChannelOrThread } from './ticketCreate.js';

// Cache for panels and buttons to reduce DB hits
const panelCache = new Map();
const buttonCache = new Map();

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION = 5 * 60 * 1000;

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

/**
 * Handles a ticket button click
 * @param {Object} interaction - Button interaction
 * @param {Object} db - Database instance
 */
export async function handleTicketButtonClick(interaction, db) {
    try {
        // Extract button ID from custom ID
        const buttonId = parseInt(interaction.customId.replace('ticket_button_', ''));
        if (isNaN(buttonId)) {
            throw new Error('Invalid button ID');
        }
        
        // Get button data
        const button = getTicketButton(db, buttonId);
        if (!button) {
            throw new Error('Button not found');
        }
        
        // Check role requirement if set
        if (button.role_requirement) {
            const hasRole = interaction.member.roles.cache.has(button.role_requirement);
            if (!hasRole) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Geen Toegang')
                    .setDescription('Je hebt niet de juiste rol om dit ticket type aan te maken.')
                    .setTimestamp();
                await ackReply(interaction, { embeds: [embed] }, true);
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
            await ackReply(interaction, { embeds: [embed] }, true);
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
                await ackReply(interaction, { embeds: [embed] }, true);
                return;
            }
            const normalized = normalizeFormFields(formFields);
            if (!normalized.length) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚠️ Leeg formulier')
                    .setDescription('Er zijn geen geldige velden gevonden in het formulier.')
                    .setTimestamp();
                await ackReply(interaction, { embeds: [embed] }, true);
                return;
            }
            await showTicketFormModal(interaction, button, normalized);
            return;
        }
        // Non-form path: now defer, then proceed
        await interaction.deferReply({ ephemeral: true });

        // Otherwise create ticket directly
        await createTicketFromButton(interaction, db, button, null);
        
    } catch (error) {
        console.error('Error handling ticket button click:', error);
        
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Er is een fout opgetreden bij het verwerken van je verzoek.')
            .setTimestamp();
        try {
            await ackReply(interaction, { embeds: [embed] }, true);
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
        }
    }
}

/**
 * Shows a modal form for ticket creation
 * @param {Object} interaction - Button interaction
 * @param {Object} button - Button data
 * @param {Array} formFields - Form fields configuration
 */
async function showTicketFormModal(interaction, button, formFields) {
    const safeTitle = (typeof button.label === 'string' && button.label.trim()) ? `${button.label.trim()} Formulier` : 'Ticket Formulier';
    const modal = new ModalBuilder()
        .setCustomId(`ticket_form_${button.id}`)
        .setTitle(safeTitle);
    
    const actionRows = [];
    
    for (let i = 0; i < Math.min(formFields.length, 5); i++) { // Max 5 fields per modal
        const field = formFields[i] || {};
        try {
            const label = typeof field.label === 'string' && field.label.trim() ? field.label.trim() : `Veld ${i + 1}`;
            const styleRaw = String(field.style || 'SHORT').toUpperCase();
            const style = styleRaw === 'PARAGRAPH' ? TextInputStyle.Paragraph : TextInputStyle.Short;
            const placeholder = typeof field.placeholder === 'string' ? field.placeholder : '';
            const required = field.required !== false;

            const input = new TextInputBuilder()
                .setCustomId(`field_${i}`)
                .setStyle(style)
                .setRequired(required)
                .setPlaceholder(placeholder);

            try {
                input.setLabel(String(label));
            } catch {
                input.setLabel(`Veld ${i + 1}`);
            }
                
            // Defaults for min/max lengths
            const looksLikeDescription = /omschrijving|beschrijving|description|details/i.test(label);
            const defaultMax = style === TextInputStyle.Paragraph || looksLikeDescription ? 300 : 100;
            const defaultMin = 0;

            const minLen = Number.isInteger(field.min_length) && field.min_length >= 0 ? field.min_length : defaultMin;
            const maxLen = Number.isInteger(field.max_length) && field.max_length > 0 ? field.max_length : defaultMax;

            if (minLen > 0) input.setMinLength(minLen);
            if (maxLen > 0) input.setMaxLength(maxLen);
            
            const row = new ActionRowBuilder().addComponents(input);
            actionRows.push(row);
        } catch (e) {
            // Skip malformed field
            continue;
        }
    }

    if (actionRows.length === 0) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('⚠️ Leeg formulier')
            .setDescription('Er konden geen geldige invoervelden worden gemaakt uit de Form JSON.')
            .setTimestamp();
        await ackReply(interaction, { embeds: [embed] }, true);
        return;
    }
    
    modal.addComponents(...actionRows);
    await interaction.showModal(modal);
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
 * Handles a ticket form submission
 * @param {Object} interaction - Modal interaction
 * @param {Object} db - Database instance
 */
export async function handleTicketFormSubmit(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        // Extract button ID from custom ID
        const buttonId = parseInt(interaction.customId.replace('ticket_form_', ''));
        if (isNaN(buttonId)) {
            throw new Error('Invalid button ID');
        }
        
        // Get button data
        const button = getTicketButton(db, buttonId);
        if (!button) {
            throw new Error('Button not found');
        }
        
        // Collect form data mapped to labels for nicer display
        let originalFields;
        try {
            originalFields = typeof button.form_fields === 'string' ? JSON.parse(button.form_fields) : button.form_fields;
        } catch {}
        const normalized = normalizeFormFields(originalFields || []);
        const formData = [];
        for (let i = 0; i < Math.min(normalized.length, 5); i++) {
            const val = interaction.fields.getTextInputValue?.(`field_${i}`) ?? '';
            formData.push({ name: normalized[i].label || `Veld ${i + 1}`, value: val || '-' });
        }
        
        // Create ticket with form data
        await createTicketFromButton(interaction, db, button, formData);
        
    } catch (error) {
        console.error('Error handling ticket form submit:', error);
        
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Er is een fout opgetreden bij het verwerken van je formulier.')
            .setTimestamp();
        
        try {
            await interaction.editReply({ embeds: [embed] });
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
        }
    }
}

/**
 * Creates a ticket from button data
 * @param {Object} interaction - Interaction (button or modal)
 * @param {Object} db - Database instance
 * @param {Object} button - Button data
 * @param {Object|null} formData - Form data if applicable
 */
async function createTicketFromButton(interaction, db, button, formData) {
    try {
        // Get panel for this button using cache
        const panel = getTicketPanel(db, button.panel_id);
        
        if (!panel) {
            throw new Error('Panel not found');
        }
        
        // Get guild ticket config
        const configStmt = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?');
        const config = configStmt.get(interaction.guild.id);
        
        if (!config || !config.ticket_category_id) {
            throw new Error('Ticket system not configured');
        }
        
        // Per-button override: thread mode via form_fields metadata
        let effectiveConfig = { ...config };
        try {
            if (button.form_fields) {
                const meta = typeof button.form_fields === 'string' ? JSON.parse(button.form_fields) : button.form_fields;
                if (meta && (meta.thread_mode === true || meta.thread_mode === false)) {
                    effectiveConfig.thread_mode = meta.thread_mode ? 1 : 0;
                }
            }
        } catch {}

        // Create ticket channel or thread
        const ticketResult = await createTicketChannelOrThread(
            interaction,
            db,
            effectiveConfig,
            button.ticket_type,
            formData
        );
        
        // Save ticket to database
        const insertStmt = db.prepare(`
            INSERT INTO tickets (guild_id, user_id, channel_id, status, ticket_type, panel_id, button_id)
            VALUES (?, ?, ?, 'open', ?, ?, ?)
        `);
        insertStmt.run(
            interaction.guild.id, 
            interaction.user.id, 
            ticketResult.channel.id, 
            button.ticket_type, 
            panel.id, 
            button.id
        );
        
        // Send success message
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Ticket Aangemaakt')
            .setDescription(`Je ${button.ticket_type} ticket is aangemaakt: ${ticketResult.channel}`)
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error creating ticket from button:', error);
        throw error;
    }
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
 */
export async function handleTicketButtonInteraction(interaction) {
    const db = interaction.client.db;
    await handleTicketButtonClick(interaction, db);
}
