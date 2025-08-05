// commands/moderatie/close.js
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription('Sluit het huidige ticket (backup methode)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const db = interaction.client.db;
        const channelId = interaction.channel.id;

        // Check if this is a ticket channel
        const ticketStmt = db.prepare('SELECT * FROM tickets WHERE channel_id = ? AND (status = "open" OR status = "claimed")');
        const ticket = ticketStmt.get(channelId);

        if (!ticket) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Ticket')
                .setDescription('Dit kanaal is geen actief ticket kanaal.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }

        // Check permissions - ticket owner or staff can close
        const isOwner = ticket.user_id === interaction.user.id;
        const configStmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
        const config = configStmt.get(interaction.guild.id);
        const hasStaffRole = config?.ticket_staff_role ? interaction.member.roles.cache.has(config.ticket_staff_role) : false;
        const hasManageChannels = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!isOwner && !hasStaffRole && !hasManageChannels) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Toegang')
                .setDescription('Je hebt geen toestemming om dit ticket te sluiten.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }

        // Update ticket status
        const updateStmt = db.prepare('UPDATE tickets SET status = "closed" WHERE channel_id = ?');
        updateStmt.run(channelId);

        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🔒 Ticket Gesloten')
            .setDescription('Dit ticket wordt over 5 seconden verwijderd...')
            .addFields(
                { name: '👤 Gesloten door', value: interaction.user.tag, inline: true },
                { name: '🕐 Gesloten op', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                { name: '⚡ Methode', value: 'Slash commando', inline: true }
            )
            .setFooter({ text: 'Bedankt voor het gebruik van ons ticket systeem!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Delete channel after 5 seconds
        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (error) {
                console.error('Error deleting ticket channel:', error);
            }
        }, 5000);
    },
};