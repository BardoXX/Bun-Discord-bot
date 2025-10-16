// events/messageCreate.js
import { safeDbOperation, safeTransaction } from '../commands/utils/database.js';
import { handleCountingMessage } from './countingHelper.js';
import { generateReply } from '../modules/ai/aiClient.js';
import { decryptString } from '../modules/ai/secretUtil.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getTicketConfig } from '../commands/tickets/ticketUtils.js';
import { createTicketChannel } from '../commands/tickets/ticketUtils.js';

// Cache for spam detection
const spamCache = new Map();
// Cooldown cache for AI replies
const aiCooldowns = new Map(); // key: guildId:channelId:userId => timestamp(ms)

// AI auto-responder implementation (module scope)
async function maybeHandleAIReply(message, db) {
    try {
        const normalizeBool = (v, def = false) => {
            try {
                if (v === null || v === undefined) return def;
                if (typeof v === 'boolean') return v;
                if (typeof v === 'number') return v > 0;
                if (typeof v === 'string') {
                    const s = v.trim().toLowerCase();
                    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
                    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
                    return def;
                }
                return Boolean(v);
            } catch (e) {
                console.error('Error normalizing boolean value:', e);
                return def;
            }
        };

        const config = await getTicketConfig(db, message.guild.id);
        if (!config || !config.ai_enabled) return false;

        // Check if AI is enabled for this channel
        const channelConfig = config.channel_overrides?.[message.channelId] || {};
        const aiEnabled = normalizeBool(channelConfig.ai_enabled, true);
        if (!aiEnabled) return false;

        // Check if the message is from a bot or is a command
        if (message.author.bot || message.content.startsWith('!')) return false;

        // Check cooldown
        const cooldownKey = `${message.guildId}:${message.channelId}:${message.author.id}`;
        const lastReply = aiCooldowns.get(cooldownKey) || 0;
        const cooldownTime = (channelConfig.ai_cooldown || 5) * 60 * 1000; // Default 5 minutes
        
        if (Date.now() - lastReply < cooldownTime) {
            return false;
        }

        // Check if the bot is mentioned or if it's a reply to the bot
        const isMentioned = message.mentions.users.has(message.client.user.id);
        const isReplyToBot = message.reference && 
                           message.reference.messageId && 
                           message.channel.messages.cache.get(message.reference.messageId)?.author.id === message.client.user.id;

        if (!isMentioned && !isReplyToBot) {
            // If not mentioned and not a reply, check if we should reply randomly
            const replyChance = parseFloat(channelConfig.ai_reply_chance || '0.1');
            if (Math.random() > replyChance) {
                return false;
            }
        }

        // Generate and send the reply
        await message.channel.sendTyping();
        const reply = await generateReply(message, db, config);
        if (reply) {
            await message.reply(reply);
            aiCooldowns.set(cooldownKey, Date.now());
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error in AI reply handler:', error);
        return false;
    }
}

export default {
    name: 'messageCreate',
    once: false,

    async execute(message) {
        if (message.author.bot) return;

        const db = message.client.db;
        if (!db) return;

        try {
            // Handle counting game
            await handleCountingMessage(message);

            // Handle anti-invite
            // Handle anti-spam
            await handleAntiSpam(message, db);

            // Add XP for message
            const config = safeDbOperation(() => {
                const stmt = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?");
                return stmt.get(message.guild.id);
            });
            if (config && config.levels_enabled) {
                await addXPToUser(message.author.id, message.guild.id, db, config, message);
            }

            // Handle AI replies
            await maybeHandleAIReply(message, db);

        } catch (error) {
            console.error('Error in messageCreate event:', error);
        }
    }
};

/**
 * Handle ticket creation via command
 */
async function handleTicketCommand(message, ticketType, db) {
    try {
        const config = safeDbOperation(() => {
            const stmt = db.prepare(`
                SELECT * FROM ticket_config
                WHERE guild_id = ? AND (command_enabled = 1 OR command_enabled IS NULL)
            `);
            return stmt.get(message.guild.id);
        });

        if (!config) {
            return message.reply('Ticket system is not configured for this server.');
        }

        // Check if ticket type exists and is enabled
        const ticketConfig = safeDbOperation(() => {
            const stmt = db.prepare(`
                SELECT * FROM ticket_types
                WHERE guild_id = ? AND name = ? AND enabled = 1
            `);
            return stmt.get(message.guild.id, ticketType);
        });

        if (!ticketConfig) {
            const availableTypes = safeDbOperation(() => {
                const stmt = db.prepare(`
                    SELECT name FROM ticket_types
                    WHERE guild_id = ? AND enabled = 1
                `);
                return stmt.all(message.guild.id);
            });

            const typesList = availableTypes.length > 0
                ? `Available types: ${availableTypes.map(t => `\`${t.name}\``).join(', ')}`
                : 'No ticket types are currently available.';

            return message.reply(`Invalid ticket type. ${typesList}`);
        }

        // Check if user has any open tickets of this type
        const existingTicket = safeDbOperation(() => {
            const stmt = db.prepare(`
                SELECT channel_id FROM tickets
                WHERE guild_id = ? AND creator_id = ? AND type = ? AND status = 'open'
            `);
            return stmt.get(message.guild.id, message.author.id, ticketType);
        });

        if (existingTicket) {
            return message.reply(`You already have an open ticket of this type: <#${existingTicket.channel_id}>`);
        }

        // Create the ticket using the ticket system utility
        const interaction = {
            guild: message.guild,
            user: message.author,
            member: message.member,
            reply: message.reply.bind(message),
            channel: message.channel
        };
        
        const result = await createTicketChannel(interaction, ticketType);
        
        if (!result.success) {
            return message.reply(result.message || 'Failed to create ticket. Please try again later.');
        }
        
        const ticketChannel = result.channel;

        // The ticket is already saved in the database by createTicketChannel
        // Send ticket message
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`Ticket: ${ticketConfig.display_name || ticketType}`)
            .setDescription(ticketConfig.welcome_message || 'Please describe your issue and a staff member will assist you shortly.')
            .addFields(
                { name: 'Created by', value: `${message.author}`, inline: true },
                { name: 'Type', value: ticketConfig.display_name || ticketType, inline: true }
            )
            .setFooter({ text: 'Use the close button below when finished.' })
            .setTimestamp();

        const closeButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        await ticketChannel.send({
            content: `${message.author} ${config.support_role_id ? `<@&${config.support_role_id}>` : ''}`,
            embeds: [embed],
            components: [closeButton]
        });

        await message.reply(`Created your ticket: ${ticketChannel}`);

    } catch (error) {
        console.error('Error creating ticket from command:', error);
        message.reply('An error occurred while creating your ticket. Please try again later.');
    }
}

/**
 * Anti-invite handler
 */
async function handleAntiInvite(message, db) {
    try {
        const config = safeDbOperation(() => {
            const stmt = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?");
            return stmt.get(message.guild.id);
        });
        if (!config?.anti_invite_enabled) return;

        // Check if user has permission to bypass
        if (message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return;
        }

        // Check for Discord invite links
        const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[^\s/]+?(?=\b)/gi;
        if (inviteRegex.test(message.content)) {
            await message.delete().catch(console.error);
            
            const warning = await message.channel.send({
                content: `${message.author}, please don't post invite links.`
            });
            
            // Delete warning after 5 seconds
            setTimeout(() => warning.delete().catch(console.error), 5000);
        }
    } catch (error) {
        console.error('Error in anti-invite handler:', error);
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
        if (!config || !config.anti_spam_enabled) return false;
        
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
            return true; // spam handled, signal caller to skip AI
        }

        return false; // no spam action taken
    } catch (error) {
        console.error('❌ [AntiSpam] Error handling anti-spam:', error);
        return false;
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