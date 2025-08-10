// events/messageCreate.js
import { safeDbOperation, safeTransaction } from 'commands/utils/database.js';

export default {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot) return;
        
        const db = message.client.db;
        if (!db) return;

        // Check if levels are enabled for this guild
        try {
            const config = safeDbOperation(() => {
                const stmt = db.prepare('SELECT levels_enabled, level_up_channel, xp_per_message, message_cooldown FROM guild_config WHERE guild_id = ?');
                return stmt.get(message.guild.id);
            });

            if (!config || !config.levels_enabled) return;

            await addXPToUser(message.author.id, message.guild.id, db, config, message);
        } catch (error) {
            console.error('❌ [messageCreate] Error processing message for XP:', error);
        }
    }
};

async function addXPToUser(userId, guildId, db, config, message) {
    try {
        const xpToAdd = config.xp_per_message || 20;
        // CONVERT DE BIGINT NAAR EEN GETAL VOORDAT JE VERMENIGVULDIGT
        const cooldown = Number(config.message_cooldown || 60) * 1000; // Convert to milliseconds
        
        // Use safe transaction for all database operations
        const result = safeTransaction(() => {
            const now = new Date();
            
            // Get current user data
            const selectStmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?');
            let userData = selectStmt.get(userId, guildId);
            
            // If user doesn't exist, create them
            if (!userData) {
                const insertStmt = db.prepare(`
                    INSERT INTO user_levels (user_id, guild_id, xp, level, total_xp, last_message)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                insertStmt.run(userId, guildId, xpToAdd, 0, xpToAdd, now.toISOString());
                
                return {
                    newLevel: 0,
                    leveledUp: false,
                    newXP: xpToAdd,
                    newTotalXP: xpToAdd
                };
            }
            
            // Check cooldown
            const lastMessage = new Date(userData.last_message);
            const timeDiff = now - lastMessage;
            
            if (timeDiff < cooldown) {
                return null; // Still in cooldown
            }
            
            // Calculate new values
            const newTotalXP = userData.total_xp + xpToAdd;
            const newCurrentXP = userData.xp + xpToAdd;
            const currentLevel = userData.level;
            
            // Calculate level
            const newLevel = Math.floor(Math.sqrt(newTotalXP / 100));
            const leveledUp = newLevel > currentLevel;
            
            // If leveled up, reset current XP
            const finalCurrentXP = leveledUp ? newCurrentXP - (currentLevel * currentLevel * 100) : newCurrentXP;
            
            // Update database
            const updateStmt = db.prepare(`
                UPDATE user_levels
                SET xp = ?, level = ?, total_xp = ?, last_message = ?
                WHERE user_id = ? AND guild_id = ?
            `);
            updateStmt.run(finalCurrentXP, newLevel, newTotalXP, now.toISOString(), userId, guildId);
            
            return {
                newLevel,
                leveledUp,
                newXP: finalCurrentXP,
                newTotalXP,
                oldLevel: currentLevel
            };
        });
        
        // If no result (cooldown) or no level up, return
        if (!result || !result.leveledUp) return;
        
        // Send level up message if configured
        if (config.level_up_channel) {
            try {
                const levelUpChannel = message.guild.channels.cache.get(config.level_up_channel);
                if (levelUpChannel) {
                    await levelUpChannel.send(`🎉 Gefeliciteerd ${message.author}! Je bent nu **level ${result.newLevel}**!`);
                }
            } catch (error) {
                console.error('❌ [addXPToUser] Error sending level up message:', error);
            }
        }
        
        console.log(`📊 [addXPToUser] ${message.author.tag} leveled up to ${result.newLevel} in ${message.guild.name}`);
        
    } catch (error) {
        console.error('❌ [addXPToUser] Error:', error);
        
        // Enhanced error logging for debugging
        if (error.code === 'SQLITE_BUSY') {
            console.error('❌ [addXPToUser] Database is locked - this should be resolved with the new safe operations');
        }
    }
}

// commands/levels/level.js
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('level')
    .setDescription('Bekijk jouw of iemand anders\'s level')
    .addUserOption(option =>
        option.setName('gebruiker')
            .setDescription('De gebruiker waarvan je het level wilt zien')
            .setRequired(false));

export async function execute(interaction) {
    const db = interaction.client.db;
    const targetUser = interaction.options.getUser('gebruiker') || interaction.user;
    const guildId = interaction.guild.id;

    // Check if levels are enabled and get embed customization settings
    const configStmt = db.prepare('SELECT levels_enabled, level_embed_image, level_embed_footer, level_embed_color FROM guild_config WHERE guild_id = ?');
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

    // Apply guild-specific embed customization if available, otherwise use defaults
    if (config.level_embed_color) {
        embed.setColor(config.level_embed_color);
    } else {
        embed.setColor('#00ff00');
    }

    if (config.level_embed_image) {
        embed.setImage(config.level_embed_image);
    }

    if (config.level_embed_footer) {
        embed.setFooter({ text: config.level_embed_footer });
    }

    if (booster) {
        const expiresAt = new Date(booster.expires_at);
        embed.addFields({
            name: '⚡ Actieve Booster',
            value: `${booster.multiplier}x XP (verloopt <t:${Math.floor(expiresAt.getTime() / 1000)}:R>)`,
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed] });
}

function calculateXPForLevel(level) {
    // CONVERT DE BIGINT NAAR EEN GETAL VOORDAT JE VERMENIGVULDIGT
    const numLevel = Number(level);
    // XP formula: level^2 * 100 + level * 50
    return Math.floor(Math.pow(numLevel, 2) * 100 + numLevel * 50);
}

function createProgressBar(current, max) {
    const percentage = Math.max(0, Math.min(100, (current / max) * 100));
    const filledBars = Math.round(percentage / 10);
    const emptyBars = 10 - filledBars;
    
    const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
    return `${progressBar} ${percentage.toFixed(1)}%`;
}
