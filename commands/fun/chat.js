import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Laat de bot iets zeggen in een kanaal')
        .addStringOption(option =>
            option.setName('bericht')
                .setDescription('Het bericht dat de bot moet zeggen')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('kanaal')
                .setDescription('Het kanaal waar de bot het bericht moet plaatsen (standaard: huidige kanaal)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('embed')
                .setDescription('Verstuur het bericht als een embed? (standaard: nee)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Controleer of de gebruiker de juiste permissies heeft
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            const noPermEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Toestemming')
                .setDescription('Je hebt de **Administrator** permissie nodig om dit commando te gebruiken.')
                .setTimestamp();

            return await interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
        }

        // Defer het antwoord om tijd te hebben voor verwerking
        await interaction.deferReply({ ephemeral: true });

        try {
            const bericht = interaction.options.getString('bericht');
            const kanaalOptie = interaction.options.getChannel('kanaal');
            const kanaal = kanaalOptie || interaction.channel;
            const useEmbed = interaction.options.getBoolean('embed') ?? false;

            // Controleer of de bot toegang heeft tot het kanaal
            if (!kanaal.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Geen Toegang')
                    .setDescription('Ik heb geen toestemming om berichten te sturen in dat kanaal.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Controleer of de bot toegang heeft tot het kanaal bekijken
            if (!kanaal.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ViewChannel)) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Geen Toegang')
                    .setDescription('Ik kan dat kanaal niet zien. heb ik viewchannel permissie?')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Controleer of het kanaal tekstberichten kan ontvangen
            if (kanaal.type !== ChannelType.GuildText && kanaal.type !== ChannelType.GuildAnnouncement) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Ongeldig Kanaal Type')
                    .setDescription('Dit kanaal type ondersteunt geen tekstberichten. heb ik sendmessages permissie?')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Verstuur het bericht naar het kanaal
            if (useEmbed) {
                // Als embed gekozen is
                const messageEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setDescription(bericht)
                    .setTimestamp();

                await kanaal.send({ embeds: [messageEmbed] });
            } else {
                // Als normale tekst gekozen is
                await kanaal.send(bericht);
            }

            // Bevestig aan de gebruiker dat het bericht is verzonden
            const successEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Bericht Verstuurd')
                .addFields(
                    { name: 'Bericht', value: bericht.length > 1000 ? bericht.substring(0, 1000) + '...' : bericht },
                    { name: 'Kanaal', value: kanaal.toString() },
                    { name: 'Type', value: useEmbed ? 'Embed' : 'Normale tekst' }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('❌ Fout bij chat command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het verzenden van het bericht.')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};