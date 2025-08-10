// commands/levels/setlevel.js
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setlevel')
        .setDescription('Stel het level van een gebruiker in')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(option =>
            option.setName('gebruiker')
                .setDescription('De gebruiker wiens level je wilt instellen')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Het level om in te stellen')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(1000))
        .addIntegerOption(option =>
            option.setName('xp')
                .setDescription('De huidige XP voor dit level (optioneel)')
                .setRequired(false)
                .setMinValue(0)),

    async execute(interaction) {
        const db = interaction.client.db;
        const targetUser = interaction.options.getUser('gebruiker');
        const level = interaction.options.getInteger('level');
        const xp = interaction.options.getInteger('xp') || 0;
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

        try {
            // Calculate total XP needed for this level
            const totalXP = calculateTotalXPForLevel(level) + xp;
            
            // Check if user exists in database
            const selectStmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?');
            const userData = selectStmt.get(targetUser.id, guildId);

            if (userData) {
                // Update existing user
                const updateStmt = db.prepare(`
                    UPDATE user_levels 
                    SET level = ?, xp = ?, total_xp = ?
                    WHERE user_id = ? AND guild_id = ?
                `);
                updateStmt.run(level, xp, totalXP, targetUser.id, guildId);
            } else {
                // Create new user entry
                const insertStmt = db.prepare(`
                    INSERT INTO user_levels (user_id, guild_id, level, xp, total_xp)
                    VALUES (?, ?, ?, ?, ?)
                `);
                insertStmt.run(targetUser.id, guildId, level, xp, totalXP);
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Level Ingesteld')
                .setDescription(`Level van ${targetUser.displayName} is ingesteld op ${level} met ${xp} XP.`)
                .addFields(
                    { name: 'Gebruiker', value: `${targetUser}`, inline: true },
                    { name: 'Nieuw Level', value: `${level}`, inline: true },
                    { name: 'Huidige XP', value: `${xp}`, inline: true },
                    { name: 'Totaal XP', value: `${totalXP}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('❌ [setlevel] Error setting user level:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het instellen van het level!')
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
