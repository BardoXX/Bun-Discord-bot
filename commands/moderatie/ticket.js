// commands/moderatie/ticket.js
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Beheer leden in een ticket')
        .addSubcommand(sub =>
            sub
                .setName('add')
                .setDescription('Voeg een gebruiker toe aan dit ticket')
                .addUserOption(opt =>
                    opt.setName('gebruiker')
                        .setDescription('De gebruiker die je wil toevoegen')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('remove')
                .setDescription('Verwijder een gebruiker uit dit ticket')
                .addUserOption(opt =>
                    opt.setName('gebruiker')
                        .setDescription('De gebruiker die je wil verwijderen')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const db = interaction.client.db;
        const sub = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('gebruiker');
        const channel = interaction.channel;

        // Validate: must be a ticket channel/thread registered in DB
        const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ? AND (status = "open" OR status = "claimed")').get(channel.id);
        if (!ticket) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Ticket')
                .setDescription('Dit kanaal is geen actief ticket.')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Permission gating: staff role or ManageChannels
        const config = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(interaction.guild.id);
        const hasStaffRole = config?.ticket_staff_role ? interaction.member.roles.cache.has(config.ticket_staff_role) : false;
        const hasManageChannels = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
        if (!hasStaffRole && !hasManageChannels) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Toegang')
                .setDescription('Je hebt geen rechten om leden aan dit ticket toe te voegen/verwijderen.')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (sub === 'add') {
            try {
                if (channel.type === ChannelType.PrivateThread || channel.isThread()) {
                    // Threads gebruiken thread members API
                    await channel.members.add(targetUser.id);
                } else {
                    // Ticket kanaal: permissies geven
                    await channel.permissionOverwrites.edit(targetUser.id, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Gebruiker Toegevoegd')
                    .setDescription(`${targetUser} is toegevoegd aan dit ticket.`)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('Error adding member to ticket:', err);
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Fout bij toevoegen')
                    .setDescription('Kon de gebruiker niet toevoegen. Controleer of dit een ticket is en of ik voldoende rechten heb.')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            }
        } else if (sub === 'remove') {
            // Prevent removing ticket owner
            if (targetUser.id === ticket.user_id) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚠️ Niet Toegestaan')
                    .setDescription('Je kunt de ticket eigenaar niet verwijderen uit zijn/haar eigen ticket.')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            try {
                if (channel.type === ChannelType.PrivateThread || channel.isThread()) {
                    await channel.members.remove(targetUser.id);
                } else {
                    // Ticket kanaal: permissies intrekken
                    const overwrite = channel.permissionOverwrites.cache.get(targetUser.id);
                    if (overwrite) {
                        await overwrite.delete().catch(async () => {
                            // fallback: expliciet deny
                            await channel.permissionOverwrites.edit(targetUser.id, {
                                ViewChannel: false,
                                SendMessages: false,
                                ReadMessageHistory: false,
                            });
                        });
                    } else {
                        // ensure deny if no overwrite existed
                        await channel.permissionOverwrites.edit(targetUser.id, {
                            ViewChannel: false,
                            SendMessages: false,
                            ReadMessageHistory: false,
                        });
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Gebruiker Verwijderd')
                    .setDescription(`${targetUser} is verwijderd uit dit ticket.`)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('Error removing member from ticket:', err);
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Fout bij verwijderen')
                    .setDescription('Kon de gebruiker niet verwijderen. Controleer of dit een ticket is en of ik voldoende rechten heb.')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            }
        }
    }
};
