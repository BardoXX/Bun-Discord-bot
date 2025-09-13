import { EmbedBuilder } from 'discord.js';

export class BirthdaySystem {
    constructor(db) {
        this.db = db;
        this.initializeTables();
    }

    initializeTables() {
        try {
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS birthdays (
                    user_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    day INTEGER NOT NULL,
                    month INTEGER NOT NULL,
                    PRIMARY KEY (user_id, guild_id)
                )
            `).run();
            
            console.log('🎂 [Birthday] Tables initialized');
        } catch (error) {
            console.error('❌ [Birthday] Error creating tables:', error);
        }
    }

    setBirthday(guildId, userId, day, month) {
        // Validatie
        if (!this.isValidDate(day, month)) {
            throw new Error('Invalid date');
        }

        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO birthdays (user_id, guild_id, day, month)
            VALUES (?, ?, ?, ?)
        `);
        
        return stmt.run(userId, guildId, day, month);
    }

    getBirthday(guildId, userId) {
        const stmt = this.db.prepare(`
            SELECT * FROM birthdays WHERE guild_id = ? AND user_id = ?
        `);
        return stmt.get(guildId, userId);
    }

    getAllBirthdays(guildId) {
        const stmt = this.db.prepare(`
            SELECT * FROM birthdays WHERE guild_id = ?
        `);
        return stmt.all(guildId);
    }

    getTodaysBirthdays(guildId, day, month) {
        const stmt = this.db.prepare(`
            SELECT * FROM birthdays WHERE guild_id = ? AND day = ? AND month = ?
        `);
        return stmt.all(guildId, day, month);
    }

    removeBirthday(guildId, userId) {
        const stmt = this.db.prepare(`
            DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?
        `);
        return stmt.run(guildId, userId);
    }

    isValidDate(day, month) {
        if (day < 1 || day > 31 || month < 1 || month > 12) {
            return false;
        }

        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return day <= daysInMonth[month - 1];
    }

    getMonthName(month) {
        const monthNames = [
            'januari', 'februari', 'maart', 'april', 'mei', 'juni',
            'juli', 'augustus', 'september', 'oktober', 'november', 'december'
        ];
        return monthNames[Number(month) - 1];
    }

    createBirthdayEmbed(user, day, month) {
        return new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle('🎂 Verjaardag Ingesteld')
            .setDescription(`De verjaardag van **${user.tag}** is ingesteld op **${day} ${this.getMonthName(month)}**.`)
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();
    }

    createTodaysBirthdayEmbed(birthdays, guild) {
        const embed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle('🎉 Verjaardagen Vandaag!')
            .setTimestamp();

        if (birthdays.length === 0) {
            embed.setDescription('Geen verjaardagen vandaag.');
            return embed;
        }

        const birthdayList = birthdays.map(birthday => {
            const member = guild.members.cache.get(birthday.user_id);
            return member ? `🎂 **${member.user.tag}**` : `🎂 **<@${birthday.user_id}>**`;
        }).join('\n');

        embed.setDescription(`${birthdayList}\n\n🎉 Gefeliciteerd!`);
        return embed;
    }
}
