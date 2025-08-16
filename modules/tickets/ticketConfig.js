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
 * Updates a button's fields
 * @param {Object} db
 * @param {number} buttonId
 * @param {{label?:string, style?:string, emoji?:string, ticket_type?:string, use_form?:boolean, form_fields?:any, role_requirement?:string|null}} updates
 */
export function updatePanelButton(db, buttonId, updates) {
    const fields = [];
    const values = [];
    if (updates.label !== undefined) { fields.push('label = ?'); values.push(updates.label); }
    if (updates.style !== undefined) { fields.push('style = ?'); values.push(updates.style); }
    if (updates.emoji !== undefined) { fields.push('emoji = ?'); values.push(updates.emoji); }
    if (updates.ticket_type !== undefined) { fields.push('ticket_type = ?'); values.push(updates.ticket_type); }
    if (updates.use_form !== undefined) { fields.push('use_form = ?'); values.push(updates.use_form ? 1 : 0); }
    if (updates.form_fields !== undefined) { fields.push('form_fields = ?'); values.push(updates.form_fields ? JSON.stringify(updates.form_fields) : null); }
    if (updates.role_requirement !== undefined) { fields.push('role_requirement = ?'); values.push(updates.role_requirement || null); }
    if (!fields.length) return;
    const stmt = db.prepare(`UPDATE ticket_buttons SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values, buttonId);
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
 * Gets a single button by ID
 * @param {Object} db
 * @param {number} buttonId
 * @returns {Object|null}
 */
export function getButton(db, buttonId) {
    const stmt = db.prepare('SELECT * FROM ticket_buttons WHERE id = ?');
    return stmt.get(buttonId);
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
