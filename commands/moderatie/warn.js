// commands/moderatie/warn.js
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Waarschuw een gebruiker')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option.setName('gebruiker')
                .setDescription('De gebruiker die je wil waarschuwen')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reden')
                .setDescription('Reden voor de waarschuwing')
                .setRequired(true)),

    async execute(interaction) {
        const db = interaction.client.db;
        await interaction.deferReply({ ephemeral: true });

        const target = interaction.options.getUser('gebruiker');
        const reason = interaction.options.getString('reden');
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);

        if (!member) {
            return interaction.editReply({ content: '❌ Deze gebruiker is niet gevonden in de server.' });
        }

        if (member.id === interaction.user.id) {
            return interaction.editReply({ content: '❌ Je kunt jezelf niet waarschuwen!' });
        }

        // ✅ Config check
        const config = db.prepare(`SELECT warns_enabled FROM guild_config WHERE guild_id = ?`).get(interaction.guild.id);
        if (!config || config.warns_enabled !== 1) {
            return interaction.editReply({ content: '⚠️ Waarschuwingssysteem is uitgeschakeld. Gebruik `/config warns enabled:true` om het in te schakelen.' });
        }

        // ⛓️ Warn opslaan
        db.prepare(`
            INSERT INTO warnings (guild_id, user_id, moderator_id, reason, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `).run(interaction.guild.id, target.id, interaction.user.id, reason, Date.now());

        // 📩 DM versturen
        try {
            await target.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ffcc00')
                        .setTitle('⚠️ Je bent gewaarschuwd')
                        .setDescription(`Je bent gewaarschuwd in **${interaction.guild.name}**`)
                        .addFields(
                            { name: 'Reden', value: reason, inline: false },
                            { name: 'Moderator', value: interaction.user.tag, inline: true }
                        )
                        .setTimestamp()
                ]
            });
        } catch (e) {
        }


        const embed = new EmbedBuilder()
            .setColor('#ffcc00')
            .setTitle('⚠️ Gebruiker gewaarschuwd')
            .addFields(
                { name: '👤 Gebruiker', value: `${target.tag} (${target.id})`, inline: true },
                { name: '👮 Moderator', value: interaction.user.tag, inline: true },
                { name: '📄 Reden', value: reason, inline: false }
            )
            .setTimestamp();

        await interaction.channel.send({ embeds: [embed] });
        await interaction.editReply({ content: `✅ ${target.tag} is gewaarschuwd.` });

    }
};
