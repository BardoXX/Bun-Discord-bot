import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway commando\'s')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Maak een nieuwe giveaway')
                .addStringOption(option =>
                    option.setName('titel')
                        .setDescription('Titel van de giveaway')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('beschrijving')
                        .setDescription('Beschrijving van de giveaway')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('duur')
                        .setDescription('Duur in minuten (1-10080 minuten = 7 dagen)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10080))
                .addIntegerOption(option =>
                    option.setName('winnaars')
                        .setDescription('Aantal winnaars (1-20)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(20))
                .addIntegerOption(option =>
                    option.setName('min_level')
                        .setDescription('Minimum level vereist (optioneel)')
                        .setRequired(false)
                        .setMinValue(0))
                .addIntegerOption(option =>
                    option.setName('min_invites')
                        .setDescription('Minimum invites vereist (optioneel)')
                        .setRequired(false)
                        .setMinValue(0))
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het kanaal waar de giveaway moet worden gepost (standaard: huidige kanaal)')
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText))
                .addRoleOption(option =>
                    option.setName('bonus_role_1')
                        .setDescription('Rol die bonus entries krijgt')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('bonus_entries_1')
                        .setDescription('Aantal bonus entries voor rol 1 (1-50)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(50))
                .addRoleOption(option =>
                    option.setName('bonus_role_2')
                        .setDescription('Tweede rol die bonus entries krijgt')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('bonus_entries_2')
                        .setDescription('Aantal bonus entries voor rol 2 (1-50)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(50))
                .addRoleOption(option =>
                    option.setName('bonus_role_3')
                        .setDescription('Derde rol die bonus entries krijgt')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('bonus_entries_3')
                        .setDescription('Aantal bonus entries voor rol 3 (1-50)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(50)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('Beëindig een actieve giveaway vroegtijdig')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('Message ID van de giveaway')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Bekijk alle actieve giveaways'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reroll')
                .setDescription('Kies nieuwe winnaar(s) voor een beëindigde giveaway')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('Message ID van de giveaway')
                        .setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        const db = interaction.client.db;
        const guildId = interaction.guild.id;

        switch (subcommand) {
            case 'create':
                await handleCreateGiveaway(interaction, db, guildId);
                break;
            case 'end':
                await handleEndGiveaway(interaction, db, guildId);
                break;
            case 'list':
                await handleListGiveaways(interaction, db, guildId);
                break;
            case 'reroll':
                await handleRerollGiveaway(interaction, db, guildId);
                break;
        }
    }
};

async function handleCreateGiveaway(interaction, db, guildId) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Toegang')
                .setDescription('Je hebt `Manage Messages` permissies nodig om giveaways te maken.')
            ]
        });
    }

    const title = interaction.options.getString('titel');
    const description = interaction.options.getString('beschrijving');
    const duration = interaction.options.getInteger('duur');
    const winners = interaction.options.getInteger('winnaars') || 1;
    const minLevel = interaction.options.getInteger('min_level') || 0;
    const minInvites = interaction.options.getInteger('min_invites') || 0;
    const targetChannel = interaction.options.getChannel('kanaal') || interaction.channel;

    // Verzamel bonus roles en entries
    const bonusRoles = [];
    for (let i = 1; i <= 3; i++) {
        const role = interaction.options.getRole(`bonus_role_${i}`);
        const entries = interaction.options.getInteger(`bonus_entries_${i}`);
        
        if (role && entries) {
            bonusRoles.push({
                roleId: role.id,
                roleName: role.name,
                entries: entries
            });
        }
    }

    const botPerms = targetChannel.permissionsFor(interaction.guild.members.me);
    if (!botPerms.has(['SendMessages', 'EmbedLinks'])) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Toestemming')
                .setDescription(`Ik heb geen toestemming om berichten te sturen in ${targetChannel}.`)
            ]
        });
    }

    try {
        const endTime = Date.now() + (duration * 60 * 1000);

        const embed = new EmbedBuilder()
            .setColor('#ff6b9d')
            .setTitle(`🎉 ${title}`)
            .setDescription(description)
            .addFields(
                { name: '⏰ Eindigt', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
                { name: '🏆 Winnaars', value: `${winners}`, inline: true },
                { name: '👥 Deelnemers', value: '0', inline: true },
                { name: '🎫 Totaal Entries', value: '0', inline: true }
            )
            .setFooter({ text: `Gemaakt door ${interaction.user.tag}` })
            .setTimestamp();

        // Voeg vereisten toe
        const requirements = [];
        if (minLevel > 0) requirements.push(`📊 Level ${minLevel}+`);
        if (minInvites > 0) requirements.push(`🔗 ${minInvites} invites+`);
        
        if (requirements.length > 0) {
            embed.addFields({ name: '📋 Vereisten', value: requirements.join('\n'), inline: false });
        }

        // Voeg bonus roles info toe
        if (bonusRoles.length > 0) {
            const bonusInfo = bonusRoles.map(br => `<@&${br.roleId}>: +${br.entries} entries`).join('\n');
            embed.addFields({ name: '🎁 Bonus Entries', value: bonusInfo, inline: false });
        }

        const joinButton = new ButtonBuilder()
            .setCustomId('giveaway_join')
            .setLabel('🎉 Meedoen')
            .setStyle(ButtonStyle.Primary);

        const participantsButton = new ButtonBuilder()
            .setCustomId('giveaway_participants')
            .setLabel('👥 Deelnemers')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(joinButton, participantsButton);

        const message = await targetChannel.send({ embeds: [embed], components: [row] });

        // Sla op in database met bonus roles
        db.prepare(`
            INSERT INTO giveaways (guild_id, channel_id, message_id, title, description, end_time, winners, min_level, min_invites, created_by, participants, bonus_roles)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            targetChannel.id,
            message.id,
            title,
            description,
            endTime,
            winners,
            minLevel,
            minInvites,
            interaction.user.id,
            '{}',
            JSON.stringify(bonusRoles)
        );

        const confirmEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Giveaway Gemaakt')
            .setDescription(`Giveaway "${title}" is aangemaakt in ${targetChannel}!`)
            .addFields(
                { name: '⏰ Eindigt', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
                { name: '🏆 Winnaars', value: `${winners}`, inline: true }
            );

        if (bonusRoles.length > 0) {
            confirmEmbed.addFields({
                name: '🎁 Bonus Roles',
                value: bonusRoles.map(br => `${br.roleName}: +${br.entries}`).join('\n'),
                inline: false
            });
        }

        await interaction.editReply({ embeds: [confirmEmbed] });

        console.log(`🎉 Giveaway created: ${title} in ${interaction.guild.name}`);

    } catch (error) {
        console.error('Error creating giveaway:', error);
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het maken van de giveaway.')
            ]
        });
    }
}

async function handleEndGiveaway(interaction, db, guildId) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Toegang')
                .setDescription('Je hebt geen permissies om giveaways te beëindigen.')
            ]
        });
    }

    const messageId = interaction.options.getString('message_id');

    try {
        const giveaway = db.prepare('SELECT * FROM giveaways WHERE guild_id = ? AND message_id = ?')
            .get(guildId, messageId);

        if (!giveaway) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Niet Gevonden')
                    .setDescription('Geen actieve giveaway gevonden met dit message ID.')
                ]
            });
        }

        if (Number(giveaway.end_time) <= Date.now()) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Al Beëindigd')
                    .setDescription('Deze giveaway is al beëindigd.')
                ]
            });
        }

        await endGiveaway(giveaway, interaction.client, db);

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Giveaway Beëindigd')
                .setDescription(`Giveaway "${giveaway.title}" is vroegtijdig beëindigd.`)
            ]
        });

    } catch (error) {
        console.error('Error ending giveaway:', error);
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden.')
            ]
        });
    }
}

async function handleListGiveaways(interaction, db, guildId) {
    try {
        const now = Date.now();
        const giveaways = db.prepare(`
            SELECT * FROM giveaways
            WHERE guild_id = ? AND end_time > ?
            ORDER BY end_time ASC
        `).all(guildId, now);

        if (giveaways.length === 0) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('📋 Geen Actieve Giveaways')
                    .setDescription('Er zijn momenteel geen actieve giveaways.')
                ]
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#ff6b9d')
            .setTitle(`🎉 Actieve Giveaways (${giveaways.length})`)
            .setTimestamp();

        for (const g of giveaways) {
            const participantsData = JSON.parse(g.participants || '{}');
            const uniqueUsers = Object.keys(participantsData).length;
            const totalEntries = Object.values(participantsData).reduce((sum, e) => sum + e, 0);
            const channel = interaction.guild.channels.cache.get(g.channel_id);
            
            embed.addFields({
                name: `🎉 ${g.title}`,
                value: `📍 ${channel ? channel.toString() : 'Onbekend kanaal'}\n👥 ${uniqueUsers} deelnemers | 🎫 ${totalEntries} entries\n⏰ <t:${Math.floor(Number(g.end_time) / 1000)}:R>\n🏆 ${g.winners} winnaar(s)\n🆔 \`${g.message_id}\``,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error listing giveaways:', error);
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden.')
            ]
        });
    }
}

async function handleRerollGiveaway(interaction, db, guildId) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Geen Toegang')
                .setDescription('Je hebt geen permissies voor reroll.')
            ]
        });
    }

    const messageId = interaction.options.getString('message_id');

    try {
        const channel = interaction.channel;
        const message = await channel.messages.fetch(messageId).catch(() => null);

        if (!message || !message.embeds[0]) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Bericht Niet Gevonden')
                    .setDescription('Kon het giveaway bericht niet vinden.')
                ]
            });
        }

        const embed = message.embeds[0];
        const winnerMatches = (embed.description || '').match(/<@(\d+)>/g);
        
        if (!winnerMatches || winnerMatches.length === 0) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Geen Winnaars')
                    .setDescription('Deze giveaway heeft geen winnaars om te rerolln.')
                ]
            });
        }

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🔄 Giveaway Reroll')
                .setDescription('Nieuwe winnaars worden gekozen...')
            ]
        });

        await channel.send(`🔄 **Reroll voor giveaway:** ${embed.title?.replace('🎉 ', '')}`);

    } catch (error) {
        console.error('Error rerolling giveaway:', error);
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden.')
            ]
        });
    }
}

async function endGiveaway(giveaway, client, db) {
    let channel = null;
    let message = null;

    try {
        // Fetch channel with error handling
        channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
        if (!channel) {
            console.log(`⚠️ Channel ${giveaway.channel_id} not found, deleting giveaway record`);
            db.prepare('DELETE FROM giveaways WHERE id = ?').run(giveaway.id);
            return;
        }

        // Fetch message with error handling
        message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
        if (!message) {
            console.log(`⚠️ Message ${giveaway.message_id} not found, deleting giveaway record`);
            db.prepare('DELETE FROM giveaways WHERE id = ?').run(giveaway.id);
            return;
        }

        const participantsData = JSON.parse(giveaway.participants || '{}');
        const validParticipants = {};

        // Limit participant checking to prevent memory issues
        const participantEntries = Object.entries(participantsData);
        const maxParticipants = Math.min(participantEntries.length, 50); // Max 50 participants

        // Check requirements for participants (limit to prevent memory issues)
        for (let i = 0; i < maxParticipants; i++) {
            const [userId, entries] = participantEntries[i];
            try {
                const meetsReqs = await checkUserRequirements(
                    userId,
                    giveaway.guild_id,
                    Number(giveaway.min_level) || 0,
                    Number(giveaway.min_invites) || 0,
                    client,
                    db
                );
                if (meetsReqs) {
                    validParticipants[userId] = entries;
                }
            } catch (error) {
                console.error(`Error checking requirements for user ${userId}:`, error);
                // Continue with next participant
            }
        }

        // Select winners (limit to prevent memory issues)
        let winners = [];
        if (Object.keys(validParticipants).length > 0) {
            const weightedEntries = [];
            for (const [userId, entries] of Object.entries(validParticipants)) {
                // Limit entries per user to prevent memory issues
                const limitedEntries = Math.min(Number(entries), 10);
                for (let i = 0; i < limitedEntries; i++) {
                    weightedEntries.push(userId);
                }
            }

            if (weightedEntries.length > 0) {
                const shuffled = [...weightedEntries].sort(() => Math.random() - 0.5);
                const uniqueWinners = [...new Set(shuffled)];
                const maxWinners = Math.min(Number(giveaway.winners), uniqueWinners.length, 5); // Max 5 winners
                winners = uniqueWinners.slice(0, maxWinners);
            }
        }

        // Update embed safely
        try {
            const embed = EmbedBuilder.from(message.embeds[0]);
            embed.setColor(winners.length > 0 ? '#00ff00' : '#ff0000');

            const totalUsers = Object.keys(participantsData).length;
            const totalEntries = Object.values(participantsData).reduce((sum, e) => sum + Math.min(Number(e), 10), 0);

            if (winners.length > 0) {
                const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
                embed.setDescription(`**🎉 Giveaway Beëindigd!**\n\n${giveaway.description}\n\n🏆 **Winnaars:** ${winnerMentions}`);
            } else {
                embed.setDescription(`**😔 Giveaway Beëindigd!**\n\n${giveaway.description}\n\nGeen geldige deelnemers gevonden.`);
            }

            // Update fields safely
            const fields = embed.data.fields || [];
            const participantFieldIdx = fields.findIndex(f => f.name === '👥 Deelnemers');
            const entriesFieldIdx = fields.findIndex(f => f.name === '🎫 Totaal Entries');

            if (participantFieldIdx !== -1) {
                fields[participantFieldIdx] = {
                    name: '📊 Resultaat',
                    value: `👥 ${totalUsers} deelnemers\n🎫 ${totalEntries} entries\n✅ ${Object.keys(validParticipants).length} geldig\n🏆 ${winners.length} winnaar(s)`,
                    inline: true
                };
            }

            if (entriesFieldIdx !== -1) {
                fields.splice(entriesFieldIdx, 1);
            }

            // Update buttons safely
            const disabledJoinButton = new ButtonBuilder()
                .setCustomId('giveaway_ended')
                .setLabel('Giveaway Beëindigd')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const disabledParticipantsButton = new ButtonBuilder()
                .setCustomId('giveaway_participants_ended')
                .setLabel('👥 Deelnemers')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const row = new ActionRowBuilder().addComponents(disabledJoinButton, disabledParticipantsButton);

            await message.edit({ embeds: [embed], components: [row] });

            // Announce winners safely
            if (winners.length > 0) {
                const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
                await channel.send(`🎉 **Gefeliciteerd ${winnerMentions}!** Jullie hebben gewonnen: **${giveaway.title}**!`);
            }

        } catch (error) {
            console.error('Error updating giveaway message:', error);
        }

        // Clean up database record
        db.prepare('DELETE FROM giveaways WHERE id = ?').run(giveaway.id);

        console.log(`✅ Ended giveaway: ${giveaway.title} (${winners.length} winners)`);

    } catch (error) {
        console.error('❌ Critical error in endGiveaway:', error);
        // Try to clean up the record even if processing failed
        try {
            db.prepare('DELETE FROM giveaways WHERE id = ?').run(giveaway.id);
        } catch (deleteError) {
            console.error('Error deleting giveaway after failure:', deleteError);
        }
    }
}

async function checkUserRequirements(userId, guildId, minLevel, minInvites, client, db) {
    try {
        if (minLevel > 0) {
            const levelData = db.prepare('SELECT level FROM user_levels WHERE user_id = ? AND guild_id = ?')
                .get(userId, guildId);

            if (!levelData || Number(levelData.level) < minLevel) {
                return false;
            }
        }

        if (minInvites > 0) {
            const inviteData = db.prepare('SELECT invites FROM user_invites WHERE user_id = ? AND guild_id = ?')
                .get(userId, guildId);

            if (!inviteData || Number(inviteData.invites) < minInvites) {
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error('Error checking requirements:', error);
        return false;
    }
}

function calculateUserEntries(member, bonusRoles) {
    let entries = 1; // Basis entry
    
    if (!bonusRoles || bonusRoles.length === 0) return entries;

    for (const bonus of bonusRoles) {
        if (member.roles.cache.has(bonus.roleId)) {
            entries += bonus.entries;
        }
    }

    return entries;
}

// Button handler - Join
export async function handleGiveawayJoin(interaction, db) {
    try {
        const giveaway = db.prepare('SELECT * FROM giveaways WHERE message_id = ?')
            .get(interaction.message.id);

        if (!giveaway) {
            return interaction.reply({
                content: '❌ Deze giveaway bestaat niet meer.',
                ephemeral: true
            });
        }

        if (Number(giveaway.end_time) <= Date.now()) {
            return interaction.reply({
                content: '❌ Deze giveaway is al beëindigd.',
                ephemeral: true
            });
        }

        const participantsData = JSON.parse(giveaway.participants || '{}');
        
        if (participantsData[interaction.user.id]) {
            return interaction.reply({
                content: '❌ Je doet al mee aan deze giveaway!',
                ephemeral: true
            });
        }

        const meetsReqs = await checkUserRequirements(
            interaction.user.id,
            giveaway.guild_id,
            giveaway.min_level,
            giveaway.min_invites,
            interaction.client,
            db
        );

        if (!meetsReqs) {
            const requirements = [];
            if (giveaway.min_level > 0) requirements.push(`📊 Level ${giveaway.min_level}+`);
            if (giveaway.min_invites > 0) requirements.push(`🔗 ${giveaway.min_invites} invites+`);

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Vereisten Niet Voldaan')
                    .setDescription(requirements.join('\n'))
                ],
                ephemeral: true
            });
        }

        // Bereken entries op basis van rollen
        const bonusRoles = JSON.parse(giveaway.bonus_roles || '[]');
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const userEntries = calculateUserEntries(member, bonusRoles);

        // Voeg deelnemer toe
        participantsData[interaction.user.id] = userEntries;
        db.prepare('UPDATE giveaways SET participants = ? WHERE id = ?')
            .run(JSON.stringify(participantsData), giveaway.id);

        // Update embed
        const totalUsers = Object.keys(participantsData).length;
        const totalEntries = Object.values(participantsData).reduce((sum, e) => sum + e, 0);

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        const fields = embed.data.fields;
        
        const participantFieldIdx = fields.findIndex(f => f.name === '👥 Deelnemers');
        const entriesFieldIdx = fields.findIndex(f => f.name === '🎫 Totaal Entries');

        if (participantFieldIdx !== -1) {
            fields[participantFieldIdx].value = `${totalUsers}`;
        }
        if (entriesFieldIdx !== -1) {
            fields[entriesFieldIdx].value = `${totalEntries}`;
        }

        await interaction.message.edit({ embeds: [embed] });

        const responseEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Deelname Bevestigd')
            .setDescription(`Je doet nu mee aan: **${giveaway.title}**\n🎫 Je hebt **${userEntries}** ${userEntries === 1 ? 'entry' : 'entries'}!`);

        if (userEntries > 1) {
            const appliedBonuses = bonusRoles.filter(br => member.roles.cache.has(br.roleId));
            if (appliedBonuses.length > 0) {
                responseEmbed.addFields({
                    name: '🎁 Actieve Bonussen',
                    value: appliedBonuses.map(br => `<@&${br.roleId}>: +${br.entries}`).join('\n'),
                    inline: false
                });
            }
        }

        await interaction.reply({ embeds: [responseEmbed], ephemeral: true });

        console.log(`🎉 ${interaction.user.tag} joined giveaway: ${giveaway.title} (${userEntries} entries)`);

    } catch (error) {
        console.error('Error handling join:', error);
        await interaction.reply({
            content: '❌ Er is een fout opgetreden.',
            ephemeral: true
        }).catch(() => {});
    }
}

// Button handler - View Participants
export async function handleGiveawayParticipants(interaction, db) {
    try {
        const giveaway = db.prepare('SELECT * FROM giveaways WHERE message_id = ?')
            .get(interaction.message.id);

        if (!giveaway) {
            return interaction.reply({
                content: '❌ Deze giveaway bestaat niet meer.',
                ephemeral: true
            });
        }

        const participantsData = JSON.parse(giveaway.participants || '{}');
        const entries = Object.entries(participantsData);

        if (entries.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('👥 Deelnemers')
                    .setDescription(`**${giveaway.title}**\n\nEr zijn nog geen deelnemers.`)
                ],
                ephemeral: true
            });
        }

        const totalEntries = Object.values(participantsData).reduce((sum, e) => sum + e, 0);

        // Sorteer op entries (meeste eerst)
        entries.sort((a, b) => b[1] - a[1]);

        const embed = new EmbedBuilder()
            .setColor('#ff6b9d')
            .setTitle('👥 Deelnemers Lijst')
            .setDescription(`**${giveaway.title}**\n\n👥 **${entries.length} deelnemers** | 🎫 **${totalEntries} totale entries**`)
            .setTimestamp();

        // Maak pagina's van 10 deelnemers
        const itemsPerPage = 10;
        const pages = Math.ceil(entries.length / itemsPerPage);
        const currentPage = 0;

        const start = currentPage * itemsPerPage;
        const end = start + itemsPerPage;
        const pageEntries = entries.slice(start, end);

        let description = '';
        for (let i = 0; i < pageEntries.length; i++) {
            const [userId, userEntries] = pageEntries[i];
            const rank = start + i + 1;
            description += `**${rank}.** <@${userId}> - 🎫 ${userEntries} ${userEntries === 1 ? 'entry' : 'entries'}\n`;
        }

        embed.addFields({
            name: `Pagina ${currentPage + 1}/${pages}`,
            value: description || 'Geen deelnemers',
            inline: false
        });

        // Voeg statistieken toe
        const avgEntries = (totalEntries / entries.length).toFixed(1);
        const maxEntries = Math.max(...Object.values(participantsData));
        
        embed.addFields({
            name: '📊 Statistieken',
            value: `🎫 Gemiddeld: ${avgEntries} entries\n🏆 Hoogste: ${maxEntries} entries`,
            inline: true
        });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

        console.log(`👥 ${interaction.user.tag} viewed participants for: ${giveaway.title}`);

    } catch (error) {
        console.error('Error showing participants:', error);
        await interaction.reply({
            content: '❌ Er is een fout opgetreden.',
            ephemeral: true
        }).catch(() => {});
    }
}

// Checker function voor scheduled task
export async function checkExpiredGiveaways(client, db) {
    try {
        const now = Date.now();

        // Clean up very old giveaways (older than 30 days) first to prevent database bloat
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        try {
            const oldGiveaways = db.prepare('SELECT COUNT(*) as count FROM giveaways WHERE end_time <= ?').get(thirtyDaysAgo);
            if (oldGiveaways && oldGiveaways.count > 0) {
                db.prepare('DELETE FROM giveaways WHERE end_time <= ?').run(thirtyDaysAgo);
                console.log(`🧹 Cleaned up ${oldGiveaways.count} old giveaway records`);
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }

        // Get only a limited number of expired giveaways to prevent memory issues
        const expired = db.prepare('SELECT * FROM giveaways WHERE end_time <= ? LIMIT 10').all(now);

        // Safety check: don't process more than 3 giveaways at once to prevent memory issues
        const maxGiveaways = Math.min(expired.length, 3);

        for (let i = 0; i < maxGiveaways; i++) {
            const giveaway = expired[i];
            try {
                console.log(`🔄 Processing giveaway: ${giveaway.title} (${giveaway.id})`);
                await endGiveaway(giveaway, client, db);
                // Longer delay between processing to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`❌ Error processing giveaway ${giveaway.id}:`, error);
                // If a giveaway fails, mark it as processed to avoid infinite loops
                try {
                    db.prepare('DELETE FROM giveaways WHERE id = ?').run(giveaway.id);
                } catch (deleteError) {
                    console.error('Error deleting failed giveaway:', deleteError);
                }
            }
        }

        if (expired.length > 0) {
            console.log(`🎉 Processed ${maxGiveaways}/${expired.length} expired giveaway(s)`);
            if (expired.length > maxGiveaways) {
                console.log(`⚠️ ${expired.length - maxGiveaways} giveaways remaining for next cycle`);
            }
        } else {
            console.log('✅ No expired giveaways to process');
        }

    } catch (error) {
        console.error('❌ Critical error in checkExpiredGiveaways:', error);
        // Don't let this function crash the entire bot
    }
}