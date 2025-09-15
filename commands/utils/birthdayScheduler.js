// commands/utils/birthdayScheduler.js
import { EmbedBuilder } from 'discord.js';
import cron from 'node-cron';
import { safeDbOperation } from '../utils/database.js';

class BirthdayScheduler {
    constructor(client, db) {
        this.client = client;
        this.db = db;
        this.isRunning = false;
        
        // Debug logging om te controleren of de database correct is
        console.log('🎂 [BirthdayScheduler] Initializing with database:', this.db ? 'Connected' : 'NOT CONNECTED');
    }

    start() {
        if (this.isRunning) return;
        
        // Controleer of database beschikbaar is
        if (!this.db) {
            console.error('❌ [BirthdayScheduler] Cannot start - database not available');
            return;
        }
        
        console.log('🎂 [BirthdayScheduler] Starting birthday scheduler...');
        
        // Run every day at 9:00 AM
        this.job = cron.schedule('0 9 * * *', () => {
            this.checkBirthdays();
        }, {
            scheduled: true,
            timezone: "Europe/Brussels" // Adjust to your timezone
        });

        // Also run once on startup (for testing/missed birthdays)
        setTimeout(() => {
            this.checkBirthdays();
        }, 5000); // Wait 5 seconds after startup

        this.isRunning = true;
        console.log('✅ [BirthdayScheduler] Birthday scheduler started successfully');
    }

    stop() {
        if (this.job) {
            this.job.destroy();
        }
        this.isRunning = false;
        console.log('⏹️ [BirthdayScheduler] Birthday scheduler stopped');
    }

    async checkBirthdays() {
        console.log('🎂 [BirthdayScheduler] Checking for birthdays...');
        
        try {
            // Extra database check
            if (!this.db) {
                console.error('❌ [BirthdayScheduler] Database not available for birthday check');
                return;
            }
            
            const today = new Date();
            const day = today.getDate();
            const month = today.getMonth() + 1;
            
            // Get all guilds with birthday channels configured - use safe database operation
            const guildConfigs = safeDbOperation(() => {
                const configStmt = this.db.prepare(`
                    SELECT guild_id, birthday_channel 
                    FROM guild_config 
                    WHERE birthday_channel IS NOT NULL
                `);
                return configStmt.all();
            });
            
            console.log(`🎂 [BirthdayScheduler] Found ${guildConfigs.length} guilds with birthday channels`);
            
            for (const config of guildConfigs) {
                await this.checkGuildBirthdays(config.guild_id, config.birthday_channel, day, month);
            }
            
        } catch (error) {
            console.error('❌ [BirthdayScheduler] Error checking birthdays:', error);
        }
    }

    async checkGuildBirthdays(guildId, channelId, day, month) {
        try {
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                console.log(`⚠️ [BirthdayScheduler] Guild ${guildId} not found`);
                return;
            }

            const channel = guild.channels.cache.get(channelId);
            if (!channel) {
                console.log(`⚠️ [BirthdayScheduler] Birthday channel ${channelId} not found in guild ${guild.name}`);
                return;
            }

            // Get today's birthdays for this guild - FIXED: use correct table name
            const birthdays = safeDbOperation(() => {
                const birthdayStmt = this.db.prepare(`
                    SELECT * FROM birthdays
                    WHERE guild_id = ? AND month = ? AND day = ?
                `);
                return birthdayStmt.all(guildId, month, day);
            });

            if (birthdays.length === 0) {
                console.log(`🎂 [BirthdayScheduler] No birthdays today in ${guild.name}`);
                return;
            }

            console.log(`🎉 [BirthdayScheduler] Found ${birthdays.length} birthday(s) in ${guild.name}`);

            // Create and send birthday announcement
            const embed = this.createBirthdayAnnouncement(birthdays, guild, day, month);
            await channel.send({ embeds: [embed] });

            console.log(`✅ [BirthdayScheduler] Birthday announcement sent to ${guild.name}`);

        } catch (error) {
            console.error(`❌ [BirthdayScheduler] Error checking guild ${guildId}:`, error);
        }
    }

    createBirthdayAnnouncement(birthdays, guild, day, month) {
        const embed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle('🎉 Verjaardagen Vandaag!')
            .setTimestamp()
            .setFooter({ 
                text: guild.name, 
                iconURL: guild.iconURL() 
            });

        if (birthdays.length === 1) {
            const birthday = birthdays[0];
            const member = guild.members.cache.get(birthday.user_id);
            
            let age = '';
            if (birthday.year) {
                const currentYear = new Date().getFullYear();
                const birthYear = birthday.year;
                age = ` (${currentYear - birthYear} jaar)`;
            }
            
            if (member) {
                embed.setDescription(`🎂 **${member.user.tag}** is vandaag jarig${age}!\n\n🎉 Gefeliciteerd!`)
                     .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
            } else {
                embed.setDescription(`🎂 **<@${birthday.user_id}>** is vandaag jarig${age}!\n\n🎉 Gefeliciteerd!`);
            }

            // Add who set the birthday and when if available
            if (birthday.set_by) {
                const setByMember = guild.members.cache.get(birthday.set_by);
                const setByText = setByMember ? setByMember.user.tag : `(ID: ${birthday.set_by})`;
                
                let footerText = `Ingesteld door: ${setByText}`;
                
                if (birthday.set_at) {
                    const formattedDate = new Date(birthday.set_at).toLocaleDateString('nl-NL', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                    });
                    footerText += ` • ${formattedDate}`;
                }
                
                embed.setFooter({ 
                    text: `${guild.name} • ${footerText}`, 
                    iconURL: guild.iconURL() 
                });
            }
        } else {
            const birthdayList = birthdays.map(birthday => {
                const member = guild.members.cache.get(birthday.user_id);
                const username = member ? member.user.tag : `<@${birthday.user_id}>`;
                
                let age = '';
                if (birthday.year) {
                    const currentYear = new Date().getFullYear();
                    const birthYear = birthday.year;
                    age = ` (${currentYear - birthYear} jaar)`;
                }
                
                return `🎂 **${username}**${age}`;
            }).join('\n');

            embed.setDescription(`${birthdayList}\n\n🎉 Allemaal gefeliciteerd met jullie verjaardag!`);

            // Add a note that some birthdays might have been set by other users
            const hasSetByInfo = birthdays.some(b => b.set_by);
            if (hasSetByInfo) {
                embed.addFields({
                    name: 'ℹ️ Info',
                    value: 'Sommige verjaardagen zijn mogelijk ingesteld door andere gebruikers. Gebruik `/birthday view @gebruiker` voor meer details.',
                    inline: false
                });
            }
        }

        // Add some birthday emojis and styling
        embed.addFields({
            name: '🎈 Verjaardag Wensen',
            value: `${this.getRandomBirthdayWish()}`,
            inline: false
        });

        return embed;
    }

    getRandomBirthdayWish() {
        const wishes = [
            'Veel geluk en gezondheid gewenst! 🎈',
            'Hoop dat al je wensen uitkomen! ✨',
            'Geniet van je speciale dag! 🎊',
            'Een fantastische verjaardag toegewenst! 🥳',
            'Veel liefde en geluk op je verjaardag! 💕',
            'Mag dit een geweldig jaar voor je worden! 🌟',
            'Proficiat met je verjaardag! 🎁',
            'Alle goeds gewenst op deze bijzondere dag! 🌈'
        ];
        
        return wishes[Math.floor(Math.random() * wishes.length)];
    }

    // Manual trigger for testing
    async triggerBirthdayCheck() {
        console.log('🎂 [BirthdayScheduler] Manually triggering birthday check...');
        await this.checkBirthdays();
    }

    // Get today's birthdays for a specific guild (for testing)
    async getTodaysBirthdays(guildId) {
        if (!this.db) {
            console.error('❌ [BirthdayScheduler] Database not available');
            return [];
        }
        
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1;
        
        return safeDbOperation(() => {
            const stmt = this.db.prepare(`
                SELECT * FROM birthdays
                WHERE guild_id = ? AND month = ? AND day = ?
            `);
            return stmt.all(guildId, month, day);
        });
    }

    // Health check method
    isHealthy() {
        return {
            running: this.isRunning,
            database: !!this.db,
            job: !!this.job
        };
    }
}

export default BirthdayScheduler;
