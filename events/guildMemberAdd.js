import { EmbedBuilder } from 'discord.js';
import { formatMessage } from 'commands/helper/formatMessage.js';

export default {
    name: 'guildMemberAdd',
    async execute(member) {
        const db = member.client.db;
        if (!db) {
            console.error("Database niet beschikbaar. Kan geen welkomstbericht versturen.");
            return;
        }

        const guild = member.guild;
        const stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
        const config = stmt.get(guild.id);

        if (!config || !config.welcome_channel) {
            return;
        }

        const welcomeChannel = guild.channels.cache.get(config.welcome_channel);
        if (!welcomeChannel) {
            console.error(`Welkomstkanaal met ID ${config.welcome_channel} niet gevonden in de guild.`);
            return;
        }

        const replacements = {
            user: `<@${member.id}>`,
            guild: guild.name,
            member_count: guild.memberCount,
        };

        if (config.welcome_role) {
            const role = guild.roles.cache.get(config.welcome_role);
            if (role) {
                try {
                    await member.roles.add(role);
                    console.log(`Rol ${role.name} succesvol toegewezen aan ${member.user.tag}`);
                } catch (error) {
                    console.error(`Fout bij het toewijzen van rol ${role.name} aan ${member.user.tag}:`, error);
                }
            }
        }
        
        const defaultMessage = 'Welkom {user} bij {guild}! We zijn blij dat je erbij bent.';
        const defaultTitle = `Welkom op ${guild.name}!`;

        const formattedTitle = formatMessage(config.welcome_title || defaultTitle, replacements);
        const formattedMessage = formatMessage(config.welcome_message || defaultMessage, replacements);
        const formattedFooter = formatMessage(config.welcome_footer, replacements);

        if (config.welcome_embed_enabled) {
            const embed = new EmbedBuilder()
                .setColor(config.welcome_color || '#0099ff')
                .setTitle(formattedTitle)
                .setDescription(formattedMessage)
                .setTimestamp();
                

            if (config.welcome_image === 'user_avatar') {
                embed.setThumbnail(member.user.displayAvatarURL());
            } else if (config.welcome_image) {
                // Anders, gebruik de ingestelde URL
                embed.setThumbnail(config.welcome_image);
            }
            
            if (formattedFooter) {
                embed.setFooter({ text: formattedFooter });
            }

            welcomeChannel.send({ embeds: [embed] });
        } else {
            // Stuur een simpel bericht
            welcomeChannel.send(formattedMessage);
        }
    },
};

