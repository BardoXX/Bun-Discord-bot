import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Verjaardag commando\'s')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Stel je verjaardag in')
                .addIntegerOption(option =>
                    option.setName('dag')
                        .setDescription('Dag van je verjaardag (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31))
                .addIntegerOption(option =>
                    option.setName('maand')
                        .setDescription('Maand van je verjaardag (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Bekijk een verjaardag')
                .addUserOption(option =>
                    option.setName('gebruiker')
                        .setDescription('De gebruiker waarvan je de verjaardag wilt bekijken')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Bekijk alle verjaardagen in deze server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Verwijder je verjaardag'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('today')
                .setDescription('Bekijk wie er vandaag jarig is')),

    async execute(interaction) {
        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        console.log(`🎂 [birthday] Processing subcommand: ${subcommand} for user ${interaction.user.tag}`);

        try {
            // Ensure birthday table exists
            await ensureBirthdayTableExists(db);

            switch (subcommand) {
                case 'set':
                    await handleSetBirthday(interaction, db, guildId, userId);
                    break;
                case 'view':
                    await handleViewBirthday(interaction, db, guildId);
                    break;
                case 'list':
                    await handleListBirthdays(interaction, db, guildId);
                    break;
                case 'remove':
                    await handleRemoveBirthday(interaction, db, guildId, userId);
                    break;
                case 'today':
                    await handleTodaysBirthdays(interaction, db, guildId);
                    break;
                default:
                    const unknownEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Onbekend Subcommando')
                        .setDescription(`Het subcommando "${subcommand}" is onbekend.`)
                        .setTimestamp();
                    await interaction.editReply({ embeds: [unknownEmbed] });
                    break;
            }

            console.log(`✅ [birthday] Subcommand ${subcommand} completed successfully`);

        } catch (error) {
            console.error(`❌ [birthday] Error in subcommand ${subcommand}:`, error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Er is een fout opgetreden')
                .setDescription('Er is een onverwachte fout opgetreden bij het uitvoeren van dit commando. Probeer het later opnieuw.')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

async function ensureBirthdayTableExists(db) {
    try {
        // Use the same table name as in the config (user_birthdays)
        db.prepare(`
            CREATE TABLE IF NOT EXISTS user_birthdays (
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                birth_date TEXT NOT NULL,
                year INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, guild_id)
            )
        `).run();

        // Also create the simpler birthdays table for compatibility
        db.prepare(`
            CREATE TABLE IF NOT EXISTS birthdays (
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                day INTEGER NOT NULL,
                month INTEGER NOT NULL,
                PRIMARY KEY (user_id, guild_id)
            )
        `).run();

        console.log('🎂 [birthday] Tables ensured to exist');
    } catch (error) {
        console.error('❌ [birthday] Error creating tables:', error);
    }
}

async function handleSetBirthday(interaction, db, guildId, userId) {
    const day = interaction.options.getInteger('dag');
    const month = interaction.options.getInteger('maand');

    // Validate date
    if (!isValidDate(day, month)) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Ongeldige Datum')
            .setDescription('De opgegeven datum is ongeldig. Controleer of de dag en maand correct zijn.')
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
}

    try {
        // Insert into both tables for compatibility
        const stmt1 = db.prepare(`
            INSERT OR REPLACE INTO birthdays (user_id, guild_id, day, month)
            VALUES (?, ?, ?, ?)
        `);
        stmt1.run(userId, guildId, day, month);

        const birthDate = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const stmt2 = db.prepare(`
            INSERT OR REPLACE INTO user_birthdays (user_id, guild_id, birth_date)
            VALUES (?, ?, ?)
        `);
        stmt2.run(userId, guildId, birthDate);

        console.log(`🎂 [birthday] Set birthday for ${interaction.user.tag}: ${day}/${month}`);

        const embed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle('🎂 Verjaardag Ingesteld')
            .setDescription(`Je verjaardag is ingesteld op **${day} ${getMonthName(month)}**.`)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('❌ [birthday] Error setting birthday:', error);
        throw error;
    }
}

async function handleViewBirthday(interaction, db, guildId) {
    const targetUser = interaction.options.getUser('gebruiker') || interaction.user;

    const stmt = db.prepare(`
        SELECT * FROM birthdays WHERE guild_id = ? AND user_id = ?
    `);
    const birthday = stmt.get(guildId, targetUser.id);

    const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setTitle('🎂 Verjaardag')
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();

    if (!birthday) {
        embed.setDescription(`**${targetUser.tag}** heeft nog geen verjaardag ingesteld.`);
    } else {
        embed.setDescription(`**${targetUser.tag}** is jarig op **${birthday.day} ${getMonthName(birthday.month)}**.`);
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleListBirthdays(interaction, db, guildId) {
    const stmt = db.prepare(`
        SELECT * FROM birthdays WHERE guild_id = ? ORDER BY month, day
    `);
    const birthdays = stmt.all(guildId);

    const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setTitle('🎂 Alle Verjaardagen')
        .setTimestamp();

    if (!birthdays || birthdays.length === 0) {
        embed.setDescription('Er zijn nog geen verjaardagen ingesteld in deze server.');
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    // Group birthdays by month
    const monthlyBirthdays = {};
    birthdays.forEach(birthday => {
        const month = birthday.month;
        if (!monthlyBirthdays[month]) {
            monthlyBirthdays[month] = [];
        }
        monthlyBirthdays[month].push(birthday);
    });

    // Add fields for each month
    Object.keys(monthlyBirthdays).sort((a, b) => a - b).forEach(month => {
        const monthBirthdays = monthlyBirthdays[month];
        const birthdayList = monthBirthdays.map(birthday => {
            const member = interaction.guild.members.cache.get(birthday.user_id);
            const username = member ? member.user.tag : '<@' + birthday.user_id + '>';
            return `${birthday.day} - ${username}`;
        }).join('\n');

        embed.addFields({
            name: `${getMonthName(parseInt(month))} (${monthBirthdays.length})`,
            value: birthdayList,
            inline: true
        });
    });

    embed.setDescription(`Totaal ${birthdays.length} verjaardagen ingesteld.`);

    await interaction.editReply({ embeds: [embed] });
}

async function handleRemoveBirthday(interaction, db, guildId, userId) {
    const stmt1 = db.prepare(`
        DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?
    `);
    const result1 = stmt1.run(guildId, userId);

    const stmt2 = db.prepare(`
        DELETE FROM user_birthdays WHERE guild_id = ? AND user_id = ?
    `);
    const result2 = stmt2.run(guildId, userId);

    const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setTitle('🎂 Verjaardag Verwijderd')
        .setTimestamp();

    if (result1.changes === 0 && result2.changes === 0) {
        embed.setDescription('Je had nog geen verjaardag ingesteld.');
    } else {
        embed.setDescription('Je verjaardag is succesvol verwijderd.');
        console.log(`🗑️ [birthday] Removed birthday for ${interaction.user.tag}`);
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleTodaysBirthdays(interaction, db, guildId) {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;

    const stmt = db.prepare(`
        SELECT * FROM birthdays WHERE guild_id = ? AND day = ? AND month = ?
    `);
    const birthdays = stmt.all(guildId, day, month);

    const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setTitle('🎉 Verjaardagen Vandaag!')
        .setTimestamp();

    if (!birthdays || birthdays.length === 0) {
        embed.setDescription('Niemand is vandaag jarig.');
    } else {
        const birthdayList = birthdays.map(birthday => {
            const member = interaction.guild.members.cache.get(birthday.user_id);
            const username = member ? member.user.tag : '<@' + birthday.user_id + '>';
            return `🎂 **${username}**`;
        }).join('\n');

        embed.setDescription(`${birthdayList}\n\n🎉 Gefeliciteerd!`);
    }

    await interaction.editReply({ embeds: [embed] });
}

function isValidDate(day, month) {
    // Convert BigInt to number if needed
    const dayNum = typeof day === 'bigint' ? Number(day) : day;
    const monthNum = typeof month === 'bigint' ? Number(month) : month;
    
    if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) {
        return false;
    }

    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return dayNum <= daysInMonth[monthNum - 1];
}

function getMonthName(month) {
    const monthNames = [
        'januari', 'februari', 'maart', 'april', 'mei', 'juni',
        'juli', 'augustus', 'september', 'oktober', 'november', 'december'
    ];
    // Convert BigInt to number if needed
    const monthNum = typeof month === 'bigint' ? Number(month) : month;
    return monthNames[monthNum - 1];
}