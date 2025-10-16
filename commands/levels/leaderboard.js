// commands/levels/leaderboard.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Bekijk de level en invite leaderboard')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type leaderboard')
                .setRequired(false)
                .addChoices(
                    { name: 'Beide', value: 'both' },
                    { name: 'Levels', value: 'levels' },
                    { name: 'Invites', value: 'invites' }
                )),

    async execute(interaction) {
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const type = interaction.options.getString('type') || 'both';

        if (type === 'levels') {
            await showLevelLeaderboard(interaction, db, guildId);
        } else if (type === 'invites') {
            await showInviteLeaderboard(interaction, db, guildId);
        } else {
            await showCombinedLeaderboard(interaction, db, guildId);
        }
    },
};

async function showLevelLeaderboard(interaction, db, guildId) {
    let config = null;
    try {
        const configStmt = db.prepare('SELECT levels_enabled FROM guild_config WHERE guild_id = ?');
        config = configStmt.get(guildId) || null;
    } catch (e) {
        config = null;
    }

    if (config && config.levels_enabled === 0) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('Level Systeem Uitgeschakeld')
            .setDescription('Het level systeem is niet ingeschakeld op deze server.')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
    }

    // Get top 10 users by total XP
    const stmt = db.prepare(`
        SELECT user_id, level, total_xp, xp
        FROM user_levels 
        WHERE guild_id = ? 
        ORDER BY total_xp DESC 
        LIMIT 10
    `);
    const topUsers = stmt.all(guildId);

    if (!topUsers || topUsers.length === 0) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('Geen Level Data')
            .setDescription('Er zijn nog geen gebruikers met XP op deze server.')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle('Level Leaderboard')
        .setDescription('Top 10 gebruikers op deze server')
        .setTimestamp();

    let leaderboardText = '';
    for (let i = 0; i < topUsers.length; i++) {
        const userData = topUsers[i];
        try {
            const user = await interaction.client.users.fetch(userData.user_id);
            const medal = i === 0 ? ' ' : i === 1 ? ' ' : i === 2 ? ' ' : `**${i + 1}.**`;
            leaderboardText += `${medal} ${user.displayName} - Level ${userData.level} (${userData.total_xp} XP)\n`;
        } catch (error) {
            leaderboardText += `${i + 1}. Onbekende Gebruiker - Level ${userData.level} (${userData.total_xp} XP)\n`;
        }
    }

    embed.addFields({
        name: 'Rankings',
        value: leaderboardText,
        inline: false
    });

    // Add user's own rank if not in top 10
    const userRankStmt = db.prepare(`
        SELECT COUNT(*) + 1 as rank 
        FROM user_levels 
        WHERE guild_id = ? AND total_xp > (
            SELECT COALESCE(total_xp, 0) 
            FROM user_levels 
            WHERE user_id = ? AND guild_id = ?
        )
    `);
    const userRank = userRankStmt.get(guildId, interaction.user.id, guildId).rank;

    if (userRank > 10) {
        const userDataStmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?');
        const userData = userDataStmt.get(interaction.user.id, guildId);
        
        if (userData) {
            embed.addFields({
                name: 'Jouw Positie',
                value: `#${userRank} - Level ${userData.level} (${userData.total_xp} XP)`,
                inline: false
            });
        }
    }

    await interaction.reply({ embeds: [embed] });
}

async function showInviteLeaderboard(interaction, db, guildId) {
    // Check if invites are enabled; if config missing, treat as disabled only when explicitly 0
    let config = null;
    try {
        const stmt = db.prepare('SELECT invites_enabled FROM guild_config WHERE guild_id = ?');
        config = stmt.get(guildId) || null;
    } catch (e) {
        config = null;
    }

    if (config && config.invites_enabled === 0) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('📨 Invite Tracking Uitgeschakeld')
            .setDescription('Invite tracking is niet ingeschakeld op deze server.')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
    }

    const stmt = db.prepare(`
        SELECT user_id, invites, fake_invites, left_invites
        FROM user_invites 
        WHERE guild_id = ? 
        ORDER BY invites DESC 
        LIMIT 10
    `);
    const topInviters = stmt.all(guildId);

    if (!topInviters || topInviters.length === 0) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('📨 Geen Invite Data')
            .setDescription('Er zijn nog geen invite statistieken beschikbaar.')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📨 Invite Leaderboard')
        .setDescription('Top 10 inviters op deze server')
        .setTimestamp();

    let leaderboardText = '';
    for (let i = 0; i < topInviters.length; i++) {
        const inviteData = topInviters[i];
        try {
            const user = await interaction.client.users.fetch(inviteData.user_id);
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
            const realInvites = inviteData.invites - inviteData.fake_invites - inviteData.left_invites;
            leaderboardText += `${medal} ${user.displayName} - ${realInvites} invites (${inviteData.invites} totaal)\n`;
        } catch (error) {
            const realInvites = inviteData.invites - inviteData.fake_invites - inviteData.left_invites;
            leaderboardText += `${i + 1}. Onbekende Gebruiker - ${realInvites} invites\n`;
        }
    }

    embed.addFields({
        name: '🏅 Top Inviters',
        value: leaderboardText,
        inline: false
    });

    await interaction.reply({ embeds: [embed] });
}

async function showCombinedLeaderboard(interaction, db, guildId) {
    let config = null;
    try {
        const configStmt = db.prepare('SELECT levels_enabled, invites_enabled FROM guild_config WHERE guild_id = ?');
        config = configStmt.get(guildId) || null;
    } catch (e) {
        config = null;
    }

    if (config && config.levels_enabled === 0 && config.invites_enabled === 0) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('Leaderboard Systeem Uitgeschakeld')
            .setDescription('Geen leaderboard systemen zijn ingeschakeld op deze server.')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor('#800080')
        .setTitle('🏆 Server Leaderboards')
        .setDescription('Top gebruikers op deze server')
        .setTimestamp();

    // Get level leaderboard config (default to enabled if missing)
    let levelConfig = null;
    try {
        const levelConfigStmt = db.prepare('SELECT levels_enabled FROM guild_config WHERE guild_id = ?');
        levelConfig = levelConfigStmt.get(guildId) || null;
    } catch (e) {
        levelConfig = null;
    }

    // Get invite leaderboard config
    let inviteConfig = null;
    try {
        const inviteConfigStmt = db.prepare('SELECT invites_enabled FROM guild_config WHERE guild_id = ?');
        inviteConfig = inviteConfigStmt.get(guildId) || null;
    } catch (e) {
        inviteConfig = null;
    }

    let hasData = false;

    // Show level leaderboard if enabled
    if (!levelConfig || levelConfig.levels_enabled) {
        const levelStmt = db.prepare(`
            SELECT user_id, level, total_xp
            FROM user_levels 
            WHERE guild_id = ? 
            ORDER BY total_xp DESC 
            LIMIT 5
        `);
        const topLevelUsers = levelStmt.all(guildId);

        if (topLevelUsers && topLevelUsers.length > 0) {
            hasData = true;
            let levelText = '';
            for (let i = 0; i < topLevelUsers.length; i++) {
                const userData = topLevelUsers[i];
                try {
                    const user = await interaction.client.users.fetch(userData.user_id);
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    levelText += `${medal} ${user.displayName} - Lvl ${userData.level} (${userData.total_xp} XP)\n`;
                } catch (error) {
                    levelText += `${i + 1}. Onbekende Gebruiker - Lvl ${userData.level} (${userData.total_xp} XP)\n`;
                }
            }

            embed.addFields({
                name: '📊 Top Levels',
                value: levelText,
                inline: true
            });
        }
    }

    // Show invite leaderboard if enabled
    if (inviteConfig && inviteConfig.invites_enabled) {
        const inviteStmt = db.prepare(`
            SELECT user_id, invites, fake_invites, left_invites
            FROM user_invites 
            WHERE guild_id = ? 
            ORDER BY invites DESC 
            LIMIT 5
        `);
        const topInviters = inviteStmt.all(guildId);

        if (topInviters && topInviters.length > 0) {
            hasData = true;
            let inviteText = '';
            for (let i = 0; i < topInviters.length; i++) {
                const inviteData = topInviters[i];
                try {
                    const user = await interaction.client.users.fetch(inviteData.user_id);
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    const realInvites = inviteData.invites - inviteData.fake_invites - inviteData.left_invites;
                    inviteText += `${medal} ${user.displayName} - ${realInvites} invites\n`;
                } catch (error) {
                    const realInvites = inviteData.invites - inviteData.fake_invites - inviteData.left_invites;
                    inviteText += `${i + 1}. Onbekende Gebruiker - ${realInvites} invites\n`;
                }
            }

            embed.addFields({
                name: '📨 Top Invites',
                value: inviteText,
                inline: true
            });
        }
    }

    // Handle case where neither system is enabled or no data
    if (!hasData) {
        if ((!levelConfig || !levelConfig.levels_enabled) && (!inviteConfig || !inviteConfig.invites_enabled)) {
            embed.setDescription('Geen leaderboard systemen zijn ingeschakeld op deze server.')
                .setColor('#ff9900');
        } else {
            embed.setDescription('Er is nog geen data beschikbaar voor de leaderboards.')
                .setColor('#ff9900');
        }
        
        await interaction.reply({ embeds: [embed] });
        return;
    }

    await interaction.reply({ embeds: [embed] });
}