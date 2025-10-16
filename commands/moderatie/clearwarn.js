// commands/moderatie/clearwarn.js
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clearwarn')
        .setDescription('Verwijder een warning van een gebruiker')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option.setName('gebruiker')
                .setDescription('De gebruiker wiens warning je wil verwijderen')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('warning_id')
                .setDescription('Het ID van de warning die je wil verwijderen')
                .setRequired(true)),

    async execute(interaction) {
        const db = interaction.client.db;
        await interaction.deferReply({ ephemeral: true });

        const target = interaction.options.getUser('gebruiker');
        const warningId = interaction.options.getInteger('warning_id');
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);

        if (!member) {
            return interaction.editReply({ content: '❌ Deze gebruiker is niet gevonden in de server.' });
        }

        // Controleer of de warning bestaat en van deze gebruiker is
        const warning = db.prepare(`
            SELECT id, reason, moderator_id, timestamp
            FROM warnings
            WHERE id = ? AND guild_id = ? AND user_id = ?
        `).get(warningId, interaction.guild.id, target.id);

        if (!warning) {
            return interaction.editReply({
                content: `❌ Warning #${warningId} niet gevonden voor ${target.tag}, of deze warning is al verlopen/verwijderd.`
            });
        }

        // Verwijder de warning
        const result = db.prepare(`
            DELETE FROM warnings
            WHERE id = ? AND guild_id = ? AND user_id = ?
        `).run(warningId, interaction.guild.id, target.id);

        if (result.changes === 0) {
            return interaction.editReply({
                content: `❌ Kon warning #${warningId} niet verwijderen. Mogelijk is deze al verlopen.`
            });
        }

        // Maak log embed voor het kanaal
        const logEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🗑️ Warning Verwijderd')
            .addFields(
                { name: '👤 Gebruiker', value: `${target.tag} (${target.id})`, inline: true },
                { name: '👮 Moderator', value: interaction.user.tag, inline: true },
                { name: '📄 Warning ID', value: `#${warningId}`, inline: true },
                { name: '📝 Oorspronkelijke Reden', value: warning.reason, inline: false }
            )
            .setTimestamp();

        // Verstuur log naar het kanaal waar het commando is uitgevoerd
        await interaction.channel.send({ embeds: [logEmbed] });

        // Bevestiging naar moderator
        await interaction.editReply({
            content: `✅ Warning #${warningId} is verwijderd voor ${target.tag}.`
        });
    }
};
