// commands/economie/withdraw.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Haal geld van je bankrekening')
        .addIntegerOption(option =>
            option.setName('bedrag')
                .setDescription('Het bedrag om op te nemen (of gebruik "all" optie)')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('all')
                .setDescription('Haal al je geld van de bank')
                .addChoices({ name: 'Alles', value: 'all' })),

    async execute(interaction) {
        const db = interaction.client.db;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        
        const amount = interaction.options.getInteger('bedrag');
        const all = interaction.options.getString('all');

        // Get user data
        let stmt = db.prepare('SELECT * FROM users WHERE id = ? AND guild_id = ?');
        let userData = stmt.get(userId, guildId);

        if (!userData) {
            stmt = db.prepare('INSERT INTO users (id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
            stmt.run(userId, guildId);
            userData = { balance: 0, bank: 0 };
        }

        let withdrawAmount;
        
        if (all === 'all') {
            withdrawAmount = userData.bank;
        } else {
            withdrawAmount = amount;
        }

        if (withdrawAmount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Je hebt geen geld in de bank om op te nemen!')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        if (userData.bank < withdrawAmount) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Onvoldoende Bank Saldo')
                .setDescription(`Je hebt niet genoeg geld in de bank! Je hebt maar €${userData.bank} in de bank.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Update balance
        stmt = db.prepare('UPDATE users SET balance = balance + ?, bank = bank - ? WHERE id = ? AND guild_id = ?');
        stmt.run(withdrawAmount, withdrawAmount, userId, guildId);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('💰 Opname Succesvol')
            .setDescription(`Je hebt **€${withdrawAmount.toLocaleString()}** van je bankrekening opgenomen!`)
            .addFields(
                { name: '💵 Nieuw Contant Saldo', value: `€${(userData.balance + withdrawAmount).toLocaleString()}`, inline: true },
                { name: '🏦 Nieuw Bank Saldo', value: `€${(userData.bank - withdrawAmount).toLocaleString()}`, inline: true }
            )
            .setFooter({ text: `${interaction.user.username} • Geld opgenomen` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};