import { EmbedBuilder } from 'discord.js';
import { formatMessage } from 'commands/helper/formatMessage.js';
import { validateEmbedColor, getColorErrorMessage } from 'commands/utils/colorValidator.js';

// Map om bij te houden welke users momenteel worden verwerkt
const processingUsers = new Map();

export default {
    name: 'guildMemberAdd',
    once: false, 
    async execute(member) {
        const startTime = Date.now();
        const userKey = `${member.id}-${member.guild.id}`;
        
        // Debug: Check of dit event al aan het verwerken is
        if (processingUsers.has(userKey)) {
            console.log(`🚫 [guildMemberAdd] DUPLICATE EVENT DETECTED for ${member.user.tag} - already processing, ignoring...`);
            return;
        }
        
        // Markeer als aan het verwerken
        processingUsers.set(userKey, startTime);
        
        try {
            const db = member.client.db;
            if (!db) {
                console.error("❌ Database niet beschikbaar. Kan geen welkomstbericht versturen.");
                return;
            }

            const guild = member.guild;
            const userId = member.id;
            const guildId = guild.id;
            
            // Enhanced debug logging
            console.log(`👋 [guildMemberAdd] START - Processing welcome for ${member.user.tag} in ${guild.name} (timestamp: ${startTime})`);
            
            // Controleer database met betere logging
            const welcomeLogStmt = db.prepare('SELECT * FROM welcome_logs WHERE user_id = ? AND guild_id = ?');
            const existingWelcome = welcomeLogStmt.get(userId, guildId);
            
            if (existingWelcome) {
                console.log(`ℹ️ [guildMemberAdd] User ${member.user.tag} already has welcome log from ${existingWelcome.welcomed_at}, skipping...`);
                return;
            }
            
            // Log dat we beginnen met verwerken
            console.log(`🔄 [guildMemberAdd] No existing welcome found, proceeding with welcome for ${member.user.tag}`);
            
            const stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
            const config = stmt.get(guild.id);

            if (!config || !config.welcome_channel) {
                console.log(`ℹ️ [guildMemberAdd] No welcome config found for guild ${guild.name}`);
                return;
            }

            const welcomeChannel = guild.channels.cache.get(config.welcome_channel);
            if (!welcomeChannel) {
                console.error(`❌ [guildMemberAdd] Welkomstkanaal met ID ${config.welcome_channel} niet gevonden in guild ${guild.name}`);
                return;
            }

            // Controleer of de bot permissions heeft om in het kanaal te schrijven
            if (!welcomeChannel.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
                console.error(`❌ [guildMemberAdd] Geen permissies om berichten te sturen in ${welcomeChannel.name}`);
                return;
            }

            // Log VOORDAT we de database entry maken
            console.log(`📝 [guildMemberAdd] About to create welcome log entry for ${member.user.tag}`);
            
            // Maak de log entry VOORDAT we het bericht versturen
            const insertWelcomeLogStmt = db.prepare(`
                INSERT OR IGNORE INTO welcome_logs (user_id, guild_id, welcomed_at)
                VALUES (?, ?, datetime('now'))
            `);
            const insertResult = insertWelcomeLogStmt.run(userId, guildId);
            
            if (insertResult.changes === 0) {
                console.log(`⚠️ [guildMemberAdd] Welcome log entry already exists for ${member.user.tag}, another process was faster`);
                return;
            }
            
            console.log(`✅ [guildMemberAdd] Welcome log entry created successfully for ${member.user.tag}`);

            const replacements = {
                user: `<@${member.id}>`,
                guild: guild.name,
                member_count: guild.memberCount,
            };

            // Rol toewijzen als geconfigureerd
            if (config.welcome_role) {
                const role = guild.roles.cache.get(config.welcome_role);
                if (role) {
                    try {
                        await member.roles.add(role);
                        console.log(`✅ [guildMemberAdd] Rol ${role.name} succesvol toegewezen aan ${member.user.tag}`);
                    } catch (error) {
                        console.error(`❌ [guildMemberAdd] Fout bij het toewijzen van rol ${role.name} aan ${member.user.tag}:`, error);
                    }
                } else {
                    console.warn(`⚠️ [guildMemberAdd] Geconfigureerde rol ${config.welcome_role} niet gevonden`);
                }
            }
            
            const defaultMessage = 'Welkom {user} bij {guild}! We zijn blij dat je erbij bent.';
            const defaultTitle = `Welkom op ${guild.name}!`;

            const formattedTitle = formatMessage(config.welcome_title || defaultTitle, replacements);
            const formattedMessage = formatMessage(config.welcome_message || defaultMessage, replacements);
            const formattedFooter = formatMessage(config.welcome_footer, replacements);

            // Debug: Log voor het versturen
            console.log(`📤 [guildMemberAdd] About to send welcome message for ${member.user.tag}`);

            // Stuur welkomstbericht
            if (config.welcome_embed_enabled) {
                // Validate embed color
                let embedColor = '#0099ff'; // Default color
                if (config.welcome_color) {
                    const validatedColor = validateEmbedColor(config.welcome_color);
                    if (validatedColor !== null) {
                        embedColor = validatedColor;
                    } else {
                        console.warn(`⚠️ [guildMemberAdd] Ongeldige kleur in configuratie voor guild ${guild.name}: ${config.welcome_color}. Gebruik standaard kleur.`);
                        // Optionally send a warning message to a log channel
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle(formattedTitle)
                    .setDescription(formattedMessage)
                    .setTimestamp();

                if (config.welcome_image === 'user_avatar') {
                    embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
                } else if (config.welcome_image) {
                    embed.setThumbnail(config.welcome_image);
                }
                
                if (formattedFooter) {
                    embed.setFooter({ text: formattedFooter });
                }

                await welcomeChannel.send({ embeds: [embed] });
                console.log(`✅ [guildMemberAdd] Welkomst embed verzonden voor ${member.user.tag}`);
            } else {
                await welcomeChannel.send(formattedMessage);
                console.log(`✅ [guildMemberAdd] Welkomst bericht verzonden voor ${member.user.tag}`);
            }
            
            const endTime = Date.now();
            console.log(`🏁 [guildMemberAdd] COMPLETED - Welcome process for ${member.user.tag} finished in ${endTime - startTime}ms`);

        } catch (error) {
            console.error(`❌ [guildMemberAdd] Onverwachte fout bij verwerken van welkomst voor ${member.user.tag}:`, error);
            
            // In geval van error, verwijder de log entry zodat het opnieuw geprobeerd kan worden
            try {
                const deleteLogStmt = member.client.db.prepare('DELETE FROM welcome_logs WHERE user_id = ? AND guild_id = ?');
                deleteLogStmt.run(member.id, member.guild.id);
                console.log(`🧹 [guildMemberAdd] Cleaned up failed welcome log for ${member.user.tag}`);
            } catch (dbError) {
                console.error(`❌ [guildMemberAdd] Fout bij cleanup na error:`, dbError);
            }
        } finally {
            // Verwijder uit processing map
            processingUsers.delete(userKey);
            console.log(`🔓 [guildMemberAdd] Released processing lock for ${member.user.tag}`);
        }
    },
};