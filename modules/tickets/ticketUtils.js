/**
 * Utility functions for ticket management
 */

/**
 * Get all ticket systems for a guild
 * @param {Client} client - Discord client
 * @param {string} guildId - ID of the guild
 * @returns {Promise<Array>} - Array of ticket systems
 */
async function getTicketSystemsByGuild(client, guildId) {
    try {
        return await client.db.all(
            'SELECT * FROM ticket_systems WHERE guild_id = ?',
            [guildId]
        );
    } catch (error) {
        console.error('Error getting ticket systems:', error);
        return [];
    }
}

/**
 * Get a single ticket system by ID
 * @param {Client} client - Discord client
 * @param {string} ticketId - ID of the ticket system
 * @returns {Promise<Object|null>} - Ticket system or null if not found
 */
async function getTicketSystemById(client, ticketId) {
    try {
        return await client.db.get(
            'SELECT * FROM ticket_systems WHERE id = ?',
            [ticketId]
        );
    } catch (error) {
        console.error('Error getting ticket system by ID:', error);
        return null;
    }
}

/**
 * Delete a ticket system
 * @param {Client} client - Discord client
 * @param {string} ticketId - ID of the ticket system to delete
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function deleteTicketSystem(client, ticketId) {
    try {
        await client.db.run(
            'DELETE FROM ticket_systems WHERE id = ?',
            [ticketId]
        );
        return true;
    } catch (error) {
        console.error('Error deleting ticket system:', error);
        return false;
    }
}

export {
    getTicketSystemsByGuild,
    getTicketSystemById,
    deleteTicketSystem
};
