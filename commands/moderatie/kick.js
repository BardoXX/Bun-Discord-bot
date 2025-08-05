// commands/moderatie/kick.js
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick een gebruiker van de server')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(option =>
            option.setName('gebruiker')
                .setDescription('De gebruiker om te kicken')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reden')
                .setDescription('Reden voor de kick')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('gebruiker');
        const reason = interaction.options.getString('reden') || 'Geen reden opgegeven';

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
                .setDescription('Je kunt jezelf niet kicken!')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Onvoldoende Permissies')
                .setDescription('Je kunt deze gebruiker niet kicken omdat hun rol hoger of gelijk is aan de jouwe.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (!member.kickable) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Ik kan deze gebruiker niet kicken. Mogelijk hebben zij een hogere rol dan mij.')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        try {
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('👢 Je bent gekickt')
                    .setDescription(`Je bent gekickt van **${interaction.guild.name}**`)
                    .addFields(
                        { name: 'Reden', value: reason, inline: false },
                        { name: 'Gemoderator', value: interaction.user.tag, inline: true }
                    )
                    .setFooter({ text: 'Je kunt de server opnieuw joinen met een invite link' })
                    .setTimestamp();

                await target.send({ embeds: [dmEmbed] });
            } catch (error) {
                console.warn(`⚠️ [kick] Kan geen DM sturen naar ${target.tag}. Mogelijk heeft de gebruiker DMs uitgeschakeld.`);
            }

            // Kick the user
            await member.kick(`${reason} | Gekickt door: ${interaction.user.tag}`);

            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('👢 Gebruiker Gekickt')
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: '👤 Gebruiker', value: `${target.tag} (${target.id})`, inline: true },
                    { name: '👮 Gemoderator', value: interaction.user.tag, inline: true },
                    { name: '📝 Reden', value: reason, inline: false }
                )
                .setFooter({ text: `Kick uitgevoerd door ${interaction.user.tag}` })
                .setTimestamp();
            await interaction.channel.send({ embeds: [embed] });

            // Gebruik editReply() omdat we al hebben gedeferred
            embed.setDescription(`✅ ${target.tag} is gekickt van de server.`);
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error kicking user:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een onverwachte fout opgetreden bij het kicken van de gebruiker.')
                .setTimestamp();

            // Gebruik editReply om de deferReply te bewerken in geval van een fout.
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
