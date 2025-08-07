// commands/economie/withdraw.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Haal geld van je bankrekening')
        .addIntegerOption(option =>
            option.setName('bedrag')
                .setDescription('Het bedrag om op te nemen (of gebruik "all" optie)')
                .setRequired(false)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('all')
                .setDescription('Haal al je geld van de bank')
                .addChoices({ name: 'Alles', value: 'all' })),

    async execute(interaction) {
        await interaction.deferReply();
        
        const db = interaction.client.db;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        
        let amount = interaction.options.getInteger('bedrag');
        const all = interaction.options.getString('all');

        let stmt = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?');
        let user = stmt.get(userId, guildId);

        if (!user) {
            stmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
            stmt.run(userId, guildId);
            user = { balance: 0, bank: 0 };
        }

        let withdrawAmount;
        
        if (all === 'all') {
            withdrawAmount = user.bank;
        } else if (amount) {
            withdrawAmount = amount;
        } else {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Je moet een bedrag of de optie "alles" opgeven!')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (withdrawAmount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Je hebt geen geld in de bank om op te nemen!')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (user.bank < withdrawAmount) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Onvoldoende Bank Saldo')
                .setDescription(`Je hebt niet genoeg geld in de bank! Je hebt maar €${user.bank.toLocaleString()} in de bank.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        stmt = db.prepare('UPDATE users SET balance = balance + ?, bank = bank - ? WHERE user_id = ? AND guild_id = ?');
        stmt.run(withdrawAmount, withdrawAmount, userId, guildId);

        const newBalance = BigInt(user.balance) + BigInt(withdrawAmount);
        const newBank = BigInt(user.bank) - BigInt(withdrawAmount);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('💰 Opname Succesvol')
            .setDescription(`Je hebt **€${withdrawAmount.toLocaleString()}** van je bankrekening opgenomen!`)
            .addFields(
                { name: '💵 Nieuw Contant Saldo', value: `€${newBalance.toLocaleString()}`, inline: true },
                { name: '🏦 Nieuw Bank Saldo', value: `€${newBank.toLocaleString()}`, inline: true }
            )
            .setFooter({ text: `${interaction.user.username} • Geld opgenomen` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};