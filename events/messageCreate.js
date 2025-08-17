// events/messageCreate.js
import { safeDbOperation, safeTransaction } from '../commands/utils/database.js';
import { handleCountingMessage } from './countingHelper.js';
import { generateReply } from '../modules/ai/aiClient.js';
import { decryptString } from '../modules/ai/secretUtil.js';
import { getTicketConfig } from '../modules/tickets/ticketConfig.js';
import { createTicketChannelOrThread } from '../modules/tickets/ticketCreate.js';

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
                if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
                if (typeof v === 'bigint') return v !== 0n;
                if (Buffer && Buffer.isBuffer?.(v)) { const s = v.toString('utf8').trim().toLowerCase(); return ['1','true','yes','on'].includes(s); }
                const s = String(v).trim().toLowerCase();
                if (s === '') return def;
                if (['1','true','yes','on','aan'].includes(s)) return true;
                if (['0','false','no','off','uit'].includes(s)) return false;
                const n = Number(s);
                if (!Number.isNaN(n)) return n !== 0;
                return def;
            } catch { return def; }
        };
        // Fetch AI config
        const cfg = safeDbOperation(() => {
            const stmt = db.prepare(`SELECT ai_enabled, ai_provider, ai_model, ai_system_prompt, ai_temperature, ai_max_tokens, ai_channels, ai_require_mention, ai_cooldown_seconds, ai_channel_prompts, ai_use_guild_secrets, ai_openai_key_enc, ai_openai_base_enc FROM guild_config WHERE guild_id = ?`);
            return stmt.get(message.guild.id);
        });
        console.debug(`[AI] maybeHandleAIReply enter guild=${message.guild?.id} channel=${message.channel?.id} user=${message.author?.id} content="${String(message.content||'').slice(0,60)}"`);
        if (!cfg) { console.debug('[AI] skip: no cfg'); return; }
        const isEnabled = normalizeBool(cfg.ai_enabled, false);
        console.debug(`[AI] ai_enabled raw=${cfg.ai_enabled} type=${typeof cfg.ai_enabled} str=${String(cfg.ai_enabled)}`);
        if (!isEnabled) { console.debug('[AI] skip: ai_enabled not enabled'); return; }

        // Channel allow-list
        let allowedChannels = [];
        try { allowedChannels = cfg.ai_channels ? JSON.parse(cfg.ai_channels) : []; } catch {}
        if (Array.isArray(allowedChannels) && allowedChannels.length > 0) {
            const allowed = allowedChannels.includes(message.channel.id);
            console.debug(`[AI] channel allow-list active (${allowedChannels.length}). This channel allowed? ${allowed}`);
            if (!allowed) return;
        } else {
            console.debug('[AI] channel allow-list not set (all channels allowed)');
        }

        // Simple tool-calling: detect Dutch intent to create a ticket
        const contentLower = String(message.content || '').toLowerCase();
        const ticketIntent = /\b(maak|open|start)\b.*\bticket\b/.test(contentLower) || /\bticket\b.*\b(aanmaken|maken|openen|starten)\b/.test(contentLower);
        if (ticketIntent) {
            console.debug('[AI] tool-call detected: create ticket');
            try {
                const cfgTicket = getTicketConfig(db, message.guild.id) || { thread_mode: 0 };
                // Try to infer a simple ticket type from message (fallback 'support')
                let ticketType = 'support';
                if (/bug|fout|error/.test(contentLower)) ticketType = 'bug-report';
                else if (/report|meld/.test(contentLower)) ticketType = 'player-report';
                else if (/unban/.test(contentLower)) ticketType = 'unban';
                else if (/unmute/.test(contentLower)) ticketType = 'unmute';

                const fakeInteraction = { guild: message.guild, user: message.author, client: message.client };
                const result = await createTicketChannelOrThread(fakeInteraction, db, cfgTicket, ticketType, null);

                // Save ticket to database so buttons know the owner
                try {
                    const insertWithType = db.prepare(`
                        INSERT INTO tickets (guild_id, user_id, channel_id, status, ticket_type)
                        VALUES (?, ?, ?, 'open', ?)
                    `);
                    insertWithType.run(message.guild.id, message.author.id, result.channel.id, ticketType);
                } catch (eIns1) {
                    try {
                        const insertBasic = db.prepare(`
                            INSERT INTO tickets (guild_id, user_id, channel_id, status)
                            VALUES (?, ?, ?, 'open')
                        `);
                        insertBasic.run(message.guild.id, message.author.id, result.channel.id);
                    } catch (eIns2) {
                        console.error('❌ [AI] failed to persist ticket record:', eIns1?.message || eIns1, eIns2?.message || eIns2);
                    }
                }

                const place = result?.isThread ? `thread <#${result.channel.id}>` : `kanaal <#${result.channel.id}>`;
                await message.reply({ content: `🎫 Ticket aangemaakt in ${place}.`, allowedMentions: { repliedUser: false } });
                // Cooldown after tool to avoid double fire
                const key = `${message.guild.id}:${message.channel.id}:${message.author.id}`;
                aiCooldowns.set(key, Date.now());
            } catch (e) {
                console.error('❌ [AI] ticket tool failed:', e);
                await message.reply({ content: 'Sorry, het aanmaken van een ticket is mislukt. Probeer het opnieuw of gebruik /ticket.', allowedMentions: { repliedUser: false } }).catch(() => {});
            }
            return; // Don't proceed to LLM for this intent
        }

        // Mention requirement
        const requireMention = normalizeBool(cfg.ai_require_mention, true);
        let mentioned = false;
        if (requireMention) {
            const botId = message.client.user?.id;
            const isReplyToBot = message.reference?.messageId ? await message.channel.messages.fetch(message.reference.messageId).then(m => m?.author?.id === botId).catch(() => false) : false;
            mentioned = message.mentions.users.has(botId) || isReplyToBot;
            console.debug(`[AI] require_mention=true, mentionedOrReply=${mentioned}`);
            if (!mentioned) return;
        } else {
            console.debug('[AI] require_mention=false');
        }

        // Cooldown per user/channel
        const cooldownSec = Number(cfg.ai_cooldown_seconds ?? 15);
        const key = `${message.guild.id}:${message.channel.id}:${message.author.id}`;
        const now = Date.now();
        const last = aiCooldowns.get(key) || 0;
        if (now - last < cooldownSec * 1000) {
            const remaining = Math.max(0, cooldownSec * 1000 - (now - last));
            console.debug(`[AI] cooldown active: ${remaining}ms remaining for ${key}`);
            return;
        }

        // Prepare messages
        // Build system prompt, possibly overridden per channel
        let systemPrompt = (cfg.ai_system_prompt && typeof cfg.ai_system_prompt === 'string')
            ? cfg.ai_system_prompt
            : 'Je bent een behulpzame Nederlandse assistent in een Discord server. Antwoord kort, duidelijk en beleefd in het Nederlands.';
        try {
            if (cfg.ai_channel_prompts) {
                const perChannel = JSON.parse(cfg.ai_channel_prompts);
                const chPrompt = perChannel?.[message.channel.id];
                if (typeof chPrompt === 'string' && chPrompt.trim()) {
                    systemPrompt = chPrompt.trim();
                    console.debug('[AI] using channel-specific system prompt');
                }
            }
        } catch {}

        const chatMessages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message.content?.slice(0, 1500) || '' }
        ];

        // Typing indicator
        try { await message.channel.sendTyping(); } catch (e) { console.debug('[AI] sendTyping failed:', e?.message); }

        const provider = (cfg.ai_provider || 'local').toLowerCase();
        let endpoint, apiKey;
        if (provider === 'openai') {
            const useGuild = !!cfg.ai_use_guild_secrets;
            if (useGuild) {
                try {
                    apiKey = cfg.ai_openai_key_enc ? decryptString(cfg.ai_openai_key_enc) : undefined;
                    endpoint = cfg.ai_openai_base_enc ? decryptString(cfg.ai_openai_base_enc) : undefined;
                } catch (eDec) {
                    console.warn('[AI] decrypt guild secrets failed, falling back to env:', eDec?.message);
                }
            }
            endpoint = endpoint || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
            apiKey = apiKey || process.env.OPENAI_API_KEY;
        } else {
            endpoint = process.env.LOCAL_OPENAI_URL || process.env.LMSTUDIO_URL || 'http://localhost:1234/v1';
            apiKey = process.env.LOCAL_OPENAI_API_KEY; // optional
        }

        console.debug(`[AI] calling generateReply provider=${provider} endpoint=${endpoint} model=${cfg.ai_model || 'default'} temp=${Number(cfg.ai_temperature ?? 0.7)} max=${Number(cfg.ai_max_tokens ?? 256)}`);
        const reply = await generateReply({
            messages: chatMessages,
            model: cfg.ai_model || undefined,
            temperature: Number(cfg.ai_temperature ?? 0.7),
            maxTokens: Number(cfg.ai_max_tokens ?? 256),
            provider,
            endpoint,
            apiKey
        });

        if (!reply) { console.debug('[AI] generateReply returned null/empty'); return; }

        // Set cooldown only on success
        aiCooldowns.set(key, now);

        await message.reply({ content: reply, allowedMentions: { repliedUser: false } });
        console.debug('[AI] reply sent');
    } catch (e) {
        console.error('❌ [AI] Error in maybeHandleAIReply:', e);
    }
}

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
            const spamHandled = await handleAntiSpam(message, db);
            
            // Skip further processing if spam was handled
            if (spamHandled) return;
            
            // Handle counting game
            await handleCountingMessage(message);

            const config = safeDbOperation(() => {
                const stmt = db.prepare('SELECT levels_enabled, level_up_channel, xp_per_message, message_cooldown FROM guild_config WHERE guild_id = ?');
                return stmt.get(message.guild.id);
            });

            if (config && config.levels_enabled) {
                await addXPToUser(message.author.id, message.guild.id, db, config, message);
            }
            
            // AI auto-responder (basic)
            await maybeHandleAIReply(message, db);
            
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
        if (isExemptByRole) return false;
        
        // Check if channel is exempt
        const exemptChannels = config.anti_invite_exempt_channels ? JSON.parse(config.anti_invite_exempt_channels) : [];
        if (exemptChannels.includes(message.channel.id)) return false;
        
        // Check if channel is specifically included (if any are specified)
        const specificChannels = config.anti_invite_channels ? JSON.parse(config.anti_invite_channels) : [];
        if (specificChannels.length > 0 && !specificChannels.includes(message.channel.id)) {
            // If specific channels are set, only apply to those channels
            return false;
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