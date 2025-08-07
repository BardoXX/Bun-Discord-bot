// commands/economie/deposit.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Stort geld op je bankrekening')
        .addIntegerOption(option =>
            option.setName('bedrag')
                .setDescription('Het bedrag om te storten (of "all" voor alles)')
                .setRequired(false) 
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('all')
                .setDescription('Stort al je geld op de bank')
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

        let depositAmount;
        
        if (all === 'all') {
            depositAmount = user.balance;
        } else if (amount) {
            depositAmount = amount;
        } else {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Je moet een bedrag of de optie "alles" opgeven!')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (depositAmount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Je hebt geen geld om te storten!')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (user.balance < depositAmount) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Onvoldoende Saldo')
                .setDescription(`Je hebt niet genoeg geld! Je hebt maar €${user.balance.toLocaleString()}.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        stmt = db.prepare('UPDATE users SET balance = balance - ?, bank = bank + ? WHERE user_id = ? AND guild_id = ?');
        stmt.run(depositAmount, depositAmount, userId, guildId);

        const newBalance = BigInt(user.balance) - BigInt(depositAmount);
        const newBank = BigInt(user.bank) + BigInt(depositAmount);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🏦 Storting Succesvol')
            .setDescription(`Je hebt **€${depositAmount.toLocaleString()}** op je bankrekening gestort!`)
            .addFields(
                { name: '💵 Nieuw Contant Saldo', value: `€${newBalance.toLocaleString()}`, inline: true },
                { name: '🏦 Nieuw Bank Saldo', value: `€${newBank.toLocaleString()}`, inline: true }
            )
            .setFooter({ text: `${interaction.user.username} • Je geld is veilig in de bank` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};