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
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
  } catch {}
  try {
    await interaction.editReply(payload);
  } catch {}
}
