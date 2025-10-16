// commands/utils/birthdayScheduler.js
import { EmbedBuilder } from 'discord.js';
import cron from 'node-cron';
import { safeDbOperation } from '../utils/database.js';

// Singleton instance to prevent multiple schedulers
let schedulerInstance = null;

class BirthdayScheduler {
    constructor(client, db) {
        // Prevent multiple instances
        if (schedulerInstance) {
            console.log('⚠️ [BirthdayScheduler] Instance already exists, returning existing instance');
            return schedulerInstance;
        }

        this.client = client;
        this.db = db;
        this.isRunning = false;
        this.lastCheckDate = null; // Track last check to prevent duplicates

        // Debug logging om te controleren of de database correct is
        console.log('🎂 [BirthdayScheduler] Initializing with database:', this.db ? 'Connected' : 'NOT CONNECTED');

        // Load last sent date from database
        this.loadLastSentDate();

        schedulerInstance = this;
    }

    // Load last sent date from database
    loadLastSentDate() {
        if (!this.db) return;

        try {
            const result = safeDbOperation(() => {
                const stmt = this.db.prepare('SELECT last_sent_date FROM birthday_scheduler_config WHERE id = 1');
                return stmt.get();
            });

            if (result && result.last_sent_date) {
                this.lastCheckDate = result.last_sent_date;
                console.log('📅 [BirthdayScheduler] Loaded last sent date from DB:', this.lastCheckDate);
            } else {
                console.log('📅 [BirthdayScheduler] No previous sent date found in DB');
            }
        } catch (error) {
            console.error('❌ [BirthdayScheduler] Error loading last sent date:', error);
            // Create table if it doesn't exist
            this.createConfigTable();
        }
    }

    // Create config table if it doesn't exist
    createConfigTable() {
        if (!this.db) return;

        try {
            safeDbOperation(() => {
                this.db.exec('CREATE TABLE IF NOT EXISTS birthday_scheduler_config (id INTEGER PRIMARY KEY, last_sent_date TEXT)');
            });
            console.log('✅ [BirthdayScheduler] Created config table');
        } catch (error) {
            console.error('❌ [BirthdayScheduler] Error creating config table:', error);
        }
    }

    // Save last sent date to database
    saveLastSentDate(dateKey) {
        if (!this.db) return;

        try {
            safeDbOperation(() => {
                // Ensure table exists
                this.db.exec('CREATE TABLE IF NOT EXISTS birthday_scheduler_config (id INTEGER PRIMARY KEY, last_sent_date TEXT)');
                const stmt = this.db.prepare(`
                    INSERT OR REPLACE INTO birthday_scheduler_config (id, last_sent_date)
                    VALUES (1, ?)
                `);
                stmt.run(dateKey);
            });
            console.log('💾 [BirthdayScheduler] Saved last sent date to DB:', dateKey);
        } catch (error) {
            console.error('❌ [BirthdayScheduler] Error saving last sent date:', error);
        }
    }

    start() {
        if (this.isRunning) {
            console.log('⚠️ [BirthdayScheduler] Already running, ignoring start request');
            return;
        }

        // Controleer of database beschikbaar is
        if (!this.db) {
            console.error('❌ [BirthdayScheduler] Cannot start - database not available');
            return;
        }

        console.log('🎂 [BirthdayScheduler] Starting birthday scheduler...');

        // Run every day at 9:00 AM - VERIFIED CONFIGURATION
        this.job = cron.schedule('0 9 * * *', () => {
            console.log('⏰ [BirthdayScheduler] Cron job triggered at:', new Date().toISOString());
            console.log('🕐 [BirthdayScheduler] Current time in Brussels:', new Date().toLocaleString('nl-NL', {timeZone: 'Europe/Brussels'}));
            this.checkBirthdays();
        }, {
            scheduled: true,
            timezone: "Europe/Brussels"
        });

        // Also run once on startup (for testing/missed birthdays)
        setTimeout(() => {
            console.log('🚀 [BirthdayScheduler] Running initial startup check...');
            this.checkBirthdays();
        }, 5000); // Wait 5 seconds after startup

        this.isRunning = true;
        console.log('✅ [BirthdayScheduler] Birthday scheduler started successfully');
        console.log('📅 [BirthdayScheduler] Next scheduled check: 9:00 AM Europe/Brussels');
    }

    stop() {
        if (this.job) {
            this.job.destroy();
            this.job = null;
        }
        this.isRunning = false;
        schedulerInstance = null; // Clear singleton
        console.log('ℹ️ [BirthdayScheduler] Birthday scheduler stopped');
    }

    async checkBirthdays() {
        console.log('🎂 [BirthdayScheduler] Checking for birthdays...');
        console.log('🕐 [BirthdayScheduler] Current time:', new Date().toLocaleString('nl-NL', {timeZone: 'Europe/Brussels'}));

        try {
            // Extra database check
            if (!this.db) {
                console.error('❌ [BirthdayScheduler] Database not available for birthday check');
                return;
            }

            const today = new Date();
            const day = today.getDate();
            const month = today.getMonth() + 1;
            const dateKey = `${today.getFullYear()}-${month}-${day}`;

            console.log('📅 [BirthdayScheduler] Today\'s date key:', dateKey);
            console.log('📅 [BirthdayScheduler] Last check date:', this.lastCheckDate);

            // Prevent duplicate checks on the same day - CHECK BEFORE SETTING
            if (this.lastCheckDate === dateKey) {
                console.log('⏭️ [BirthdayScheduler] Already checked birthdays today, skipping...');
                return;
            }

            console.log(`📅 [BirthdayScheduler] Checking birthdays for: ${day}/${month}`);

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

            // Save the date after successful completion
            this.lastCheckDate = dateKey;
            this.saveLastSentDate(dateKey);
            console.log('✅ [BirthdayScheduler] Birthday check completed');

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

            // Get today's birthdays for this guild
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
            'Alle goeds gewenst op deze bijzondere dag! 🌈',
            'Maak er een onvergetelijke dag van! 🎂',
            'Hiep hiep hoera! Gefeliciteerd! 🎉',
            'Moge al je dromen uitkomen dit jaar! 💫',
            'Op naar nog vele gelukkige jaren! 🍀',
            'Laat je vandaag lekker in de watten leggen! 🛁',
            'Verjaardagen zijn er om te vieren, dus feest lekker! 🎶',
            'Nog vele jaren vol vreugde en geluk gewenst! 🌹',
            'Proost op jouw nieuwe levensjaar! 🥂',
            'Je bent vandaag het stralende middelpunt! 🌞',
            'Hopelijk word je dag gevuld met taart en cadeaus! 🍰🎁',
            'Een jaar ouder, een jaar wijzer – gefeliciteerd! 📚',
            'Moge vandaag net zo speciaal zijn als jij! 💖'
        ];

        return wishes[Math.floor(Math.random() * wishes.length)];
    }

    // Manual trigger for testing - bypasses duplicate check
    async triggerBirthdayCheck(forceDuplicate = false) {
        console.log('🎂 [BirthdayScheduler] Manually triggering birthday check...');
        if (forceDuplicate) {
            const prevDate = this.lastCheckDate;
            this.lastCheckDate = null; // Temporarily clear to allow duplicate
            await this.checkBirthdays();
            this.lastCheckDate = prevDate;
        } else {
            await this.checkBirthdays();
        }
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
            job: !!this.job,
            lastCheck: this.lastCheckDate,
            isSingleton: schedulerInstance === this
        };
    }

    // Get scheduler stats
    getStats() {
        return {
            isRunning: this.isRunning,
            lastCheckDate: this.lastCheckDate,
            hasDatabase: !!this.db,
            hasJob: !!this.job,
            timezone: 'Europe/Brussels',
            schedule: '0 9 * * * (Daily at 9:00 AM)'
        };
    }
}

export default BirthdayScheduler;
