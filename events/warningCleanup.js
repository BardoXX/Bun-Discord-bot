// ============================================
// events/warningCleanup.js
// Automatische cleanup van verlopen warnings
// ============================================
import { EmbedBuilder } from 'discord.js';

export default {
    name: 'warningCleanup',
    once: false,
    async execute(client) {
        console.log('✅ Warning cleanup systeem gestart');

        // Cleanup functie
        const performCleanup = async () => {
            try {
                const db = client.db;
                if (!db) return;

                const now = Date.now();
                let totalCleaned = 0;

                // Loop door alle guilds
                for (const [guildId, guild] of client.guilds.cache) {
                    // Haal verlopen warnings op
                    const expiredWarnings = db.prepare(`
                        SELECT id, user_id, reason, expires_at
                        FROM warnings
                        WHERE guild_id = ? AND expires_at IS NOT NULL AND expires_at <= ?
                    `).all(guildId, now);

                    if (expiredWarnings.length === 0) continue;

                    // Verwijder verlopen warnings
                    const result = db.prepare(`
                        DELETE FROM warnings
                        WHERE guild_id = ? AND expires_at IS NOT NULL AND expires_at <= ?
                    `).run(guildId, now);

                    const cleaned = result.changes;
                    totalCleaned += cleaned;

                    console.log(`🧹 Cleaned ${cleaned} verlopen warnings in ${guild.name}`);

                    // Haal log kanaal op voor notificatie
                    const config = db.prepare(`
                        SELECT auto_warn_channel, cleanup_notifications
                        FROM guild_config
                        WHERE guild_id = ?
                    `).get(guildId);

                    // Stuur notificatie naar log kanaal (als enabled)
                    if (config?.auto_warn_channel && config?.cleanup_notifications !== 0) {
                        const channel = guild.channels.cache.get(config.auto_warn_channel);
                        
                        if (channel) {
                            // Groepeer per gebruiker voor overzicht
                            const userStats = {};
                            for (const warning of expiredWarnings) {
                                if (!userStats[warning.user_id]) {
                                    userStats[warning.user_id] = 0;
                                }
                                userStats[warning.user_id]++;
                            }

                            let description = `**${cleaned}** verlopen warning${cleaned > 1 ? 's' : ''} verwijderd.\n\n`;
                            
                            // Toon top 5 gebruikers
                            const topUsers = Object.entries(userStats)
                                .sort(([,a], [,b]) => b - a)
                                .slice(0, 5);

                            for (const [userId, count] of topUsers) {
                                const member = await guild.members.fetch(userId).catch(() => null);
                                const name = member?.user.tag || 'Onbekende Gebruiker';
                                description += `• **${name}**: ${count} warning${count > 1 ? 's' : ''}\n`;
                            }

                            if (Object.keys(userStats).length > 5) {
                                description += `\n*...en ${Object.keys(userStats).length - 5} andere gebruiker${Object.keys(userStats).length - 5 > 1 ? 's' : ''}*`;
                            }

                            await channel.send({
                                embeds: [new EmbedBuilder()
                                    .setColor('#00ff00')
                                    .setTitle('🧹 Automatische Cleanup')
                                    .setDescription(description)
                                    .setFooter({ text: 'Warnings worden automatisch verwijderd na verloop' })
                                    .setTimestamp()
                                ]
                            }).catch(err => console.error('Kon cleanup notificatie niet versturen:', err));
                        }
                    }
                }

                if (totalCleaned > 0) {
                    console.log(`✅ Totaal ${totalCleaned} verlopen warnings verwijderd`);
                }

                // Log cleanup statistics
                const stats = db.prepare(`
                    INSERT INTO cleanup_logs (timestamp, warnings_cleaned)
                    VALUES (?, ?)
                `).run(now, totalCleaned);

            } catch (error) {
                console.error('❌ Error in warning cleanup:', error);
            }
        };

        // Voer eerste cleanup uit na 1 minuut
        setTimeout(performCleanup, 60 * 1000);

        // Cleanup elke 6 uur
        setInterval(performCleanup, 6 * 60 * 60 * 1000);

        // Dagelijkse samenvatting om middernacht (optioneel)
        const scheduleMidnightSummary = () => {
            const now = new Date();
            const midnight = new Date(now);
            midnight.setHours(24, 0, 0, 0);
            const msUntilMidnight = midnight - now;

            setTimeout(() => {
                sendDailySummary(client);
                // Plan volgende dag
                setInterval(() => sendDailySummary(client), 24 * 60 * 60 * 1000);
            }, msUntilMidnight);
        };

        scheduleMidnightSummary();
    }
};

// ============================================
// DAGELIJKSE SAMENVATTING
// ============================================

async function sendDailySummary(client) {
    try {
        const db = client.db;
        const now = Date.now();
        const yesterday = now - (24 * 60 * 60 * 1000);

        for (const [guildId, guild] of client.guilds.cache) {
            // Check of daily summaries enabled zijn
            const config = db.prepare(`
                SELECT auto_warn_channel, daily_summary
                FROM guild_config
                WHERE guild_id = ?
            `).get(guildId);

            if (!config?.auto_warn_channel || config?.daily_summary === 0) continue;

            const channel = guild.channels.cache.get(config.auto_warn_channel);
            if (!channel) continue;

            // Haal statistieken op
            const newWarnings = db.prepare(`
                SELECT COUNT(*) as count FROM warnings
                WHERE guild_id = ? AND timestamp > ?
            `).get(guildId, yesterday)?.count || 0;

            const autoActions = db.prepare(`
                SELECT COUNT(*) as count FROM auto_warn_actions
                WHERE guild_id = ? AND timestamp > ?
            `).get(guildId, yesterday)?.count || 0;

            const activeWarnings = db.prepare(`
                SELECT COUNT(*) as count FROM warnings
                WHERE guild_id = ? AND (expires_at IS NULL OR expires_at > ?)
            `).get(guildId, now)?.count || 0;

            const expiringSoon = db.prepare(`
                SELECT COUNT(*) as count FROM warnings
                WHERE guild_id = ? AND expires_at > ? AND expires_at <= ?
            `).get(guildId, now, now + (24 * 60 * 60 * 1000))?.count || 0;

            // Stuur alleen als er activiteit was
            if (newWarnings === 0 && autoActions === 0 && expiringSoon === 0) continue;

            await channel.send({
                embeds: [new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📊 Dagelijkse Warning Samenvatting')
                    .addFields(
                        { name: '⚠️ Nieuwe Warnings', value: `${newWarnings}`, inline: true },
                        { name: '⚡ Auto-Acties', value: `${autoActions}`, inline: true },
                        { name: '📋 Totaal Actief', value: `${activeWarnings}`, inline: true },
                        { name: '⏰ Verloopt Vandaag', value: `${expiringSoon}`, inline: true }
                    )
                    .setFooter({ text: 'Afgelopen 24 uur' })
                    .setTimestamp()
                ]
            }).catch(err => console.error('Kon dagelijkse samenvatting niet versturen:', err));
        }
    } catch (error) {
        console.error('❌ Error in daily summary:', error);
    }
}

// ============================================
// DATABASE SCHEMA UPDATES (voeg toe aan je init)
// ============================================
/*
Voeg deze tabel toe aan je database init:

CREATE TABLE IF NOT EXISTS cleanup_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    warnings_cleaned INTEGER NOT NULL
);

Voeg deze kolommen toe aan guild_config:

ALTER TABLE guild_config ADD COLUMN cleanup_notifications INTEGER DEFAULT 1;
ALTER TABLE guild_config ADD COLUMN daily_summary INTEGER DEFAULT 0;
*/