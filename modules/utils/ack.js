// modules/utils/ack.js
// Small helpers to consistently acknowledge interactions fast

export async function ackUpdate(interaction, payload) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
  } catch {}
  try {
    await interaction.editReply(payload);
  } catch {}
}

export async function ackReply(interaction, payload, ephemeral = true) {
  try {
    if (interaction.replied || interaction.deferred) {
      // If already replied or deferred, use followUp instead
      return await interaction.followUp({
        ...payload,
        ephemeral: typeof payload.ephemeral === 'boolean' ? payload.ephemeral : ephemeral
      });
    }
    
    // If not yet replied or deferred, defer the reply
    await interaction.deferReply({ ephemeral });
    
    // If there's a payload to send, edit the deferred reply
    if (payload) {
      return await interaction.editReply(payload);
    }
    
    return null;
  } catch (error) {
    console.error('Error in ackReply:', error);
    try {
      // Fallback to direct reply if defer fails
      if (!interaction.replied) {
        return await interaction.reply({
          ...payload,
          ephemeral: typeof payload?.ephemeral === 'boolean' ? payload.ephemeral : ephemeral,
          fetchReply: true
        });
      }
    } catch (fallbackError) {
      console.error('Fallback reply failed:', fallbackError);
      throw error; // Re-throw the original error if fallback also fails
    }
  }
}
