// commands/economie/crime.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const crimes = [
    { name: 'Winkeldiefstal', successRate: 0.7, minReward: 20, maxReward: 80, minFine: 50, maxFine: 150 },
    { name: 'Zakkenrollen', successRate: 0.6, minReward: 30, maxReward: 120, minFine: 75, maxFine: 200 },
    { name: 'Bankoverval', successRate: 0.3, minReward: 200, maxReward: 500, minFine: 300, maxFine: 700 },
    { name: 'Auto diefstal', successRate: 0.4, minReward: 150, maxReward: 400, minFine: 250, maxFine: 600 },
    { name: 'Hacken', successRate: 0.5, minReward: 100, maxReward: 300, minFine: 150, maxFine: 400 }
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Pleeg een misdaad om geld te verdienen (risicovol!) (cooldown: 2 uur)'),
        
    async execute(interaction) {
        const { ensureFeatureEnabled } = await import('../utils/economyFeatures.js');
        if (!(await ensureFeatureEnabled(interaction, 'crime', 'crime'))) return;
        await interaction.deferReply(); 

        const db = interaction.client.db;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // Check user data
        let stmt = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?');
        let userData = stmt.get(userId, guildId);

        if (!userData) {
            stmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
            stmt.run(userId, guildId);
            userData = { balance: 0, bank: 0, last_crime: null };
        }

        // Check cooldown (2 hours)
        const now = new Date();
        const lastCrime = userData.last_crime ? new Date(userData.last_crime) : null;
        const cooldownTime = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

        if (lastCrime && (now - lastCrime) < cooldownTime) {
            const timeLeft = cooldownTime - (now - lastCrime);
            const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));

            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('⏰ Cooldown Actief')
                .setDescription(`Je moet nog **${hoursLeft} uur** wachten voordat je weer een misdaad kunt plegen!`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Random crime
        const crime = crimes[Math.floor(Math.random() * crimes.length)];
        const success = Math.random() < crime.successRate;

        let embed;
        
        if (success) {
            const reward = Math.floor(Math.random() * (crime.maxReward - crime.minReward + 1)) + crime.minReward;
            
            const newBalance = BigInt(userData.balance) + BigInt(reward);
            stmt = db.prepare('UPDATE users SET balance = ?, last_crime = ? WHERE user_id = ? AND guild_id = ?');
            stmt.run(newBalance, now.toISOString(), userId, guildId);

            embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎭 Misdaad Succesvol!')
                .setDescription(`Je **${crime.name}** was succesvol! Je hebt **€${reward}** gestolen!`)
                .addFields(
                    { name: '💰 Gestolen', value: `€${reward}`, inline: true },
                    { name: '⏰ Volgende crime', value: 'Over 2 uur', inline: true }
                )
                .setFooter({ text: `${interaction.user.username} • Criminele activiteiten` })
                .setTimestamp();
        } else {
            const fine = Math.floor(Math.random() * (crime.maxFine - crime.minFine + 1)) + crime.minFine;
            const actualFine = Math.min(fine, Number(userData.balance)); // Can't pay more than they have
            
            const newBalance = BigInt(userData.balance) - BigInt(actualFine);
            stmt = db.prepare('UPDATE users SET balance = ?, last_crime = ? WHERE user_id = ? AND guild_id = ?');
            stmt.run(newBalance, now.toISOString(), userId, guildId);

            embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚔 Gepakt!')
                .setDescription(`Je **${crime.name}** is mislukt! Je bent gepakt en moet een boete van **€${actualFine}** betalen!`)
                .addFields(
                    { name: '💸 Boete', value: `€${actualFine}`, inline: true },
                    { name: '⏰ Volgende crime', value: 'Over 2 uur', inline: true }
                )
                .setFooter({ text: `${interaction.user.username} • Misdaad loont niet altijd` })
                .setTimestamp();
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
