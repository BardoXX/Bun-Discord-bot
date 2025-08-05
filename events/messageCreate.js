// events/messageCreate.js - For XP from messages
import { EmbedBuilder } from 'discord.js';

export default {
    name: 'messageCreate',
    async execute(message) {
        // Ignore bots and system messages
        if (message.author.bot || !message.guild) return;

        const db = message.client.db;
        const userId = message.author.id;
        const guildId = message.guild.id;

        try {
            // Check if levels are enabled
            const configStmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
            const config = configStmt.get(guildId);

            if (!config || !config.levels_enabled) return;

            // Check cooldown
            const cooldown = config.message_cooldown || 60;
            const lastMessageStmt = db.prepare('SELECT last_message FROM user_levels WHERE user_id = ? AND guild_id = ?');
            const lastMessage = lastMessageStmt.get(userId, guildId);

            if (lastMessage) {
                const lastMessageTime = new Date(lastMessage.last_message);
                const now = new Date();
                const timeDiff = (now - lastMessageTime) / 1000;

                if (timeDiff < cooldown) return; // Still in cooldown
            }

            // Calculate XP to give
            const baseXP = config.xp_per_message || 20;
            const randomXP = Math.floor(Math.random() * 11) - 5; // -5 to +5
            let xpToGive = Math.max(1, baseXP + randomXP);

            // Check for active boosters
            const boosterStmt = db.prepare(`
                SELECT multiplier 
                FROM user_boosters 
                WHERE user_id = ? AND guild_id = ? AND active = 1 AND expires_at > datetime('now')
                ORDER BY multiplier DESC
                LIMIT 1
            `);
            const booster = boosterStmt.get(userId, guildId);

            if (booster) {
                xpToGive = Math.floor(xpToGive * booster.multiplier);
            }

            // Add XP to user
            await addXPToUser(db, userId, guildId, xpToGive, message, config.level_up_channel);

        } catch (error) {
            console.error('❌ [messageCreate] Error processing XP:', error);
        }
    },
};

async function addXPToUser(db, userId, guildId, xpToGive, message, levelUpChannelId) {
    try {
        // Get current user data
        const stmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?');
        let userData = stmt.get(userId, guildId);

        if (!userData) {
            // Create new user entry
            const insertStmt = db.prepare(`
                INSERT INTO user_levels (user_id, guild_id, xp, level, total_xp, last_message)
                VALUES (?, ?, ?, 0, ?, datetime('now'))
            `);
            insertStmt.run(userId, guildId, xpToGive, xpToGive);
            return;
        }

        const currentLevel = userData.level;
        const newTotalXP = userData.total_xp + xpToGive;
        const newLevel = calculateLevelFromXP(newTotalXP);
        const xpForCurrentLevel = calculateXPForLevel(newLevel);
        const newCurrentXP = newTotalXP - xpForCurrentLevel;

        // Update user data
        const updateStmt = db.prepare(`
            UPDATE user_levels 
            SET xp = ?, level = ?, total_xp = ?, last_message = datetime('now')
            WHERE user_id = ? AND guild_id = ?
        `);
        updateStmt.run(newCurrentXP, newLevel, newTotalXP, userId, guildId);

        // Check if user leveled up
        if (newLevel > currentLevel) {
            await handleLevelUp(message, userId, newLevel, levelUpChannelId);
        }

    } catch (error) {
        console.error('❌ [addXPToUser] Error:', error);
    }
}

async function handleLevelUp(message, userId, newLevel, levelUpChannelId) {
    try {
        const user = await message.client.users.fetch(userId);
        
        const embed = new EmbedBuilder()
            .setColor('#ffd700')
            .setTitle('🎉 Level Up!')
            .setDescription(`${user.displayName} heeft level **${newLevel}** bereikt!`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        let channelToSend = message.channel;
        
        if (levelUpChannelId) {
            try {
                channelToSend = await message.client.channels.fetch(levelUpChannelId);
            } catch (error) {
                console.error('❌ [handleLevelUp] Could not fetch level up channel:', error);
            }
        }

        await channelToSend.send({ embeds: [embed] });

    } catch (error) {
        console.error('❌ [handleLevelUp] Error:', error);
    }
}

function calculateLevelFromXP(totalXP) {
    let level = 0;
    while (calculateXPForLevel(level + 1) <= totalXP) {
        level++;
    }
    return level;
}

function calculateXPForLevel(level) {
    return Math.floor(Math.pow(level, 2) * 100 + level * 50);
}