// ============================================
// commands/moderatie/warn.js
// Hoofdcommand voor alle warning operaties
// ============================================
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warning systeem beheer')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Geef een gebruiker een warning')
                .addUserOption(opt => opt.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
                .addStringOption(opt => opt.setName('reden').setDescription('Reden voor de warning').setRequired(true))
                .addIntegerOption(opt => opt.setName('dagen').setDescription('Dagen tot verloop (standaard: 30)').setMinValue(1).setMaxValue(365)))
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Verwijder een warning')
                .addIntegerOption(opt => opt.setName('id').setDescription('Warning ID').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('Bekijk warnings van een gebruiker')
                .addUserOption(opt => opt.setName('gebruiker').setDescription('De gebruiker').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Bekijk alle actieve warnings in de server'))
        .addSubcommand(sub =>
            sub.setName('config')
                .setDescription('Configureer automatische acties (Admin)')
                .addIntegerOption(opt => opt.setName('max').setDescription('Max warnings voor actie (0=uit)').setMinValue(0).setMaxValue(50))
                .addStringOption(opt => opt.setName('actie').setDescription('Automatische actie')
                    .addChoices(
                        { name: 'Geen', value: 'none' },
                        { name: 'Kick', value: 'kick' },
                        { name: 'Ban', value: 'ban' },
                        { name: 'Timeout', value: 'timeout' }
                    ))
                .addIntegerOption(opt => opt.setName('timeout').setDescription('Timeout duur (minuten)').setMinValue(1).setMaxValue(10080))
                .addChannelOption(opt => opt.setName('logkanaal').setDescription('Log kanaal voor acties'))
                .addBooleanOption(opt => opt.setName('cleanup-notify').setDescription('Toon cleanup notificaties'))
                .addBooleanOption(opt => opt.setName('dagelijkse-recap').setDescription('Dagelijkse samenvatting om middernacht'))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        
        // Admin check voor config
        if (sub === 'config' && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Je hebt Administrator rechten nodig voor configuratie.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: sub === 'config' });

        switch (sub) {
            case 'add':
                return handleAdd(interaction);
            case 'remove':
                return handleRemove(interaction);
            case 'view':
                return handleView(interaction);
            case 'list':
                return handleList(interaction);
            case 'config':
                return handleConfig(interaction);
        }
    }
};

// ============================================
// SUBCOMMAND HANDLERS
// ============================================

async function handleAdd(interaction) {
    const db = interaction.client.db;
    const target = interaction.options.getUser('gebruiker');
    const reason = interaction.options.getString('reden');
    const days = interaction.options.getInteger('dagen') || 30;

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
        return interaction.editReply('❌ Gebruiker niet in server.');
    }
    if (member.id === interaction.user.id) {
        return interaction.editReply('❌ Je kunt jezelf niet waarschuwen!');
    }

    const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
    
    const result = db.prepare(`
        INSERT INTO warnings (guild_id, user_id, moderator_id, reason, timestamp, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(interaction.guild.id, target.id, interaction.user.id, reason, Date.now(), expiresAt);

    // DM naar gebruiker
    try {
        await target.send({
            embeds: [new EmbedBuilder()
                .setColor('#ffcc00')
                .setTitle('⚠️ Warning Ontvangen')
                .setDescription(`**Server:** ${interaction.guild.name}\n**Reden:** ${reason}`)
                .addFields(
                    { name: '👮 Moderator', value: interaction.user.tag, inline: true },
                    { name: '⏰ Verloopt', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: `Warning ID: #${result.lastInsertRowid}` })
            ]
        });
    } catch (e) { /* DM blocked */ }

    // Check automatische actie
    await checkAutoAction(interaction.client, interaction.guild, target.id);

    return interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor('#ffcc00')
            .setTitle('✅ Warning Gegeven')
            .addFields(
                { name: '👤 Gebruiker', value: target.tag, inline: true },
                { name: '📄 Reden', value: reason, inline: false },
                { name: '⏰ Verloopt', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true },
                { name: '🆔 ID', value: `#${result.lastInsertRowid}`, inline: true }
            )
        ]
    });
}

async function handleRemove(interaction) {
    const db = interaction.client.db;
    const warningId = interaction.options.getInteger('id');

    const warning = db.prepare('SELECT * FROM warnings WHERE id = ? AND guild_id = ?')
        .get(warningId, interaction.guild.id);

    if (!warning) {
        return interaction.editReply('❌ Warning niet gevonden.');
    }

    db.prepare('DELETE FROM warnings WHERE id = ?').run(warningId);

    return interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Warning Verwijderd')
            .setDescription(`Warning #${warningId} is verwijderd.`)
        ]
    });
}

async function handleView(interaction) {
    const db = interaction.client.db;
    const target = interaction.options.getUser('gebruiker');
    const now = Date.now();

    const warnings = db.prepare(`
        SELECT id, reason, moderator_id, timestamp, expires_at
        FROM warnings
        WHERE guild_id = ? AND user_id = ?
        ORDER BY timestamp DESC
    `).all(interaction.guild.id, target.id);

    const active = warnings.filter(w => !w.expires_at || Number(w.expires_at) > now);
    const expired = warnings.length - active.length;

    if (warnings.length === 0) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Geen Warnings')
                .setDescription(`${target.tag} heeft geen warnings.`)
            ]
        });
    }

    const embed = new EmbedBuilder()
        .setColor(active.length > 0 ? '#ffaa00' : '#00ff00')
        .setTitle(`⚠️ Warnings: ${target.tag}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields({
            name: '📊 Statistieken',
            value: `**Totaal:** ${warnings.length}\n**Actief:** ${active.length}\n**Verlopen:** ${expired}`,
            inline: false
        });

    if (active.length > 0) {
        const list = active.slice(0, 5).map(w => {
            const mod = interaction.guild.members.cache.get(w.moderator_id)?.user.tag || 'Onbekend';
            return `**#${w.id}** ${w.reason}\n👮 ${mod} • <t:${Math.floor(Number(w.timestamp) / 1000)}:R>`;
        }).join('\n\n');

        embed.addFields({
            name: `🚨 Actieve Warnings (${active.length > 5 ? `Top 5 van ${active.length}` : active.length})`,
            value: list,
            inline: false
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction) {
    const db = interaction.client.db;
    const now = Date.now();

    // Haal gedetailleerde warning info op
    const warnings = db.prepare(`
        SELECT user_id, COUNT(*) as count, MAX(timestamp) as last_warning, MIN(expires_at) as next_expiry
        FROM warnings
        WHERE guild_id = ? AND (expires_at IS NULL OR expires_at > ?)
        GROUP BY user_id
        ORDER BY count DESC, last_warning DESC
        LIMIT 15
    `).all(interaction.guild.id, now);

    if (warnings.length === 0) {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Geen Actieve Warnings')
                .setDescription('Er zijn geen actieve warnings in deze server.')
            ]
        });
    }

    // Totale statistieken
    const totalWarnings = db.prepare(`
        SELECT COUNT(*) as total FROM warnings
        WHERE guild_id = ? AND (expires_at IS NULL OR expires_at > ?)
    `).get(interaction.guild.id, now)?.total || 0;

    const expiringSoon = db.prepare(`
        SELECT COUNT(*) as count FROM warnings
        WHERE guild_id = ? AND expires_at > ? AND expires_at <= ?
    `).get(interaction.guild.id, now, now + (7 * 24 * 60 * 60 * 1000))?.count || 0;

    // Haal laatste auto-acties op
    const recentActions = db.prepare(`
        SELECT COUNT(*) as count FROM auto_warn_actions
        WHERE guild_id = ? AND timestamp > ?
    `).get(interaction.guild.id, now - (7 * 24 * 60 * 60 * 1000))?.count || 0;

    let description = '**📊 Server Statistieken**\n';
    description += `• Totaal actieve warnings: **${totalWarnings}**\n`;
    description += `• Gebruikers met warnings: **${warnings.length}**\n`;
    description += `• Verlopen binnen 7 dagen: **${expiringSoon}**\n`;
    description += `• Auto-acties (7 dagen): **${recentActions}**\n\n`;
    description += '**👥 Top Gebruikers**\n';

    for (let i = 0; i < warnings.length; i++) {
        const w = warnings[i];
        const member = await interaction.guild.members.fetch(w.user_id).catch(() => null);
        const name = member ? member.user.tag : 'Onbekende Gebruiker';
        const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
        
        description += `${emoji} **${name}** - ${w.count} warning${w.count > 1 ? 's' : ''}\n`;
        description += `   └ Laatste: <t:${Math.floor(Number(w.last_warning) / 1000)}:R>`;
        
        if (w.next_expiry) {
            description += ` • Verloopt: <t:${Math.floor(Number(w.next_expiry) / 1000)}:R>`;
        }
        description += '\n';
    }

    const embed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('⚠️ Actieve Warnings Overzicht')
        .setDescription(description)
        .setFooter({ text: `Gebruik /warn view [gebruiker] voor details` })
        .setTimestamp();

    // Voeg config info toe als auto-mod actief is
    const config = db.prepare(`
        SELECT max_warnings_before_action, auto_warn_action
        FROM guild_config WHERE guild_id = ?
    `).get(interaction.guild.id);

    if (config?.max_warnings_before_action > 0) {
        const actionText = {
            'kick': 'Kick',
            'ban': 'Ban',
            'timeout': 'Timeout',
            'none': 'Geen'
        }[config.auto_warn_action] || 'Geen';

        embed.addFields({
            name: '⚙️ Auto-Moderatie',
            value: `Actief bij **${config.max_warnings_before_action}** warnings\nActie: **${actionText}**`,
            inline: true
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

async function handleConfig(interaction) {
    const db = interaction.client.db;
    const max = interaction.options.getInteger('max');
    const action = interaction.options.getString('actie');
    const timeout = interaction.options.getInteger('timeout');
    const channel = interaction.options.getChannel('logkanaal');

    // Als geen opties, toon huidige config
    if (max === null && !action && !timeout && !channel) {
        const config = db.prepare(`
            SELECT max_warnings_before_action, auto_warn_action, auto_warn_channel, auto_warn_timeout_duration
            FROM guild_config WHERE guild_id = ?
        `).get(interaction.guild.id) || {};

        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('⚙️ Warning Configuratie')
                .addFields(
                    { name: '🚨 Max Warnings', value: `${config.max_warnings_before_action || 0} (${config.max_warnings_before_action ? 'Aan' : 'Uit'})`, inline: true },
                    { name: '⚡ Actie', value: config.auto_warn_action || 'none', inline: true },
                    { name: '⏱️ Timeout', value: `${config.auto_warn_timeout_duration || 0} min`, inline: true },
                    { name: '📝 Log Kanaal', value: config.auto_warn_channel ? `<#${config.auto_warn_channel}>` : 'Niet ingesteld', inline: false }
                )
                .setFooter({ text: 'Gebruik opties om te wijzigen' })
            ]
        });
    }

    // Update configuratie
    if (max !== null) {
        db.prepare('INSERT OR REPLACE INTO guild_config (guild_id, max_warnings_before_action) VALUES (?, ?)')
            .run(interaction.guild.id, max);
    }
    if (action) {
        db.prepare('INSERT OR REPLACE INTO guild_config (guild_id, auto_warn_action) VALUES (?, ?)')
            .run(interaction.guild.id, action);
    }
    if (timeout !== null) {
        db.prepare('INSERT OR REPLACE INTO guild_config (guild_id, auto_warn_timeout_duration) VALUES (?, ?)')
            .run(interaction.guild.id, timeout);
    }
    if (channel) {
        db.prepare('INSERT OR REPLACE INTO guild_config (guild_id, auto_warn_channel) VALUES (?, ?)')
            .run(interaction.guild.id, channel.id);
    }

    return interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Configuratie Bijgewerkt')
            .setDescription('De warning configuratie is succesvol aangepast.')
        ]
    });
}

// ============================================
// AUTOMATISCHE ACTIE CHECKER
// ============================================

async function checkAutoAction(client, guild, userId) {
    const db = client.db;
    const now = Date.now();

    // Haal config op
    const config = db.prepare(`
        SELECT max_warnings_before_action, auto_warn_action, auto_warn_channel, auto_warn_timeout_duration
        FROM guild_config WHERE guild_id = ?
    `).get(guild.id);

    if (!config?.max_warnings_before_action || config.auto_warn_action === 'none') return;

    // Tel actieve warnings
    const count = db.prepare(`
        SELECT COUNT(*) as count FROM warnings
        WHERE guild_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > ?)
    `).get(guild.id, userId, now)?.count || 0;

    if (count < config.max_warnings_before_action) return;

    // Check of actie al vandaag uitgevoerd
    const lastAction = db.prepare(`
        SELECT timestamp FROM auto_warn_actions
        WHERE guild_id = ? AND user_id = ? AND timestamp > ?
    `).get(guild.id, userId, now - (24 * 60 * 60 * 1000));

    if (lastAction) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    let success = false;
    let message = '';

    // Voer actie uit
    try {
        switch (config.auto_warn_action) {
            case 'kick':
                await member.kick(`Automatisch: ${count} warnings`);
                message = `👢 Gekickt na ${count} warnings`;
                success = true;
                break;
            case 'ban':
                await member.ban({ reason: `Automatisch: ${count} warnings` });
                message = `🔨 Gebanned na ${count} warnings`;
                success = true;
                break;
            case 'timeout':
                if (config.auto_warn_timeout_duration > 0) {
                    await member.timeout(config.auto_warn_timeout_duration * 60 * 1000, `Automatisch: ${count} warnings`);
                    message = `⏱️ Timeout (${config.auto_warn_timeout_duration}min) na ${count} warnings`;
                    success = true;
                }
                break;
        }
    } catch (error) {
        console.error(`Auto-actie mislukt voor ${userId}:`, error);
        return;
    }

    if (!success) return;

    // Log actie
    db.prepare(`
        INSERT INTO auto_warn_actions (guild_id, user_id, action, warning_count, timestamp)
        VALUES (?, ?, ?, ?, ?)
    `).run(guild.id, userId, config.auto_warn_action, count, now);

    // Log naar kanaal
    if (config.auto_warn_channel) {
        const channel = guild.channels.cache.get(config.auto_warn_channel);
        if (channel) {
            await channel.send({
                embeds: [new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('🚨 Automatische Moderatie')
                    .setDescription(message)
                    .addFields(
                        { name: '👤 Gebruiker', value: `${member.user.tag} (${userId})`, inline: true },
                        { name: '⚠️ Warnings', value: `${count}`, inline: true }
                    )
                    .setTimestamp()
                ]
            });
        }
    }
}