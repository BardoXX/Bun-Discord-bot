// commands/economie/balance.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Bekijk je huidige balans')
        .addUserOption(option =>
            option.setName('gebruiker')
                .setDescription('Bekijk de balans van een andere gebruiker')
                .setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('gebruiker') || interaction.user;
        const db = interaction.client.db;
        const userId = targetUser.id;
        const guildId = interaction.guild.id;

        let stmt = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?');
        let userData = stmt.get(userId, guildId);

        if (!userData) {
            stmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
            stmt.run(userId, guildId);
            userData = { balance: 0, bank: 0 };
        }

        const totalMoney = userData.balance + userData.bank;

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`💰 ${targetUser.username}'s Balans`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: '💵 Contant', value: `€${userData.balance.toLocaleString()}`, inline: true },
                { name: '🏦 Bank', value: `€${userData.bank.toLocaleString()}`, inline: true },
                { name: '📊 Totaal', value: `€${totalMoney.toLocaleString()}`, inline: true }
            )
            .setFooter({ text: `Gevraagd door ${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
