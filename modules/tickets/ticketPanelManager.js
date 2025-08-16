// modules/tickets/ticketPanelManager.js
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

/**
 * Creates a new ticket panel in the database
 * @param {Object} db - Database instance
 * @param {string} guildId - Guild ID
 * @param {string} panelName - Name of the panel
 * @param {string} channelId - Channel ID where panel will be posted
 * @param {Object} embedData - Embed data (title, description, color)
 * @returns {Object} Created panel
 */
export async function createTicketPanel(db, guildId, panelName, channelId, embedData) {
    const stmt = db.prepare(`
        INSERT INTO ticket_panels (guild_id, panel_name, channel_id, embed_title, embed_description, embed_color)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(guildId, panelName, channelId, embedData.title, embedData.description, embedData.color);
    
    return {
        id: result.lastInsertRowid,
        guild_id: guildId,
        panel_name: panelName,
        channel_id: channelId,
        embed_title: embedData.title,
        embed_description: embedData.description,
        embed_color: embedData.color
    };
}

/**
 * Updates the posted panel message if message_id exists, otherwise posts a new one
 * @param {Object} db
 * @param {Object} client
 * @param {number} panelId
 */
export async function updateOrPostTicketPanel(db, client, panelId) {
    const panel = getTicketPanel(db, panelId);
    if (!panel) throw new Error('Panel not found');

    const channel = await client.channels.fetch(panel.channel_id);
    const embed = createPanelEmbed(panel);
    const actionRows = createPanelButtons(db, panelId);

    if (panel.message_id) {
        try {
            const message = await channel.messages.fetch(panel.message_id);
            await message.edit({ embeds: [embed], components: actionRows });
            return message;
        } catch (e) {
            // If message not found, post new
        }
    }
    return await postTicketPanel(db, client, panelId);
}

/**
 * Gets a ticket panel by ID
 * @param {Object} db - Database instance
 * @param {number} panelId - Panel ID
 * @returns {Object|null} Panel data or null if not found
 */
export function getTicketPanel(db, panelId) {
    const stmt = db.prepare('SELECT * FROM ticket_panels WHERE id = ?');
    return stmt.get(panelId);
}

/**
 * Gets all ticket panels for a guild
 * @param {Object} db - Database instance
 * @param {string} guildId - Guild ID
 * @returns {Array} Array of panels
 */
export function getTicketPanelsForGuild(db, guildId) {
    const stmt = db.prepare('SELECT * FROM ticket_panels WHERE guild_id = ?');
    return stmt.all(guildId);
}

/**
 * Updates a ticket panel's embed and/or channel
 * @param {Object} db
 * @param {number} panelId
 * @param {{embed_title?:string, embed_description?:string, embed_color?:string, channel_id?:string}} updates
 */
export function updateTicketPanel(db, panelId, updates) {
    const fields = [];
    const values = [];
    if (updates.embed_title !== undefined) { fields.push('embed_title = ?'); values.push(updates.embed_title); }
    if (updates.embed_description !== undefined) { fields.push('embed_description = ?'); values.push(updates.embed_description); }
    if (updates.embed_color !== undefined) { fields.push('embed_color = ?'); values.push(updates.embed_color); }
    if (updates.channel_id !== undefined) { fields.push('channel_id = ?'); values.push(updates.channel_id); }
    if (!fields.length) return;
    const stmt = db.prepare(`UPDATE ticket_panels SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values, panelId);
}

/**
 * Deletes a ticket panel
 * @param {Object} db - Database instance
 * @param {number} panelId - Panel ID
 */
export function deleteTicketPanel(db, panelId) {
    // First delete all buttons for this panel
    const deleteButtonsStmt = db.prepare('DELETE FROM ticket_buttons WHERE panel_id = ?');
    deleteButtonsStmt.run(panelId);
    
    // Then delete the panel
    const deletePanelStmt = db.prepare('DELETE FROM ticket_panels WHERE id = ?');
    deletePanelStmt.run(panelId);
}

/**
 * Creates the embed for a ticket panel
 * @param {Object} panel - Panel data
 * @returns {EmbedBuilder} Embed for the panel
 */
export function createPanelEmbed(panel) {
    const embed = new EmbedBuilder()
        .setTitle(panel.embed_title || '🎫 Ticket Systeem')
        .setDescription(panel.embed_description || 'Klik op een knop hieronder om een ticket aan te maken.')
        .setTimestamp();
        
    if (panel.embed_color) {
        embed.setColor(panel.embed_color);
    } else {
        embed.setColor('#0099ff');
    }
    
    return embed;
}

/**
 * Creates action rows with buttons for a panel
 * @param {Object} db - Database instance
 * @param {number} panelId - Panel ID
 * @returns {Array} Array of ActionRowBuilder
 */
export function createPanelButtons(db, panelId) {
    const stmt = db.prepare('SELECT * FROM ticket_buttons WHERE panel_id = ? ORDER BY id');
    const buttons = stmt.all(panelId);
    
    const actionRows = [];
    let currentRow = new ActionRowBuilder();
    let buttonCount = 0;
    
    for (const button of buttons) {
        // Discord only allows 5 buttons per row
        if (buttonCount >= 5) {
            actionRows.push(currentRow);
            currentRow = new ActionRowBuilder();
            buttonCount = 0;
        }
        
        const buttonBuilder = new ButtonBuilder()
            .setCustomId(`ticket_button_${button.id}`)
            .setLabel(button.label);
            
        // Set style
        switch (button.style?.toUpperCase()) {
            case 'SUCCESS':
                buttonBuilder.setStyle(ButtonStyle.Success);
                break;
            case 'DANGER':
                buttonBuilder.setStyle(ButtonStyle.Danger);
                break;
            case 'SECONDARY':
                buttonBuilder.setStyle(ButtonStyle.Secondary);
                break;
            default: // PRIMARY
                buttonBuilder.setStyle(ButtonStyle.Primary);
                break;
        }
        
        // Add emoji if present
        if (button.emoji) {
            buttonBuilder.setEmoji(button.emoji);
        }
        
        currentRow.addComponents(buttonBuilder);
        buttonCount++;
    }
    
    // Add the last row if it has buttons
    if (buttonCount > 0) {
        actionRows.push(currentRow);
    }
    
    return actionRows;
}

/**
 * Posts a ticket panel to a channel
 * @param {Object} db - Database instance
 * @param {Object} client - Discord client
 * @param {number} panelId - Panel ID
 * @returns {Object} Message object
 */
export async function postTicketPanel(db, client, panelId) {
    const panel = getTicketPanel(db, panelId);
    if (!panel) {
        throw new Error('Panel not found');
    }
    
    try {
        const channel = await client.channels.fetch(panel.channel_id);
        if (!channel) {
            throw new Error('Channel not found');
        }
        
        const embed = createPanelEmbed(panel);
        const actionRows = createPanelButtons(db, panelId);
        
        const message = await channel.send({
            embeds: [embed],
            components: actionRows
        });
        
        // Update panel with message ID
        const updateStmt = db.prepare('UPDATE ticket_panels SET message_id = ? WHERE id = ?');
        updateStmt.run(message.id, panelId);
        
        return message;
    } catch (error) {
        throw new Error(`Failed to post panel: ${error.message}`);
    }
}
