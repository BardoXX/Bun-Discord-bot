// events/voiceStateUpdate.js
import { EmbedBuilder } from 'discord.js';

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const db = newState.client.db;
        const userId = newState.member.id;
        const guildId = newState.guild.id;

        try {
            // Get guild configuration
            const configStmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
            const config = configStmt.get(guildId);

            // Handle voice XP tracking if levels are enabled
            if (config && config.levels_enabled) {
                await handleVoiceXPTracking(oldState, newState, db, config);
            }

            // Update member count channel if configured
            if (config && config.member_count_channel) {
                await updateMemberCountChannel(newState, config);
            }

        } catch (error) {
            console.error('❌ [voiceStateUpdate] Error:', error);
        }
    },
};

async function handleVoiceXPTracking(oldState, newState, db, config) {
    const userId = newState.member.id;
    const guildId = newState.guild.id;
    const xpPerMinute = config.xp_per_minute_voice || 5;

    // User joined a voice channel
    if (!oldState.channelId && newState.channelId) {
        await handleVoiceJoin(db, userId, guildId, newState.channelId);
    }
    // User left a voice channel
    else if (oldState.channelId && !newState.channelId) {
        await handleVoiceLeave(db, userId, guildId, xpPerMinute, newState, config.level_up_channel);
    }
    // User switched channels
    else if (oldState.channelId !== newState.channelId && newState.channelId) {
        await handleVoiceLeave(db, userId, guildId, xpPerMinute, newState, config.level_up_channel);
        await handleVoiceJoin(db, userId, guildId, newState.channelId);
    }
}

async function handleVoiceJoin(db, userId, guildId, channelId) {
    try {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO voice_activity (user_id, guild_id, channel_id, joined_at)
            VALUES (?, ?, ?, datetime('now'))
        `);
        stmt.run(userId, guildId, channelId);
        console.log(`🎤 [voice] User ${userId} joined voice channel ${channelId}`);
    } catch (error) {
        console.error('❌ [handleVoiceJoin] Error:', error);
    }
}

async function handleVoiceLeave(db, userId, guildId, xpPerMinute, newState, levelUpChannelId) {
    try {
        const stmt = db.prepare('SELECT * FROM voice_activity WHERE user_id = ? AND guild_id = ?');
        const activity = stmt.get(userId, guildId);

        if (!activity) return;

        // Calculate time spent in voice
        const joinedAt = new Date(activity.joined_at);
        const leftAt = new Date();
        const minutesSpent = Math.floor((leftAt - joinedAt) / (1000 * 60));

        // Remove from voice activity table
        const deleteStmt = db.prepare('DELETE FROM voice_activity WHERE user_id = ? AND guild_id = ?');
        deleteStmt.run(userId, guildId);

        // Only give XP if spent at least 1 minute
        if (minutesSpent >= 1) {
            let xpToGive = minutesSpent * xpPerMinute;

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

            console.log(`🎤 [voice] User ${userId} earned ${xpToGive} XP for ${minutesSpent} minutes in voice`);
            await addVoiceXPToUser(db, userId, guildId, xpToGive, newState, levelUpChannelId);
        }

    } catch (error) {
        console.error('❌ [handleVoiceLeave] Error:', error);
    }
}

async function addVoiceXPToUser(db, userId, guildId, xpToGive, newState, levelUpChannelId) {
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
            SET xp = ?, level = ?, total_xp = ?
            WHERE user_id = ? AND guild_id = ?
        `);
        updateStmt.run(newCurrentXP, newLevel, newTotalXP, userId, guildId);

        // Check if user leveled up
        if (newLevel > currentLevel) {
            await handleVoiceLevelUp(newState, userId, newLevel, levelUpChannelId);
        }

    } catch (error) {
        console.error('❌ [addVoiceXPToUser] Error:', error);
    }
}

async function handleVoiceLevelUp(newState, userId, newLevel, levelUpChannelId) {
    try {
        const user = await newState.client.users.fetch(userId);
        
        const embed = new EmbedBuilder()
            .setColor('#ffd700')
            .setTitle('🎉 Level Up!')
            .setDescription(`${user.displayName} heeft level **${newLevel}** bereikt! (Voice XP)`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        let channelToSend = null;
        
        if (levelUpChannelId) {
            try {
                channelToSend = await newState.client.channels.fetch(levelUpChannelId);
            } catch (error) {
                console.error('❌ [handleVoiceLevelUp] Could not fetch level up channel:', error);
            }
        }

        // If no level up channel is set or can't be fetched, try to send to general channel
        if (!channelToSend) {
            try {
                const guild = newState.guild;
                channelToSend = guild.channels.cache.find(channel => 
                    channel.type === 0 && 
                    (channel.name.includes('general') || channel.name.includes('chat')) &&
                    channel.permissionsFor(guild.members.me).has('SendMessages')
                );
            } catch (error) {
                console.error('❌ [handleVoiceLevelUp] Could not find suitable channel:', error);
            }
        }

        if (channelToSend) {
            await channelToSend.send({ embeds: [embed] });
        }

    } catch (error) {
        console.error('❌ [handleVoiceLevelUp] Error:', error);
    }
}

async function updateMemberCountChannel(newState, config) {
    try {
        const channel = await newState.client.channels.fetch(config.member_count_channel);
        const memberCount = newState.guild.memberCount;
        const format = config.member_count_format || 'Leden: {count}';
        const channelName = format.replace('{count}', memberCount);

        // Only update if the name is different (to avoid rate limits)
        if (channel.name !== channelName) {
            await channel.setName(channelName);
            console.log(`👥 [memberCount] Updated channel name to: ${channelName}`);
        }
    } catch (error) {
        console.error('❌ [updateMemberCountChannel] Error:', error);
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