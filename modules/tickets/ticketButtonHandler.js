// modules/tickets/ticketButtonHandler.js
import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
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
    await interaction.deferReply({ ephemeral: true });
    
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
                
                await interaction.editReply({ embeds: [embed] });
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
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        // If button uses a form, show modal first
        if (button.use_form && button.form_fields) {
            const formFields = JSON.parse(button.form_fields);
            await showTicketFormModal(interaction, button, formFields);
            return;
        }
        
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
            await interaction.editReply({ embeds: [embed] });
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
    const modal = new ModalBuilder()
        .setCustomId(`ticket_form_${button.id}`)
        .setTitle(`${button.label} Formulier`);
    
    const actionRows = [];
    
    for (let i = 0; i < Math.min(formFields.length, 5); i++) { // Max 5 fields per modal
        const field = formFields[i];
        
        const input = new TextInputBuilder()
            .setCustomId(`field_${i}`)
            .setLabel(field.label)
            .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(field.required !== false)
            .setPlaceholder(field.placeholder || '');
            
        if (field.min_length) input.setMinLength(field.min_length);
        if (field.max_length) input.setMaxLength(field.max_length);
        
        const row = new ActionRowBuilder().addComponents(input);
        actionRows.push(row);
    }
    
    modal.addComponents(...actionRows);
    await interaction.showModal(modal);
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
        
        // Collect form data
        const formData = {};
        interaction.fields.fields.forEach((field, index) => {
            formData[`field_${index}`] = field.value;
        });
        
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
        
        // Create ticket channel or thread
        const ticketResult = await createTicketChannelOrThread(
            interaction, 
            db, 
            config, 
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
