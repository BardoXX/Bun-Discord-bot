import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createTicketTables, getTicketConfig, buildTicketPanel, createTicketChannel, getTicketControlComponents } from './ticketUtils.js';

export async function handleTicketButton(interaction, db) {
    const { customId } = interaction;
    const { guild, member, channel } = interaction;

    // Ensure tables exist
    createTicketTables(db);

    // Defensive: ensure runtime columns exist to avoid 'no such column' on older DBs
    try {
        const cols = db.prepare(`PRAGMA table_info(tickets)`).all().map(c => c.name);
        if (!cols.includes('closed_at')) {
            db.exec(`ALTER TABLE tickets ADD COLUMN closed_at DATETIME`);
        }
        if (!cols.includes('claimed_by')) {
            db.exec(`ALTER TABLE tickets ADD COLUMN claimed_by TEXT`);
        }
        if (!cols.includes('claimed_at')) {
            db.exec(`ALTER TABLE tickets ADD COLUMN claimed_at DATETIME`);
        }
        if (!cols.includes('category_id')) {
            db.exec(`ALTER TABLE tickets ADD COLUMN category_id INTEGER`);
        }
    } catch {}

    // Handle ticket creation (category selection opens modal)
    if (customId === 'ticket_create') {
        if (!interaction.isStringSelectMenu()) return;
        
        const categoryId = parseInt(interaction.values[0]);
        const category = db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(categoryId);
        
        if (!category) {
            return interaction.reply({
                content: 'Deze ticket categorie bestaat niet meer.',
                ephemeral: true
            });
        }

        // Clean up stale tickets (open in DB but channel deleted)
        try {
            const stale = db.prepare(`SELECT id, channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'`).all(guild.id, member.id) || [];
            for (const t of stale) {
                const ch = guild.channels.cache.get(t.channel_id);
                if (!ch) {
                    db.prepare(`UPDATE tickets SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE id = ?`).run(member.id, t.id);
                }
            }
        } catch {}

        // Check if user already has an open ticket in this category (after cleanup)
        const existingTicket = db.prepare(
            `SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND category_id = ? AND status = 'open'`
        ).get(guild.id, member.id, categoryId);
        if (existingTicket) {
            return interaction.reply({ content: `Je hebt al een open ticket in de categorie "${category.name}": <#${existingTicket.channel_id}>`, ephemeral: true });
        }

        // Enforce max tickets per user (from config)
        const cfg = getTicketConfig(db, guild.id);
        const maxPerUser = Number(cfg.max_tickets_per_user ?? 3);
        if (Number.isFinite(maxPerUser) && maxPerUser >= 0) {
            const openCount = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'`).get(guild.id, member.id)?.c || 0;
            if (openCount >= maxPerUser) {
                return interaction.reply({ content: `Je hebt al het maximum aantal open tickets (${maxPerUser}). Sluit eerst een ticket voordat je een nieuwe aanmaakt.`, ephemeral: true });
            }
        }

        // Show modal to collect subject and description
        const modal = new ModalBuilder()
            .setCustomId(`ticket_create_modal:${categoryId}`)
            .setTitle(`Nieuw ticket - ${category.name.length > 30 ? category.name.substring(0, 30) : category.name}`);

        const subjectInput = new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Onderwerp')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('ticket_description')
            .setLabel('Beschrijf kort je vraag/probleem')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(subjectInput),
            new ActionRowBuilder().addComponents(descriptionInput)
        );

        await interaction.showModal(modal);
        return;
    }

    // Handle ticket close button
    if (customId === 'ticket_close') {
        const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
        
        if (!ticket) {
            return interaction.reply({
                content: 'Dit is geen geldig ticket kanaal.',
                ephemeral: true
            });
        }

        // Check permissions - only ticket creator, support roles, or admins can close
        const isCreator = ticket.user_id === member.id;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        const category = db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(ticket.category_id);
        const isSupport = category?.support_roles && 
            JSON.parse(category.support_roles).some(roleId => member.roles.cache.has(roleId));

        if (!isCreator && !isAdmin && !isSupport) {
            return interaction.reply({
                content: 'Je hebt geen toestemming om dit ticket te sluiten.',
                ephemeral: true
            });
        }

        // Show close confirmation
        const confirmEmbed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('Ticket sluiten')
            .setDescription('Weet je zeker dat je dit ticket wilt sluiten? Dit kan niet ongedaan worden gemaakt.');

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_confirm_close')
                .setLabel('Sluiten')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('ticket_cancel_close')
                .setLabel('Annuleren')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
        return;
    }

    // Handle close confirmation
    if (customId === 'ticket_confirm_close') {
        const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
        
        if (!ticket) {
            return interaction.update({
                content: 'Dit is geen geldig ticket kanaal.',
                components: [],
                ephemeral: true
            });
        }

        // Update ticket status (retry if columns missing)
        try {
            db.prepare('UPDATE tickets SET status = ?, closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE id = ?').run('closed', interaction.user.id, ticket.id);
        } catch (e) {
            try {
                db.exec(`ALTER TABLE tickets ADD COLUMN closed_at DATETIME`);
            } catch {}
            try {
                db.exec(`ALTER TABLE tickets ADD COLUMN closed_by TEXT`);
            } catch {}
            db.prepare('UPDATE tickets SET status = ?, closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE id = ?').run('closed', interaction.user.id, ticket.id);
        }

        // Disable all components
        const disabledComponents = interaction.message.components.map(row => 
            ActionRowBuilder.from(row).setComponents(
                row.components.map(comp => 
                    ButtonBuilder.from(comp).setDisabled(true)
                )
            )
        );

        await interaction.update({ components: disabledComponents });

        // Build transcript by fetching all messages
        async function buildTranscript(ch) {
            let lastId = undefined;
            const all = [];
            while (true) {
                const batch = await ch.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
                if (!batch || batch.size === 0) break;
                const items = Array.from(batch.values());
                all.push(...items);
                lastId = items[items.length - 1]?.id;
                if (!lastId || batch.size < 100) break;
            }
            // Oldest first
            all.reverse();
            const lines = all.map(m => {
                const time = m.createdAt ? m.createdAt.toISOString() : '';
                const author = m.author ? `${m.author.tag} (${m.author.id})` : 'Onbekend';
                const content = m.content || '';
                const attachments = m.attachments && m.attachments.size > 0 ? ` [bijlagen: ${Array.from(m.attachments.values()).map(a => a.url).join(', ')}]` : '';
                return `[${time}] ${author}: ${content}${attachments}`;
            });
            return lines.join('\n');
        }

        let transcriptText = '';
        let transcriptBuffer;
        try {
            transcriptText = await buildTranscript(channel);
            transcriptBuffer = Buffer.from(transcriptText || 'Geen berichten gevonden.', 'utf-8');
        } catch (e) {
            transcriptText = 'Kon transcript niet genereren.';
            transcriptBuffer = Buffer.from('Kon transcript niet genereren.', 'utf-8');
        }

        const transcriptAttachment = new AttachmentBuilder(transcriptBuffer, { name: `transcript-${channel.name}.txt` });

        // Build a short preview inside the embed using a code block (avoid exceeding embed limits)
        const maxPreview = 1800; // characters
        let preview = transcriptText || '';
        if (preview.length > maxPreview) {
            preview = preview.slice(preview.length - maxPreview);
            const firstNewline = preview.indexOf('\n');
            if (firstNewline > 0) preview = preview.slice(firstNewline + 1);
            preview = '...\n' + preview;
        }
        const previewBlock = preview ? ('\n\n```txt\n' + preview + '\n```\n') : '';

        // Post ticket closure summary with transcript attachment
        const closeEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('Ticket Gesloten')
            .setDescription(`Dit ticket is gesloten door ${interaction.user}.${previewBlock}`)
            .addFields(
                { name: 'Transcript', value: 'Volledig transcript in bijlage: transcript.txt', inline: false },
                { name: 'Gebruiker', value: `<@${ticket.user_id}>`, inline: true },
                { name: 'Categorie', value: ticket.category_id ? `#${ticket.category_id}` : 'Geen', inline: true },
                { name: 'Aangemaakt op', value: new Date(ticket.created_at).toLocaleString('nl-NL'), inline: true }
            )
            .setTimestamp();

        await channel.send({ embeds: [closeEmbed], files: [transcriptAttachment] });

        // Also send to configured log channel if set
        try {
            const cfg = getTicketConfig(db, guild.id);
            const logId = cfg?.log_channel_id;
            const logChannel = logId ? guild.channels.cache.get(logId) : null;
            if (logChannel && logChannel.isTextBased?.()) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('🎫 Ticket gesloten')
                    .setDescription(`Ticket kanaal ${channel} is gesloten.`)
                    .addFields(
                        { name: 'Geopend door', value: `<@${ticket.user_id}>`, inline: true },
                        { name: 'Gesloten door', value: `${interaction.user}`, inline: true },
                        { name: 'Transcript', value: 'Zie bijlage transcript.txt' }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed], files: [transcriptAttachment] });
            }
        } catch (e) {
            console.warn('⚠️ Failed to send ticket log:', e?.message || e);
        }

        // Delete the channel after a delay
        setTimeout(() => {
            channel.delete('Ticket gesloten').catch(console.error);
        }, 10000); // 10 second delay

        return;
    }

    // Handle close cancellation
    if (customId === 'ticket_cancel_close') {
        await interaction.update({
            content: 'Het sluiten van het ticket is geannuleerd.',
            components: [],
            embeds: [],
            ephemeral: true
        });
        return;
    }

    // Handle claim button
    if (customId === 'ticket_claim') {
        const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
        
        if (!ticket) {
            return interaction.reply({
                content: 'Dit is geen geldig ticket kanaal.',
                ephemeral: true
            });
        }

        // Check if already claimed
        if (ticket.claimed_by) {
            return interaction.reply({
                content: `Dit ticket is al geclaimd door <@${ticket.claimed_by}>.`,
                ephemeral: true
            });
        }

        // Check if user has support permissions
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        const category = db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(ticket.category_id);
        const isSupport = category?.support_roles && 
            JSON.parse(category.support_roles).some(roleId => member.roles.cache.has(roleId));

        if (!isAdmin && !isSupport) {
            return interaction.reply({
                content: 'Je hebt geen toestemming om dit ticket te claimen. Alleen support medewerkers kunnen tickets claimen.',
                ephemeral: true
            });
        }

        // Claim the ticket (retry if columns missing)
        try {
            db.prepare('UPDATE tickets SET claimed_by = ?, claimed_at = CURRENT_TIMESTAMP WHERE id = ?').run(interaction.user.id, ticket.id);
        } catch (e) {
            try { db.exec(`ALTER TABLE tickets ADD COLUMN claimed_by TEXT`); } catch {}
            try { db.exec(`ALTER TABLE tickets ADD COLUMN claimed_at DATETIME`); } catch {}
            db.prepare('UPDATE tickets SET claimed_by = ?, claimed_at = CURRENT_TIMESTAMP WHERE id = ?').run(interaction.user.id, ticket.id);
        }

        // Update channel topic
        await channel.setTopic(`[GECLAIMD DOOR ${interaction.user.tag}] ${channel.topic || ''}`.trim());

        // Send claim message
        const claimEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setDescription(`🎫 ${interaction.user} heeft dit ticket geclaimd.`);

        await interaction.reply({ embeds: [claimEmbed] });
        return;
    }

    // Handle transcript button
    if (customId === 'ticket_transcript') {
        const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
        
        if (!ticket) {
            return interaction.reply({
                content: 'Dit is geen geldig ticket kanaal.',
                ephemeral: true
            });
        }

        // Transcript links are disabled; inform the user
        await interaction.reply({
            content: 'Transcript links zijn uitgeschakeld. Indien beschikbaar, wordt een transcript als bijlage gepost in het log kanaal.',
            ephemeral: true
        });
    }
}
