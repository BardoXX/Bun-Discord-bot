// commands/economie/deposit.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Stort geld op je bankrekening')
        .addIntegerOption(option =>
            option.setName('bedrag')
                .setDescription('Het bedrag om te storten (of "all" voor alles)')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('all')
                .setDescription('Stort al je geld op de bank')
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

        let depositAmount;
        
        if (all === 'all') {
            depositAmount = userData.balance;
        } else {
            depositAmount = amount;
        }

        if (depositAmount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Je hebt geen geld om te storten!')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        if (userData.balance < depositAmount) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Onvoldoende Saldo')
                .setDescription(`Je hebt niet genoeg geld! Je hebt maar €${userData.balance}.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Update balance
        stmt = db.prepare('UPDATE users SET balance = balance - ?, bank = bank + ? WHERE id = ? AND guild_id = ?');
        stmt.run(depositAmount, depositAmount, userId, guildId);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🏦 Storting Succesvol')
            .setDescription(`Je hebt **€${depositAmount.toLocaleString()}** op je bankrekening gestort!`)
            .addFields(
                { name: '💵 Nieuw Contant Saldo', value: `€${(userData.balance - depositAmount).toLocaleString()}`, inline: true },
                { name: '🏦 Nieuw Bank Saldo', value: `€${(userData.bank + depositAmount).toLocaleString()}`, inline: true }
            )
            .setFooter({ text: `${interaction.user.username} • Je geld is veilig in de bank` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};