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

        try {
            // Check user data
            let stmt = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?');
            let userData = stmt.get(userId, guildId);

            if (!userData) {
                stmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 1000, 0)');
                stmt.run(userId, guildId);
                userData = { balance: 1000, bank: 0, last_work: null };
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

            // Get owned jobs from inventory
            const unlockedJobs = [...defaultJobs];
            
            try {
                const inventoryStmt = db.prepare(`
                    SELECT s.name AS item_name, s.item_data AS item_data, s.type AS item_type
                    FROM user_inventory u
                    JOIN shop_items s ON u.item_id = s.id
                    WHERE u.user_id = ? AND u.guild_id = ? AND s.type = 'job'
                `);
                
                const ownedJobs = inventoryStmt.all(userId, guildId);
                
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
            } catch (error) {
                console.log('⚠️ Could not fetch owned jobs, using default jobs only');
            }

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

            // Calculate earnings with multipliers
            let baseEarnings = Math.floor(Math.random() * (selectedJob.max - selectedJob.min + 1)) + selectedJob.min;
            let totalMultiplier = 1;

            try {
                const multiplierStmt = db.prepare(`
                    SELECT item_data FROM user_inventory ui
                    JOIN shop_items si ON ui.item_id = si.id
                    WHERE ui.user_id = ? AND ui.guild_id = ? AND si.type = 'multiplier'
                `);
                const multipliers = multiplierStmt.all(userId, guildId);

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
            } catch (error) {
                console.log('⚠️ Could not fetch multipliers, using base multiplier (1x)');
            }

            const finalEarnings = Math.floor(baseEarnings * totalMultiplier);

            // Update balance and last_work time
            stmt = db.prepare('UPDATE users SET balance = balance + ?, last_work = ? WHERE user_id = ? AND guild_id = ?');
            stmt.run(finalEarnings, now.toISOString(), userId, guildId);

            // LOG JOB HISTORY - This is the new part!
            try {
                const historyStmt = db.prepare(`
                    INSERT INTO job_history (user_id, guild_id, job_name, base_earnings, multiplier, final_earnings, job_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                historyStmt.run(
                    userId, 
                    guildId, 
                    selectedJob.name, 
                    baseEarnings, 
                    totalMultiplier, 
                    finalEarnings, 
                    selectedJob.level > 0 ? 'premium' : 'default'
                );
                console.log(`📝 [work] Logged job history: ${interaction.user.tag} worked as ${selectedJob.name} for €${finalEarnings}`);
            } catch (historyError) {
                console.error('❌ Failed to log job history:', historyError);
                // Don't fail the command if history logging fails
            }

            // Get total work count for user
            let workCount = 0;
            try {
                const countStmt = db.prepare('SELECT COUNT(*) as count FROM job_history WHERE user_id = ? AND guild_id = ?');
                const countResult = countStmt.get(userId, guildId);
                workCount = countResult.count || 0;
            } catch (error) {
                console.log('⚠️ Could not fetch work count');
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('💼 Werk Voltooid!')
                .setDescription(`Je hebt gewerkt als **${selectedJob.name}** en verdiende **€${finalEarnings.toLocaleString()}**!`)
                .addFields(
                    { name: '💰 Basis Verdiensten', value: `€${baseEarnings}`, inline: true },
                    { name: '⚡ Multiplier', value: `${totalMultiplier}x`, inline: true },
                    { name: '💵 Totaal Verdiend', value: `€${finalEarnings.toLocaleString()}`, inline: true },
                    { name: '⏰ Volgende werk', value: 'Over 1 uur', inline: true },
                    { name: '📊 Werk Teller', value: `${workCount} keer gewerkt`, inline: true },
                    { name: '🏷️ Job Type', value: selectedJob.level > 0 ? 'Premium Job' : 'Standaard Job', inline: true }
                )
                .setFooter({ text: `${interaction.user.username} • Bekijk je job geschiedenis met /jobstats` })
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

        } catch (error) {
            console.error('❌ Error in work command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het verwerken van het werk commando.')
                .setTimestamp();

            try {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
    },
};