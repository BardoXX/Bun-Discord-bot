/**
 * Safely handles interaction replies to prevent 'already replied' errors
 * @param {import('discord.js').BaseInteraction} interaction - The interaction to reply to
 * @param {Object} options - The options to pass to the reply
 * @returns {Promise<import('discord.js').Message|void>}
 */
async function handleInteractionReply(interaction, options) {
    try {
        if (interaction.deferred) {
            if (interaction.replied) {
                return await interaction.followUp({
                    ...options,
                    ephemeral: options.ephemeral !== false
                });
            }
            return await interaction.editReply({
                ...options,
                ephemeral: options.ephemeral !== false
            });
        }
        
        if (interaction.replied) {
            return await interaction.followUp({
                ...options,
                ephemeral: options.ephemeral !== false
            });
        }
        
        return await interaction.reply({
            ...options,
            ephemeral: options.ephemeral !== false
        });
    } catch (error) {
        if (error.code === 'INTERACTION_ALREADY_REPLIED' || 
            error.message.includes('already acknowledged') ||
            error.message.includes('already replied')) {
            console.warn('Interaction already handled, could not send additional reply');
            return;
        }
        console.error('Error in handleInteractionReply:', error);
    }
}

/**
 * Defer the reply if not already deferred or replied
 * @param {import('discord.js').BaseInteraction} interaction - The interaction to defer
 * @param {Object} [options] - Options for deferring
 * @param {boolean} [options.ephemeral] - Whether the reply should be ephemeral
 * @returns {Promise<void>}
 */
async function deferReply(interaction, { ephemeral = false } = {}) {
    if (interaction.deferred || interaction.replied) {
        return;
    }
    
    try {
        await interaction.deferReply({ ephemeral });
    } catch (error) {
        console.error('Error in deferReply:', error);
    }
}

export {
    handleInteractionReply,
    deferReply
};
