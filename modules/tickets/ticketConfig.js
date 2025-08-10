// modules/tickets/ticketConfig.js

/**
 * Gets ticket configuration for a guild
 * @param {Object} db - Database instance
 * @param {string} guildId - Guild ID
 * @returns {Object|null} Configuration or null if not found
 */
export function getTicketConfig(db, guildId) {
    const stmt = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?');
    return stmt.get(guildId);
}

/**
 * Sets ticket configuration for a guild
 * @param {Object} db - Database instance
 * @param {string} guildId - Guild ID
 * @param {Object} config - Configuration object
 */
export function setTicketConfig(db, guildId, config) {
    // Check if config already exists
    const existing = getTicketConfig(db, guildId);
    
    if (existing) {
        // Update existing config
        const stmt = db.prepare(`
            UPDATE ticket_config 
            SET ticket_category_id = ?, thread_mode = ?, log_channel_id = ?
            WHERE guild_id = ?
        `);
        stmt.run(
            config.ticket_category_id || null,
            config.thread_mode ? 1 : 0,
            config.log_channel_id || null,
            guildId
        );
    } else {
        // Insert new config
        const stmt = db.prepare(`
            INSERT INTO ticket_config (guild_id, ticket_category_id, thread_mode, log_channel_id)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(
            guildId,
            config.ticket_category_id || null,
            config.thread_mode ? 1 : 0,
            config.log_channel_id || null
        );
    }
}

/**
 * Gets all buttons for a panel
 * @param {Object} db - Database instance
 * @param {number} panelId - Panel ID
 * @returns {Array} Array of buttons
 */
export function getButtonsForPanel(db, panelId) {
    const stmt = db.prepare('SELECT * FROM ticket_buttons WHERE panel_id = ? ORDER BY id');
    return stmt.all(panelId);
}

/**
 * Adds a button to a panel
 * @param {Object} db - Database instance
 * @param {number} panelId - Panel ID
 * @param {Object} buttonData - Button data
 * @returns {Object} Created button
 */
export function addPanelButton(db, panelId, buttonData) {
    const stmt = db.prepare(`
        INSERT INTO ticket_buttons 
        (panel_id, label, style, emoji, ticket_type, use_form, form_fields, role_requirement)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
        panelId,
        buttonData.label,
        buttonData.style,
        buttonData.emoji,
        buttonData.ticket_type,
        buttonData.use_form ? 1 : 0,
        buttonData.form_fields ? JSON.stringify(buttonData.form_fields) : null,
        buttonData.role_requirement
    );
    
    return {
        id: result.lastInsertRowid,
        panel_id: panelId,
        ...buttonData
    };
}

/**
 * Removes a button from a panel
 * @param {Object} db - Database instance
 * @param {number} buttonId - Button ID
 */
export function removePanelButton(db, buttonId) {
    const stmt = db.prepare('DELETE FROM ticket_buttons WHERE id = ?');
    stmt.run(buttonId);
}
