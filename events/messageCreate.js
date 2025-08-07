// events/messageCreate.js
import { safeDbOperation, safeTransaction } from '../commands/utils/database.js';
import { handleCountingMessage } from './countingHelper.js';

// Cache for spam detection
const spamCache = new Map();

export default {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot) return;

        const db = message.client.db;
        if (!db) return;

        try {
            // Handle anti-invite
            await handleAntiInvite(message, db);
            
            // Handle anti-spam
            await handleAntiSpam(message, db);
            
            // Handle counting game
            await handleCountingMessage(message);
            

            const config = safeDbOperation(() => {
                const stmt = db.prepare('SELECT levels_enabled, level_up_channel, xp_per_message, message_cooldown FROM guild_config WHERE guild_id = ?');
                return stmt.get(message.guild.id);
            });

            if (config && config.levels_enabled) {
                await addXPToUser(message.author.id, message.guild.id, db, config, message);
            }
            
        } catch (error) {
            console.error('❌ [messageCreate] Error processing message:', error);
        }
    }
};

// Anti-invite handler
async function handleAntiInvite(message, db) {
    try {
        // Get guild config
        const config = safeDbOperation(() => {
            const stmt = db.prepare('SELECT anti_invite_enabled, anti_invite_default_state, anti_invite_channels, anti_invite_exempt_channels, anti_invite_exempt_roles FROM guild_config WHERE guild_id = ?');
            return stmt.get(message.guild.id);
        });
        
        // If anti-invite is not enabled, skip
        if (!config || !config.anti_invite_enabled) return;
        
        // Check if user is exempt
        const exemptRoles = config.anti_invite_exempt_roles ? JSON.parse(config.anti_invite_exempt_roles) : [];
        const isExemptByRole = message.member.roles.cache.some(role => exemptRoles.includes(role.id));
        if (isExemptByRole) return;
        
        // Check if channel is exempt
        const exemptChannels = config.anti_invite_exempt_channels ? JSON.parse(config.anti_invite_exempt_channels) : [];
        if (exemptChannels.includes(message.channel.id)) return;
        
        // Check if channel is specifically included (if any are specified)
        const specificChannels = config.anti_invite_channels ? JSON.parse(config.anti_invite_channels) : [];
        if (specificChannels.length > 0 && !specificChannels.includes(message.channel.id)) {
            // If specific channels are set, only apply to those channels
            return;
        }
        
        // Check for Discord invite links
        const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[\w\d]{2,}/gi;
        if (inviteRegex.test(message.content)) {
            // Delete the message
            try {
                await message.delete();
                
                // Send warning message
                const warnMsg = await message.channel.send({
                    content: `${message.author}, het plaatsen van invite links is niet toegestaan!`,
                    allowedMentions: { repliedUser: true }
                });
                
                // Delete warning after 5 seconds
                setTimeout(() => {
                    warnMsg.delete().catch(() => {});
                }, 5000);
            } catch (error) {
                console.warn(`[AntiInvite] Could not delete message or send warning: ${error.message}`);
            }
        }
    } catch (error) {
        console.error('❌ [AntiInvite] Error handling anti-invite:', error);
    }
}

// Anti-spam handler
async function handleAntiSpam(message, db) {
    try {
        // Get guild config
        const config = safeDbOperation(() => {
            const stmt = db.prepare('SELECT anti_spam_enabled, anti_spam_default_state, anti_spam_channels, anti_spam_exempt_channels, anti_spam_exempt_roles, anti_spam_message_threshold, anti_spam_time_window FROM guild_config WHERE guild_id = ?');
            return stmt.get(message.guild.id);
        });
        
        // If anti-spam is not enabled, skip
        if (!config || !config.anti_spam_enabled) return;
        
        // Check if user is exempt
        const exemptRoles = config.anti_spam_exempt_roles ? JSON.parse(config.anti_spam_exempt_roles) : [];
        const isExemptByRole = message.member.roles.cache.some(role => exemptRoles.includes(role.id));
        if (isExemptByRole) return;
        
        // Check if channel is exempt
        const exemptChannels = config.anti_spam_exempt_channels ? JSON.parse(config.anti_spam_exempt_channels) : [];
        if (exemptChannels.includes(message.channel.id)) return;
        
        // Check if channel is specifically included (if any are specified)
        const specificChannels = config.anti_spam_channels ? JSON.parse(config.anti_spam_channels) : [];
        if (specificChannels.length > 0 && !specificChannels.includes(message.channel.id)) {
            // If specific channels are set, only apply to those channels
            return;
        }
        
        // Get spam settings
        const threshold = Number(config.anti_spam_message_threshold) || 5;
        const timeWindow = (Number(config.anti_spam_time_window) || 5) * 1000; // Convert to milliseconds
        
        // Get user's message history
        const userId = message.author.id;
        const channelId = message.channel.id;
        const cacheKey = `${userId}-${channelId}`;
        
        let userMessages = spamCache.get(cacheKey) || [];
        const now = Date.now();
        
        // Remove old messages outside the time window
        userMessages = userMessages.filter(timestamp => now - timestamp < timeWindow);
        
        // Add current message
        userMessages.push(now);
        spamCache.set(cacheKey, userMessages);
        
        // Clean up cache periodically
        if (spamCache.size > 1000) {
            const keysToDelete = [];
            for (const [key, timestamps] of spamCache.entries()) {
                const recentMessages = timestamps.filter(timestamp => now - timestamp < timeWindow);
                if (recentMessages.length === 0) {
                    keysToDelete.push(key);
                } else {
                    spamCache.set(key, recentMessages);
                }
            }
            for (const key of keysToDelete) {
                spamCache.delete(key);
            }
        }
        
        // Check if user is spamming
        if (userMessages.length >= threshold) {
            // Delete recent messages
            try {
                // Delete the spam messages
                await message.delete();
                
                // Send warning message
                const warnMsg = await message.channel.send({
                    content: `${message.author}, stop met spammen!`,
                    allowedMentions: { repliedUser: true }
                });
                
                // Delete warning after 5 seconds
                setTimeout(() => {
                    warnMsg.delete().catch(() => {});
                }, 5000);
            } catch (error) {
                console.warn(`[AntiSpam] Could not delete message or send warning: ${error.message}`);
            }
        }
    } catch (error) {
        console.error('❌ [AntiSpam] Error handling anti-spam:', error);
    }
}

async function addXPToUser(userId, guildId, db, config, message) {
    try {
        const xpToAdd = config.xp_per_message || 20;
        const cooldown = Number(config.message_cooldown || 60) * 1000; 
        

        const result = safeTransaction(() => {
            const now = new Date();
            
            const selectStmt = db.prepare('SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?');
            let userData = selectStmt.get(userId, guildId);
            
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
            
            const lastMessage = new Date(userData.last_message);
            const timeDiff = now - lastMessage;
            
            if (timeDiff < cooldown) {
                return null; 
            }
            

            const newTotalXP = userData.total_xp + xpToAdd;
            const newCurrentXP = userData.xp + xpToAdd;
            const currentLevel = userData.level;
            
            const newLevel = Math.floor(Math.sqrt(Number(newTotalXP) / 100));
            const leveledUp = newLevel > currentLevel;
            
            const finalCurrentXP = leveledUp ? newCurrentXP - (BigInt(currentLevel) * BigInt(currentLevel) * BigInt(100)) : newCurrentXP;
            
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
        
        if (!result || !result.leveledUp) return;
        
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
        
        if (error.code === 'SQLITE_BUSY') {
            console.error('❌ [addXPToUser] Database is locked - this should be resolved with the new safe operations');
        }
    }
}