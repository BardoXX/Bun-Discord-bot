// events/messageCreate.js
import { safeDbOperation, safeTransaction } from '../commands/utils/database.js';
import { handleCountingMessage } from './countingHelper.js';

export default {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot) return;

        const db = message.client.db;
        if (!db) return;

        try {
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