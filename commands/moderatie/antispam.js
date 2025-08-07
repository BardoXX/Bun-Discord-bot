// commands/moderatie/antispam.js
import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { configureAntiSpam, enableAntiSpam, disableAntiSpam, showAntiSpamStatus } from '../configuratie/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('antispam')
        .setDescription('Beheer anti-spam instellingen')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Schakel anti-spam in voor de server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Schakel anti-spam uit voor de server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('configure')
                .setDescription('Configureer anti-spam instellingen')
                .addBooleanOption(option =>
                    option.setName('default_state')
                        .setDescription('Standaard staat voor anti-spam (aan/uit)')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('threshold')
                        .setDescription('Aantal berichten binnen tijdvenster voor spamdetectie (standaard: 5)')
                        .setMinValue(2)
                        .setMaxValue(20)
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('time_window')
                        .setDescription('Tijdvenster in seconden (standaard: 5)')
                        .setMinValue(1)
                        .setMaxValue(60)
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('add_channel')
                        .setDescription('Voeg een kanaal toe aan de anti-spam lijst')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('remove_channel')
                        .setDescription('Verwijder een kanaal van de anti-spam lijst')
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
                .setDescription('Bekijk huidige anti-spam instellingen')),

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
                    await enableAntiSpam(interaction, db, guildId);
                    break;
                case 'disable':
                    await disableAntiSpam(interaction, db, guildId);
                    break;
                case 'configure':
                    await configureAntiSpam(interaction, db, guildId);
                    break;
                case 'status':
                    await showAntiSpamStatus(interaction, db, guildId);
                    break;
            }
        } catch (error) {
            console.error('❌ [antispam] Error executing command:', error);
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
