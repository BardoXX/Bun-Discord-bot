// commands/levels/resetlevels.js
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('resetlevels')
        .setDescription('Reset alle levels in de server naar een specifiek level')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addBooleanOption(option =>
            option.setName('bevestigen')
                .setDescription('Bevestig dat je alle levels wilt resetten')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Het level om alle gebruikers op in te stellen (standaard: 0)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(1000)),

    async execute(interaction) {
        const db = interaction.client.db;
        const level = interaction.options.getInteger('level') || 0;
        const confirm = interaction.options.getBoolean('bevestigen');
        const guildId = interaction.guild.id;

        // Check permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Rechten')
                .setDescription('Je hebt geen rechten om deze opdracht uit te voeren!')
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Check confirmation
        if (!confirm) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('⚠️ Bevestiging Vereist')
                .setDescription('Je moet bevestigen dat je alle levels wilt resetten door `bevestigen: true` in te stellen.')
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        try {
            // Calculate total XP needed for this level
            const totalXP = calculateTotalXPForLevel(level);
            
            // Update all users in this guild
            const updateStmt = db.prepare(`
                UPDATE user_levels 
                SET level = ?, xp = 0, total_xp = ?
                WHERE guild_id = ?
            `);
            
            const result = updateStmt.run(level, totalXP, guildId);
            
            // Also insert a default entry for users who don't have one yet if needed
            // This would require a more complex approach, so we'll just update existing records

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Levels Gereset')
                .setDescription(`Alle levels in deze server zijn gereset naar level ${level}.`)
                .addFields(
                    { name: 'Aantal Gebruikers', value: `${result.changes}`, inline: true },
                    { name: 'Nieuw Level', value: `${level}`, inline: true },
                    { name: 'Totaal XP', value: `${totalXP}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('❌ [resetlevels] Error resetting levels:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het resetten van de levels!')
                .setTimestamp();
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    }
};

function calculateTotalXPForLevel(level) {
    // Calculate total XP needed to reach this level
    // Using the formula: total XP = level^2 * 100 + level * 50
    const numLevel = Number(level);
    return Math.floor(Math.pow(numLevel, 2) * 100 + numLevel * 50);
}
