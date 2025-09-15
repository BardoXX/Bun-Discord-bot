import { EmbedBuilder } from 'discord.js';

export class BirthdaySystem {
    constructor(db, client) {
        this.db = db;
        this.client = client;
        this.initializeTables();
    }

    initializeTables() {
        try {
            // First, create the table if it doesn't exist
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS birthdays (
                    user_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    day INTEGER NOT NULL,
                    month INTEGER NOT NULL,
                    set_by TEXT NOT NULL DEFAULT 'unknown',
                    set_at TEXT NOT NULL DEFAULT (datetime('now')),
                    PRIMARY KEY (user_id, guild_id)
                )
            `).run();
            
            // Check and add missing columns one by one with proper error handling
            const columnsToAdd = [
                { name: 'set_by', type: 'TEXT DEFAULT \'unknown\'' },
                { name: 'set_at', type: 'TEXT DEFAULT (datetime(\'now\'))' }
            ];
            
            // Get the current table info
            const tableInfo = this.db.prepare("PRAGMA table_info(birthdays)").all();
            const existingColumns = tableInfo.map(col => col.name);
            
            // Add any missing columns
            columnsToAdd.forEach(column => {
                if (!existingColumns.includes(column.name)) {
                    try {
                        this.db.prepare(`ALTER TABLE birthdays ADD COLUMN ${column.name} ${column.type}`).run();
                        console.log(`✅ Added column '${column.name}' to birthdays table`);
                    } catch (e) {
                        console.error(`❌ Failed to add column '${column.name}':`, e.message);
                    }
                }
            });
            
            console.log('🎂 [Birthday] Tables initialized and verified');
        } catch (error) {
            console.error('❌ [Birthday] Error initializing tables:', error);
            throw error; // Re-throw to ensure we don't continue with a broken setup
        }
    }

    setBirthday(guildId, userId, day, month, setBy = null) {
        // Validatie
        if (!this.isValidDate(day, month)) {
            throw new Error('Invalid date');
        }

        const now = new Date().toISOString();
        const setById = setBy || userId; // If setBy is not provided, use the user's own ID

        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO birthdays 
            (user_id, guild_id, day, month, set_by, set_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        return stmt.run(userId, guildId, day, month, setById, now);
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

    createBirthdayEmbed(user, day, month, setBy = null, setAt = null) {
        const embed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle('🎂 Verjaardag Ingesteld')
            .setDescription(`De verjaardag van **${user.tag}** is ingesteld op **${day} ${this.getMonthName(month)}**.`)
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

        if (setBy && setBy !== user.id) {
            const setByUser = this.client?.users?.cache?.get(setBy);
            const setByText = setByUser ? setByUser.tag : `(ID: ${setBy})`;
            embed.addFields({
                name: 'Ingesteld door',
                value: setByText,
                inline: true
            });
        }

        if (setAt) {
            const formattedDate = new Date(setAt).toLocaleDateString('nl-NL', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            embed.addFields({
                name: 'Ingesteld op',
                value: formattedDate,
                inline: true
            });
        }

        return embed;
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
