// commands/levels/level.js
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Bekijk jouw of iemand anders\'s level')
        .addUserOption(option =>
            option.setName('gebruiker')
                .setDescription('De gebruiker waarvan je het level wilt zien')
                .setRequired(false)),

    async execute(interaction) {
        const db = interaction.client.db;
        const targetUser = interaction.options.getUser('gebruiker') || interaction.user;
        const guildId = interaction.guild.id;

        // Check if levels are enabled
        const configStmt = db.prepare('SELECT levels_enabled FROM guild_config WHERE guild_id = ?');
        const config = configStmt.get(guildId);

        if (!config || !config.levels_enabled) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('📊 Level Systeem Uitgeschakeld')
                .setDescription('Het level systeem is niet ingeschakeld op deze server.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Get user's level data
        const stmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?');
        const levelData = stmt.get(targetUser.id, guildId);

        if (!levelData) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('📊 Geen Level Data')
                .setDescription(`${targetUser.displayName} heeft nog geen XP verdiend op deze server.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Calculate XP needed for next level
        const currentLevel = levelData.level;
        const currentXP = levelData.xp;
        const xpForCurrentLevel = calculateXPForLevel(currentLevel);
        const xpForNextLevel = calculateXPForLevel(currentLevel + 1);
        const xpNeeded = xpForNextLevel - levelData.total_xp;
        const xpProgress = currentXP;
        const xpRequired = xpForNextLevel - xpForCurrentLevel;

        // Get server rank
        const rankStmt = db.prepare(`
            SELECT COUNT(*) + 1 as rank 
            FROM user_levels 
            WHERE guild_id = ? AND total_xp > ?
        `);
        const rank = rankStmt.get(guildId, levelData.total_xp).rank;

        // Check for active boosters
        const boosterStmt = db.prepare(`
            SELECT multiplier, expires_at 
            FROM user_boosters 
            WHERE user_id = ? AND guild_id = ? AND active = 1 AND expires_at > datetime('now')
            ORDER BY multiplier DESC
            LIMIT 1
        `);
        const booster = boosterStmt.get(targetUser.id, guildId);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`📊 ${targetUser.displayName}'s Level`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🏆 Level', value: `${currentLevel}`, inline: true },
                { name: '⭐ XP', value: `${currentXP}/${xpRequired}`, inline: true },
                { name: '📈 Rank', value: `#${rank}`, inline: true },
                { name: '💫 Totaal XP', value: `${levelData.total_xp}`, inline: true },
                { name: '🎯 XP Nodig', value: `${xpNeeded}`, inline: true },
                { name: '📊 Voortgang', value: createProgressBar(xpProgress, xpRequired), inline: false }
            )
            .setTimestamp();

        if (booster) {
            const expiresAt = new Date(booster.expires_at);
            embed.addFields({
                name: '⚡ Actieve Booster',
                value: `${booster.multiplier}x XP (verloopt <t:${Math.floor(expiresAt.getTime() / 1000)}:R>)`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};

function calculateXPForLevel(level) {
    // XP formula: level^2 * 100 + level * 50
    return Math.floor(Math.pow(level, 2) * 100 + level * 50);
}

function createProgressBar(current, max) {
    const percentage = Math.max(0, Math.min(100, (current / max) * 100));
    const filledBars = Math.round(percentage / 10);
    const emptyBars = 10 - filledBars;
    
    const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
    return `${progressBar} ${percentage.toFixed(1)}%`;
}