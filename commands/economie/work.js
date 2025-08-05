// commands/economie/work.js - Enhanced version with job system
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const defaultJobs = [
    { name: 'Pizzabezorger', min: 50, max: 150, level: 0 },
    { name: 'Kassamedewerker', min: 75, max: 125, level: 0 },
    { name: 'Schoonmaker', min: 40, max: 100, level: 0 },
    { name: 'Tuinman', min: 60, max: 140, level: 0 },
    { name: 'Babysitter', min: 45, max: 110, level: 0 },
    { name: 'Hond uitlater', min: 30, max: 80, level: 0 }
];

export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Werk om geld te verdienen (cooldown: 1 uur)')
        .addStringOption(option =>
            option.setName('job')
                .setDescription('Kies welke job je wilt doen')
                .setRequired(false)),

    async execute(interaction) {
        const db = interaction.client.db;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const requestedJob = interaction.options.getString('job');

        // Check user data
        let stmt = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?');
        let userData = stmt.get(userId, guildId);

        if (!userData) {
            stmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
            stmt.run(userId, guildId);
            userData = { balance: 0, bank: 0, last_work: null };
        }

        // Check cooldown (1 hour)
        const now = new Date();
        const lastWork = userData.last_work ? new Date(userData.last_work) : null;
        const cooldownTime = 60 * 60 * 1000; // 1 uur in ms

        if (lastWork && (now - lastWork) < cooldownTime) {
            const timeLeft = cooldownTime - (now - lastWork);
            const minutesLeft = Math.ceil(timeLeft / (60 * 1000));

            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('⏰ Cooldown Actief')
                .setDescription(`Je moet nog **${minutesLeft} minuten** wachten voordat je weer kunt werken!`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Verkrijg beschikbare jobs (default + unlocked via inventory)
        const inventoryStmt = db.prepare(`
            SELECT s.name AS item_name, s.data AS item_data, s.type AS item_type
            FROM user_inventory u
            JOIN shop_items s ON u.item_id = s.id
            WHERE u.user_id = ? AND u.guild_id = ? AND s.type = 'job'
        `);
        const ownedJobs = inventoryStmt.all(userId, guildId);

        const unlockedJobs = [...defaultJobs];
        ownedJobs.forEach(job => {
            if (job.item_data) {
                try {
                    const jobData = JSON.parse(job.item_data);
                    unlockedJobs.push({
                        name: job.item_name,
                        min: jobData.min || 100,
                        max: jobData.max || 300,
                        level: jobData.level || 1
                    });
                } catch {
                    unlockedJobs.push({
                        name: job.item_name,
                        min: 100,
                        max: 300,
                        level: 1
                    });
                }
            }
        });

        // Job selectie
        let selectedJob;
        if (requestedJob) {
            selectedJob = unlockedJobs.find(job =>
                job.name.toLowerCase().includes(requestedJob.toLowerCase())
            );

            if (!selectedJob) {
                const availableJobs = unlockedJobs.map(job => `• ${job.name}`).join('\n');
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Job Niet Gevonden')
                    .setDescription(`Je hebt geen toegang tot die job!\n\n**Beschikbare jobs:**\n${availableJobs}`)
                    .setFooter({ text: 'Koop nieuwe jobs in de shop met /shop' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                return;
            }
        } else {
            selectedJob = unlockedJobs[Math.floor(Math.random() * unlockedJobs.length)];
        }

        // Bereken verdiensten met multipliers
        let baseEarnings = Math.floor(Math.random() * (selectedJob.max - selectedJob.min + 1)) + selectedJob.min;

        const multiplierStmt = db.prepare(`
            SELECT item_data FROM user_inventory 
            WHERE user_id = ? AND guild_id = ? AND item_type = 'multiplier'
        `);
        const multipliers = multiplierStmt.all(userId, guildId);

        let totalMultiplier = 1;
        multipliers.forEach(mult => {
            if (mult.item_data) {
                try {
                    const multiplierData = JSON.parse(mult.item_data);
                    totalMultiplier += (multiplierData.value || 0);
                } catch {
                    totalMultiplier += parseFloat(mult.item_data) || 0;
                }
            }
        });

        const finalEarnings = Math.floor(baseEarnings * totalMultiplier);

        // Update balans en last_work tijd
        stmt = db.prepare('UPDATE users SET balance = balance + ?, last_work = ? WHERE user_id = ? AND guild_id = ?');
        stmt.run(finalEarnings, now.toISOString(), userId, guildId);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('💼 Werk Voltooid!')
            .setDescription(`Je hebt gewerkt als **${selectedJob.name}** en verdiende **€${finalEarnings.toLocaleString()}**!`)
            .addFields(
                { name: '💰 Basis Verdiensten', value: `€${baseEarnings}`, inline: true },
                { name: '⚡ Multiplier', value: `${totalMultiplier}x`, inline: true },
                { name: '💵 Totaal Verdiend', value: `€${finalEarnings.toLocaleString()}`, inline: true },
                { name: '⏰ Volgende werk', value: 'Over 1 uur', inline: false }
            )
            .setFooter({ text: `${interaction.user.username} • ${selectedJob.level > 0 ? 'Premium Job!' : 'Standaard Job'}` })
            .setTimestamp();

        if (selectedJob.level === 0 && unlockedJobs.length > defaultJobs.length) {
            const premiumJobs = unlockedJobs.filter(job => job.level > 0);
            embed.addFields({
                name: '🔓 Je Premium Jobs',
                value: premiumJobs.map(job => `• ${job.name} (€${job.min}-${job.max})`).join('\n') || 'Geen',
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
