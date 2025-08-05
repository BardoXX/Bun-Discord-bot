// commands/moderatie/clear.js
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Verwijder berichten uit het kanaal')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(option =>
            option.setName('aantal')
                .setDescription('Aantal berichten om te verwijderen (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .addUserOption(option =>
            option.setName('gebruiker')
                .setDescription('Verwijder alleen berichten van deze gebruiker')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('reden')
                .setDescription('Reden voor het verwijderen van berichten')
                .setRequired(false)),

    async execute(interaction) {
        const amount = interaction.options.getInteger('aantal');
        const targetUser = interaction.options.getUser('gebruiker');
        const reason = interaction.options.getString('reden') || 'Geen reden opgegeven';

        await interaction.deferReply({ flags: 64 });

        try {
            // Fetch messages
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            
            let messagesToDelete = Array.from(messages.values());

            // Filter by user if specified
            if (targetUser) {
                messagesToDelete = messagesToDelete.filter(msg => msg.author.id === targetUser.id);
            }

            // Take only the requested amount
            messagesToDelete = messagesToDelete.slice(0, amount);

            // Filter messages that are not older than 14 days (Discord limitation)
            const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            const deletableMessages = messagesToDelete.filter(msg => msg.createdTimestamp > fourteenDaysAgo);

            if (deletableMessages.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚠️ Geen Berichten')
                    .setDescription('Er zijn geen berichten gevonden om te verwijderen (berichten ouder dan 14 dagen kunnen niet worden verwijderd).')
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Delete messages
            let deletedCount = 0;
            
            if (deletableMessages.length === 1) {
                // Delete single message
                await deletableMessages[0].delete();
                deletedCount = 1;
            } else {
                // Bulk delete messages
                const deleted = await interaction.channel.bulkDelete(deletableMessages, true);
                deletedCount = deleted.size;
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🗑️ Berichten Verwijderd')
                .setDescription(`Succesvol **${deletedCount}** berichten verwijderd.`)
                .addFields(
                    { name: '📊 Gevraagd', value: `${amount} berichten`, inline: true },
                    { name: '🗑️ Verwijderd', value: `${deletedCount} berichten`, inline: true },
                    { name: '👤 Gefilterd op gebruiker', value: targetUser ? targetUser.tag : 'Alle gebruikers', inline: false },
                    { name: '📝 Reden', value: reason, inline: false },
                    { name: '👮 Gemoderator', value: interaction.user.tag, inline: true }
                )
                .setFooter({ text: `Clear uitgevoerd door ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Send a temporary message that auto-deletes
            const tempMessage = await interaction.channel.send({
                embeds: [new EmbedBuilder()
                    .setColor('#00ff00')
                    .setDescription(`🗑️ **${deletedCount}** berichten verwijderd door ${interaction.user.tag}`)
                    .setTimestamp()]
            });

            // Delete the temp message after 5 seconds
            setTimeout(async () => {
                try {
                    await tempMessage.delete();
                } catch (error) {
                    // Message might already be deleted
                }
            }, 5000);

        } catch (error) {
            console.error('Error clearing messages:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het verwijderen van berichten. Mogelijk zijn de berichten te oud (>14 dagen) of heb ik onvoldoende permissies.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};