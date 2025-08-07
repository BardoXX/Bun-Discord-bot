// commands/moderatie/antiinvite.js
import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { configureAntiInvite, enableAntiInvite, disableAntiInvite, showAntiInviteStatus } from '../configuratie/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('antiinvite')
        .setDescription('Beheer anti-invite instellingen')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Schakel anti-invite in voor de server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Schakel anti-invite uit voor de server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('configure')
                .setDescription('Configureer anti-invite instellingen')
                .addBooleanOption(option =>
                    option.setName('default_state')
                        .setDescription('Standaard staat voor anti-invite (aan/uit)')
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('add_channel')
                        .setDescription('Voeg een kanaal toe aan de anti-invite lijst')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('remove_channel')
                        .setDescription('Verwijder een kanaal van de anti-invite lijst')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('add_exempt_channel')
                        .setDescription('Voeg een vrijgesteld kanaal toe')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('remove_exempt_channel')
                        .setDescription('Verwijder een vrijgesteld kanaal')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('add_exempt_role')
                        .setDescription('Voeg een vrijgestelde rol toe')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('remove_exempt_role')
                        .setDescription('Verwijder een vrijgestelde rol')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Bekijk huidige anti-invite instellingen')),

    async execute(interaction) {
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        // Check if user has permission
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Rechten')
                .setDescription('Je hebt geen rechten om deze opdracht uit te voeren!')
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        try {
            switch (subcommand) {
                case 'enable':
                    await enableAntiInvite(interaction, db, guildId);
                    break;
                case 'disable':
                    await disableAntiInvite(interaction, db, guildId);
                    break;
                case 'configure':
                    await configureAntiInvite(interaction, db, guildId);
                    break;
                case 'status':
                    await showAntiInviteStatus(interaction, db, guildId);
                    break;
            }
        } catch (error) {
            console.error('❌ [antiinvite] Error executing command:', error);
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het uitvoeren van deze opdracht!')
                .setTimestamp();
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    },
};