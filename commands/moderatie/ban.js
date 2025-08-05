// commands/moderatie/ban.js
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban een gebruiker van de server')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(option =>
            option.setName('gebruiker')
                .setDescription('De gebruiker om te bannen')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reden')
                .setDescription('Reden voor de ban')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('dagen')
                .setDescription('Aantal dagen berichten te verwijderen (0-7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)),

    async execute(interaction) {
        // Begin met een 'defer reply' om aan te geven dat de bot bezig is.
        await interaction.deferReply({ ephemeral: true });

        const target = interaction.options.getUser('gebruiker');
        const reason = interaction.options.getString('reden') || 'Geen reden opgegeven';
        const deleteMessageDays = interaction.options.getInteger('dagen') || 0;

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        
        if (!member) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Deze gebruiker is niet gevonden op de server.')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (member.id === interaction.user.id) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Je kunt jezelf niet bannen!')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Onvoldoende Permissies')
                .setDescription('Je kunt deze gebruiker niet bannen omdat hun rol hoger of gelijk is aan de jouwe.')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (!member.bannable) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Ik kan deze gebruiker niet bannen. Mogelijk hebben zij een hogere rol dan mij.')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        try {
            // Probeer een DM te sturen voor de ban
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('🔨 Je bent geband')
                    .setDescription(`Je bent geband van **${interaction.guild.name}**`)
                    .addFields(
                        { name: 'Reden', value: reason, inline: false },
                        { name: 'Gemoderator', value: interaction.user.tag, inline: true }
                    )
                    .setTimestamp();
                await target.send({ embeds: [dmEmbed] });
            } catch (error) {
                // Gebruiker heeft DMs uitgeschakeld
            }

            // Ban de gebruiker
            await member.ban({ 
                reason: `${reason} | Geband door: ${interaction.user.tag}`,
                deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60
            });

            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🔨 Gebruiker Geband')
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: '👤 Gebruiker', value: `${target.tag} (${target.id})`, inline: true },
                    { name: '👮 Gemoderator', value: interaction.user.tag, inline: true },
                    { name: '📝 Reden', value: reason, inline: false },
                    { name: '🗑️ Berichten Verwijderd', value: `${deleteMessageDays} dagen`, inline: true }
                )
                .setFooter({ text: `Ban uitgevoerd door ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error banning user:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een onverwachte fout opgetreden bij het bannen van de gebruiker.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
