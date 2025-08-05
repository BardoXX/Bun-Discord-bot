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

        // Get or create user data
        let stmt = db.prepare('SELECT * FROM users WHERE id = ? AND guild_id = ?');
        let userData = stmt.get(targetUser.id, interaction.guild.id);

        if (!userData) {
            stmt = db.prepare('INSERT INTO users (id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
            stmt.run(targetUser.id, interaction.guild.id);
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