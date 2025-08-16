import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ackUpdate, ackReply } from '../../modules/utils/ack.js';
import { createTicketEmbed } from '../utils/ticketSystem.js';
import { setTicketConfig, getTicketConfig } from '../../modules/tickets/ticketConfig.js';

// --- Ticket Wizard (top-level) ---
const ticketWizardState = new Map(); // key: `${guildId}:${userId}` -> { channelId, categoryId, logChannelId, types: string[], customButtons: Array<{label:string, emoji?:string, style:string, ticket_type:string}>, thread_mode: boolean, overwrite }

function getWizardKey(interaction) {
    return `${interaction.guild.id}:${interaction.user.id}`;
}

function buildWizardEmbed(state) {
    const channelVal = state?.channelId ? `<#${state.channelId}>` : 'Niet gekozen';
    const categoryVal = state?.categoryId ? `<#${state.categoryId}>` : 'Niet gekozen';
    const logVal = state?.logChannelId ? `<#${state.logChannelId}>` : 'Niet gekozen';
    const typesVal = (state?.types?.length ?? 0) > 0 ? `${state.types.length} gekozen` : 'Geen gekozen';
    const customVal = (state?.customButtons?.length ?? 0) > 0 ? `${state.customButtons.length} custom` : 'Geen custom';
    const overwriteVal = state?.overwrite ? 'Ja' : 'Nee';
    const threadVal = state?.thread_mode ? 'Thread' : 'Kanaal';
    return new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎛️ Ticket Wizard')
        .setDescription('Kies de opties hieronder en klik op "Paneel aanmaken" om het ticketpaneel te plaatsen.')
        .addFields(
            { name: 'Plaatsingskanaal', value: channelVal, inline: true },
            { name: 'Categorie', value: categoryVal, inline: true },
            { name: 'Log kanaal', value: logVal, inline: true },
            { name: 'Ticket types', value: typesVal, inline: true },
            { name: 'Custom knoppen', value: customVal, inline: true },
            { name: 'Overschrijven', value: overwriteVal, inline: true },
            { name: 'Ticket modus', value: threadVal, inline: true },
        )
        .setTimestamp();
}

function buildWizardComponents(state) {
    const row1 = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('ticket_wizard_channel')
            .setPlaceholder('Kies kanaal voor panelen')
            .addChannelTypes(ChannelType.GuildText)
            .setMinValues(1)
            .setMaxValues(1)
    );

    const rowCat = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('ticket_wizard_category')
            .setPlaceholder('Kies categorie voor tickets')
            .addChannelTypes(ChannelType.GuildCategory)
            .setMinValues(1)
            .setMaxValues(1)
    );

    const rowLog = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('ticket_wizard_log')
            .setPlaceholder('Kies log kanaal (optioneel)')
            .addChannelTypes(ChannelType.GuildText)
            .setMinValues(1)
            .setMaxValues(1)
    );

    const typeChoices = [
        { label: 'Algemene Hulp', value: 'support', emoji: '🆘' },
        { label: 'Account Probleem', value: 'account', emoji: '👤' },
        { label: 'Speler Report', value: 'player-report', emoji: '🚨' },
        { label: 'Bug Report', value: 'bug-report', emoji: '🐞' },
        { label: 'Unban Aanvraag', value: 'unban', emoji: '📝' },
        { label: 'Unmute Aanvraag', value: 'unmute', emoji: '🔈' },
    ];
    const rowTypes = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket_wizard_types')
            .setPlaceholder('Kies ticket types (1-5)')
            .setMinValues(1)
            .setMaxValues(5)
            .addOptions(typeChoices.map(t => ({ label: t.label, value: t.value, emoji: t.emoji })))
    );

    const rowBtns = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_wizard_toggle_overwrite')
            .setLabel(state?.overwrite ? 'Overwrite: Aan' : 'Overwrite: Uit')
            .setStyle(state?.overwrite ? ButtonStyle.Danger : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_wizard_toggle_thread')
            .setLabel(state?.thread_mode ? 'Modus: Thread' : 'Modus: Kanaal')
            .setStyle(state?.thread_mode ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_wizard_create_panel')
            .setLabel('Paneel aanmaken')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ticket_wizard_add_custom')
            .setLabel('➕ Custom knop toevoegen')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_wizard_manage')
            .setLabel('🛠️ Beheer panelen')
            .setStyle(ButtonStyle.Secondary)
    );

    // Max 5 rows: 3 selects + 1 select + 1 buttons row = 5
    return [row1, rowCat, rowLog, rowTypes, rowBtns];
}

async function handleTicketWizard(interaction, db) {
    const key = getWizardKey(interaction);
    const state = ticketWizardState.get(key) || { channelId: null, categoryId: null, logChannelId: null, types: [], customButtons: [], thread_mode: false, overwrite: false };
    const embed = buildWizardEmbed(state);
    const components = buildWizardComponents(state);
    await interaction.editReply({ embeds: [embed], components });
}

async function initDefaultPanels(db, guildId, channelId, client, overwrite = false) {
    const { createTicketPanel, getTicketPanelsForGuild, deleteTicketPanel, postTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
    const { addPanelButton } = await import('../../modules/tickets/ticketConfig.js');
    const { clearButtonCache, clearPanelCache } = await import('../../modules/tickets/ticketButtonHandler.js');

    if (overwrite) {
        const panels = getTicketPanelsForGuild(db, guildId);
        for (const p of panels) deleteTicketPanel(db, p.id);
        clearPanelCache();
    }

    const existing = getTicketPanelsForGuild(db, guildId);
    if (existing.length > 0 && !overwrite) {
        return { created: [], reason: 'exists' };
    }

    const presets = [
        { name: 'Support', title: '🎫 Support Tickets', description: 'Vraag hier hulp aan het team.', color: '#2f3136', buttons: [
            { label: 'Algemene Hulp', style: 'PRIMARY', emoji: '🆘', ticket_type: 'support' },
            { label: 'Account Probleem', style: 'SECONDARY', emoji: '👤', ticket_type: 'account' },
        ]},
        { name: 'Reports', title: '🚨 Reports', description: 'Meld spelers of problemen.', color: '#ff5555', buttons: [
            { label: 'Speler Report', style: 'DANGER', emoji: '🚨', ticket_type: 'player-report' },
            { label: 'Bug Report', style: 'SECONDARY', emoji: '🐞', ticket_type: 'bug-report' },
        ]},
        { name: 'Appeals', title: '📝 Appeals', description: 'Vraag een unban/unmute aan.', color: '#ffaa00', buttons: [
            { label: 'Unban Aanvraag', style: 'SUCCESS', emoji: '📝', ticket_type: 'unban' },
            { label: 'Unmute Aanvraag', style: 'SUCCESS', emoji: '🔈', ticket_type: 'unmute' },
        ]},
    ];

    const created = [];
    for (const preset of presets) {
        const panel = await createTicketPanel(db, guildId, preset.name, channelId, {
            title: preset.title,
            description: preset.description,
            color: preset.color,
        });
        for (const btn of preset.buttons) {
            addPanelButton(db, panel.id, {
                label: btn.label,
                style: btn.style,
                emoji: btn.emoji,
                ticket_type: btn.ticket_type,
                use_form: false,
                form_fields: null,
                role_requirement: null,
            });
        }
        clearButtonCache();
        const message = await postTicketPanel(db, client, panel.id);
        created.push({ panel, message });
    }

    return { created };
}

export async function handleTicketWizardComponent(interaction) {
    const db = interaction.client.db;
    const key = `${interaction.guild.id}:${interaction.user.id}`;
    const state = ticketWizardState.get(key) || { channelId: null, overwrite: false };

    try {
        // Handle channel select (support both any select and specific channel select guards)
        if (interaction.customId === 'ticket_wizard_channel' && (interaction.isAnySelectMenu?.() || interaction.isChannelSelectMenu?.())) {
            state.channelId = interaction.values?.[0] || null;
            ticketWizardState.set(key, state);
            await ackUpdate(interaction, { embeds: [buildWizardEmbed(state)], components: buildWizardComponents(state) });
            return;
        }
        if (interaction.customId === 'ticket_wizard_category' && (interaction.isAnySelectMenu?.() || interaction.isChannelSelectMenu?.())) {
            state.categoryId = interaction.values?.[0] || null;
            ticketWizardState.set(key, state);
            await ackUpdate(interaction, { embeds: [buildWizardEmbed(state)], components: buildWizardComponents(state) });
            return;
        }
        if (interaction.customId === 'ticket_wizard_log' && (interaction.isAnySelectMenu?.() || interaction.isChannelSelectMenu?.())) {
            state.logChannelId = interaction.values?.[0] || null;
            ticketWizardState.set(key, state);
            await ackUpdate(interaction, { embeds: [buildWizardEmbed(state)], components: buildWizardComponents(state) });
            return;
        }
        if (interaction.customId === 'ticket_wizard_types' && interaction.isStringSelectMenu?.()) {
            state.types = interaction.values || [];
            ticketWizardState.set(key, state);
            await ackUpdate(interaction, { embeds: [buildWizardEmbed(state)], components: buildWizardComponents(state) });
            return;
        }

        // Handle custom button add (show modal)
        if (interaction.isButton() && interaction.customId === 'ticket_wizard_add_custom') {
            const modal = new ModalBuilder()
                .setCustomId('ticket_wizard_add_custom_modal')
                .setTitle('Custom Ticketknop');
            const label = new TextInputBuilder()
                .setCustomId('label')
                .setLabel('Knop label')
                .setRequired(true)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(40)
                .setPlaceholder('Bijv. Support');
            const type = new TextInputBuilder()
                .setCustomId('ticket_type')
                .setLabel('Ticket type (uniek id, bijv. custom-1)')
                .setRequired(true)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(32)
                .setPlaceholder('Bijv. support');
            const style = new TextInputBuilder()
                .setCustomId('style')
                .setLabel('Stijl: PRIMARY | SECONDARY | SUCCESS | DANGER')
                .setRequired(true)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(10)
                .setPlaceholder('PRIMARY | SECONDARY | SUCCESS | DANGER');
            const options = new TextInputBuilder()
                .setCustomId('options')
                .setLabel('Opties: THREAD|CHANNEL, FORM:YES|NO')
                .setRequired(false)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(40)
                .setPlaceholder('Bijv: THREAD, FORM:NO  of  CHANNEL, FORM:YES');
            const formJson = new TextInputBuilder()
                .setCustomId('form_json')
                .setLabel('Form JSON (optioneel)')
                .setRequired(false)
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1000)
                .setPlaceholder('[{"id":"onderwerp","label":"Onderwerp","style":"SHORT","required":true}]');
            modal.addComponents(
                new ActionRowBuilder().addComponents(label),
                new ActionRowBuilder().addComponents(type),
                new ActionRowBuilder().addComponents(style),
                new ActionRowBuilder().addComponents(options),
                new ActionRowBuilder().addComponents(formJson),
            );
            await interaction.showModal(modal);
            return;
        }

        if (interaction.isButton()) {
            const id = interaction.customId;

            if (id === 'ticket_wizard_back') {
                // Clear management selections and return to main wizard UI
                const stBack = ticketWizardState.get(key) || {};
                delete stBack.managePanelId;
                delete stBack.manageButtonId;
                ticketWizardState.set(key, stBack);
                const embed = buildWizardEmbed(stBack);
                const components = buildWizardComponents(stBack);
                await ackUpdate(interaction, { embeds: [embed], components });
                return;
            }

            if (id === 'ticket_wizard_toggle_overwrite') {
                state.overwrite = !state.overwrite;
                ticketWizardState.set(key, state);
                const embed = buildWizardEmbed(state);
                const components = buildWizardComponents(state);
                await ackUpdate(interaction, { embeds: [embed], components });
                return;
            }
            if (id === 'ticket_wizard_toggle_thread') {
                state.thread_mode = !state.thread_mode;
                ticketWizardState.set(key, state);
                const embed = buildWizardEmbed(state);
                const components = buildWizardComponents(state);
                await ackUpdate(interaction, { embeds: [embed], components });
                return;
            }

            if (id === 'ticket_wizard_create_panel') {
                if (!state.channelId) {
                    await interaction.reply({
                        ephemeral: true,
                        embeds: [new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('❌ Kanaal vereist')
                            .setDescription('Kies eerst een plaatsingskanaal via de select menu.')
                            .setTimestamp()],
                    });
                    return;
                }
                if (!state.types || state.types.length < 1) {
                    await interaction.reply({
                        ephemeral: true,
                        embeds: [new EmbedBuilder()
                            .setColor('#ff9900')
                            .setTitle('⚠️ Kies ticket types')
                            .setDescription('Selecteer ten minste 1 ticket type in de wizard.')
                            .setTimestamp()],
                    });
                    return;
                }

                await interaction.deferReply({ ephemeral: true });

                // Persist category/log choices (optional) in guild_config
                const guildId = interaction.guild.id;
                const ensureRow = db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)');
                ensureRow.run(guildId);
                const updates = [];
                const vals = [];
                if (state.categoryId) { updates.push('ticket_category = ?'); vals.push(state.categoryId); }
                if (state.logChannelId) { updates.push('ticket_log_channel = ?'); vals.push(state.logChannelId); }
                if (updates.length) {
                    db.prepare(`UPDATE guild_config SET ${updates.join(', ')} WHERE guild_id = ?`).run(...vals, guildId);
                }

                // Build a single panel from selected types
                const TYPE_DEF = {
                    'support': { label: 'Algemene Hulp', style: 'PRIMARY', emoji: '🆘' },
                    'account': { label: 'Account Probleem', style: 'SECONDARY', emoji: '👤' },
                    'player-report': { label: 'Speler Report', style: 'DANGER', emoji: '🚨' },
                    'bug-report': { label: 'Bug Report', style: 'SECONDARY', emoji: '🐞' },
                    'unban': { label: 'Unban Aanvraag', style: 'SUCCESS', emoji: '📝' },
                    'unmute': { label: 'Unmute Aanvraag', style: 'SUCCESS', emoji: '🔈' },
                };

                const { createTicketPanel, postTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
                const { addPanelButton, setTicketCategory, setTicketLogChannel } = await import('../../modules/tickets/ticketConfig.js');
                const { clearButtonCache, clearPanelCache } = await import('../../modules/tickets/ticketButtonHandler.js');

                // If overwrite is enabled and there are existing panels, clear them
                if (state.overwrite) {
                    const { getTicketPanelsForGuild, deleteTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
                    const existing = getTicketPanelsForGuild(db, guildId);
                    for (const p of existing) deleteTicketPanel(db, p.id);
                    clearPanelCache();
                }

                // Persist guild ticket config (category, log, thread mode)
                try {
                    setTicketConfig(db, guildId, {
                        ticket_category_id: state.categoryId || null,
                        thread_mode: !!state.thread_mode,
                        log_channel_id: state.logChannelId || null,
                    });
                } catch {}

                const panel = await createTicketPanel(db, guildId, 'Tickets', state.channelId, {
                    title: '🎫 Tickets',
                    description: 'Kies het type ticket dat je wilt openen.',
                    color: '#2f3136',
                });

                const builtButtons = [];
                // Add custom buttons first (may include per-button thread_mode override)
                for (const cb of (state.customButtons || [])) {
                    const safeStyle = ['PRIMARY','SECONDARY','SUCCESS','DANGER'].includes(cb.style) ? cb.style : 'SECONDARY';
                    builtButtons.push({ label: cb.label, style: safeStyle, emoji: cb.emoji, ticket_type: cb.ticket_type, thread_mode: cb.thread_mode, use_form: !!cb.use_form, form_fields: cb.form_fields });
                }
                // Then append standard selected types
                for (const t of (state.types || [])) {
                    const def = TYPE_DEF[t];
                    if (!def) continue;
                    builtButtons.push({ label: def.label, style: def.style, emoji: def.emoji, ticket_type: t });
                }
                // Limit to first 5 buttons (Discord row limit)
                for (const btn of builtButtons.slice(0, 5)) {
                    addPanelButton(db, panel.id, {
                        label: btn.label,
                        style: btn.style,
                        emoji: btn.emoji,
                        ticket_type: btn.ticket_type,
                        use_form: !!btn.use_form,
                        // If using form, store array; else, store thread_mode as metadata object
                        form_fields: btn.use_form ? JSON.stringify(btn.form_fields || []) : ((btn.thread_mode === true || btn.thread_mode === false) ? { thread_mode: btn.thread_mode } : null),
                        role_requirement: null,
                    });
                }
                clearButtonCache();
                const message = await postTicketPanel(db, interaction.client, panel.id);

                const success = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Paneel aangemaakt')
                    .setDescription(`Paneel geplaatst in <#${state.channelId}>`)
                    .addFields(
                        { name: 'Categorie', value: state.categoryId ? `<#${state.categoryId}>` : 'Niet gekozen', inline: true },
                        { name: 'Log kanaal', value: state.logChannelId ? `<#${state.logChannelId}>` : 'Niet gekozen', inline: true },
                        { name: 'Modus', value: state.thread_mode ? 'Thread' : 'Kanaal', inline: true },
                        { name: 'Buttons', value: String((state.types?.length || 0) + (state.customButtons?.length || 0)), inline: true },
                        { name: 'Bericht', value: `[Openen](${message.url})`, inline: false },
                    )
                    .setTimestamp();
                await interaction.editReply({ embeds: [success] });
                return;
            }

            if (id === 'ticket_wizard_manage') {
                // Open management view: select panel
                const { getTicketPanelsForGuild } = await import('../../modules/tickets/ticketPanelManager.js');
                const panels = getTicketPanelsForGuild(db, interaction.guild.id);
                const options = panels.slice(0, 25).map(p => ({ label: `${p.panel_name} (#${p.id})`, value: String(p.id), description: p.embed_title?.slice(0, 90) || ' ' }));
                const embed = new EmbedBuilder()
                    .setColor('#5865f2')
                    .setTitle('🛠️ Beheer Ticketpanelen')
                    .setDescription('Selecteer een paneel om te beheren:')
                    .setTimestamp();
                const rowSel = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('ticket_manage_select_panel')
                        .setPlaceholder(options.length ? 'Kies een paneel' : 'Geen panelen gevonden')
                        .setMinValues(1).setMaxValues(1)
                        .addOptions(options.length ? options : [{ label: 'Geen panelen', value: 'none', description: 'Maak eerst een paneel aan' }])
                );
                const rowBack = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ticket_wizard_back').setLabel('Terug').setStyle(ButtonStyle.Secondary)
                );
                await ackUpdate(interaction, { embeds: [embed], components: [rowSel, rowBack] });
                return;
            }
        }
        
        // Modal submit for custom button
        if (interaction.isModalSubmit?.() && interaction.customId === 'ticket_wizard_add_custom_modal') {
            const key = `${interaction.guild.id}:${interaction.user.id}`;
            const state = ticketWizardState.get(key) || { channelId: null, categoryId: null, logChannelId: null, types: [], customButtons: [], thread_mode: false, overwrite: false };
            const label = interaction.fields.getTextInputValue('label')?.trim();
            const ticket_type = interaction.fields.getTextInputValue('ticket_type')?.trim().toLowerCase();
            const styleInputRaw = interaction.fields.getTextInputValue('style')?.trim();
            const styleInput = styleInputRaw ? styleInputRaw.toUpperCase() : '';
            const allowed = ['PRIMARY','SECONDARY','SUCCESS','DANGER'];
            const style = styleInput ? (allowed.includes(styleInput) ? styleInput : 'SECONDARY') : 'SECONDARY';
            const optionsRaw = interaction.fields.getTextInputValue('options')?.trim().toUpperCase() || '';
            const optParts = optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
            let thread_mode = undefined;
            let use_form = false;
            for (const p of optParts) {
                if (p === 'THREAD') thread_mode = true;
                else if (p === 'CHANNEL') thread_mode = false;
                else if (p === 'FORM:YES') use_form = true;
                else if (p === 'FORM:NO') use_form = false;
            }
            let form_fields = undefined;
            const formJsonText = interaction.fields.getTextInputValue('form_json')?.trim();
            if (use_form) {
                if (!formJsonText) {
                    await interaction.reply({ ephemeral: true, embeds: [
                        new EmbedBuilder().setColor('#ff0000').setTitle('❌ Formulier ontbreekt').setDescription('Je hebt FORM:YES gezet, maar geen Form JSON opgegeven.').setTimestamp()
                    ]});
                    return;
                }
                try {
                    const parsed = JSON.parse(formJsonText);
                    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 5) throw new Error('Form JSON moet een array van 1-5 velden zijn');
                    // light validation
                    for (const f of parsed) {
                        if (typeof f.label !== 'string' || f.label.length < 1 || f.label.length > 45) throw new Error('Elk veld moet een label (<=45) hebben');
                        if (f.style && !['short','paragraph'].includes(String(f.style).toLowerCase())) throw new Error('style moet short of paragraph zijn');
                        if (f.min_length && isNaN(Number(f.min_length))) throw new Error('min_length moet een nummer zijn');
                        if (f.max_length && isNaN(Number(f.max_length))) throw new Error('max_length moet een nummer zijn');
                    }
                    form_fields = parsed;
                } catch (e) {
                    await interaction.reply({ ephemeral: true, embeds: [
                        new EmbedBuilder().setColor('#ff0000').setTitle('❌ Ongeldige Form JSON').setDescription(String(e.message || e)).setTimestamp()
                    ]});
                    return;
                }
            }
            if (!label || !ticket_type) {
                await interaction.reply({ ephemeral: true, embeds: [
                    new EmbedBuilder().setColor('#ff0000').setTitle('❌ Ongeldige invoer').setDescription('Label en ticket type zijn vereist.').setTimestamp()
                ]});
                return;
            }
            // Ensure unique by ticket_type (replace if exists)
            const arr = Array.isArray(state.customButtons) ? state.customButtons : [];
            const idx = arr.findIndex(b => b.ticket_type === ticket_type);
            const newBtn = { label, style, ticket_type, thread_mode, use_form, form_fields };
            if (idx >= 0) arr[idx] = newBtn; else arr.push(newBtn);
            state.customButtons = arr;
            ticketWizardState.set(key, state);
            await interaction.reply({ ephemeral: true, embeds: [
                new EmbedBuilder().setColor('#00cc66').setTitle('✅ Custom knop toegevoegd').setDescription(`Toegevoegd: ${label} (${style})${thread_mode !== undefined ? ` • Modus: ${thread_mode ? 'THREAD' : 'CHANNEL'}` : ''}${use_form ? ' • Formulier: AAN' : ''}`).setTimestamp()
            ]});
            return;
        } if (interaction.isStringSelectMenu?.() && interaction.customId === 'ticket_manage_select_panel') {
            const sel = interaction.values?.[0];
            if (!sel || sel === 'none') {
                await ackUpdate(interaction, { components: [] });
                return;
            }
            const panelId = Number(sel);
            const key2 = `${interaction.guild.id}:${interaction.user.id}`;
            const st = ticketWizardState.get(key2) || {};
            st.managePanelId = panelId;
            ticketWizardState.set(key2, st);

            const { getTicketPanel, createPanelButtons } = await import('../../modules/tickets/ticketPanelManager.js');
            const { getButtonsForPanel } = await import('../../modules/tickets/ticketConfig.js');
            const panel = getTicketPanel(db, panelId);
            const buttons = getButtonsForPanel(db, panelId);
            const btnOptions = buttons.slice(0, 25).map(b => ({ label: `${b.label} [${b.style}]`, value: String(b.id), description: `${b.ticket_type}${b.use_form ? ' • FORM' : ''}`.slice(0, 90) }));

            const embed = new EmbedBuilder()
                .setColor('#5865f2')
                .setTitle(`Beheer: ${panel.panel_name} (#${panel.id})`)
                .setDescription(`Kanaal: <#${panel.channel_id}>\nTitel: ${panel.embed_title || '—'}\nOmschrijving: ${(panel.embed_description || '—').slice(0, 200)}`)
                .setTimestamp();

            const rowActions = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_manage_edit_embed').setLabel('Wijzig embed').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_manage_refresh_panel').setLabel('Refresh paneel').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_wizard_back').setLabel('Terug').setStyle(ButtonStyle.Secondary)
            );
            const rowBtnSel = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_manage_select_button')
                    .setPlaceholder(btnOptions.length ? 'Kies knop om te bewerken' : 'Geen knoppen')
                    .setMinValues(1).setMaxValues(1)
                    .addOptions(btnOptions.length ? btnOptions : [{ label: 'Geen knoppen', value: 'none' }])
            );
            await interaction.deferUpdate();
            await interaction.editReply({ embeds: [embed], components: [rowActions, rowBtnSel] });
            return;
        } if (interaction.isButton() && interaction.customId === 'ticket_manage_edit_embed') {
            const st = ticketWizardState.get(key) || {};
            if (!st.managePanelId) {
                await interaction.reply({ ephemeral: true, content: 'Geen paneel geselecteerd.' });
                return;
            }
            const { getTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
            const p = getTicketPanel(db, st.managePanelId);
            const modal = new ModalBuilder().setCustomId('ticket_manage_edit_embed_modal').setTitle('Wijzig paneel embed');
            const ti = new TextInputBuilder().setCustomId('title').setLabel('Titel').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(p.embed_title || '');
            const de = new TextInputBuilder().setCustomId('description').setLabel('Omschrijving').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setValue(p.embed_description || '');
            const co = new TextInputBuilder().setCustomId('color').setLabel('Kleur (hex, bijv. #2f3136)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setValue(p.embed_color || '');
            modal.addComponents(new ActionRowBuilder().addComponents(ti), new ActionRowBuilder().addComponents(de), new ActionRowBuilder().addComponents(co));
            await interaction.showModal(modal);
            return;
        } if (interaction.isModalSubmit?.() && interaction.customId === 'ticket_manage_edit_embed_modal') {
            const st = ticketWizardState.get(key) || {};
            const title = interaction.fields.getTextInputValue('title')?.trim();
            const description = interaction.fields.getTextInputValue('description')?.trim();
            const color = interaction.fields.getTextInputValue('color')?.trim();
            if (color && !/^#?[0-9A-Fa-f]{6}$/.test(color)) {
                await interaction.deferReply({ ephemeral: true });
                await interaction.editReply({ content: 'Ongeldige kleur. Gebruik bijv. #2f3136' });
                return;
            }
            const { updateTicketPanel, updateOrPostTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
            const updates2 = {};
            if (title !== undefined) updates2.embed_title = title || null;
            if (description !== undefined) updates2.embed_description = description || null;
            if (color !== undefined) updates2.embed_color = (color?.startsWith('#') ? color : (`#${color}`));
            updateTicketPanel(db, st.managePanelId, updates2);
            try { await updateOrPostTicketPanel(db, interaction.client, st.managePanelId); } catch {}
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({ content: '✅ Paneel bijgewerkt.' });
            return;
        } if (interaction.isButton() && interaction.customId === 'ticket_manage_refresh_panel') {
            const st = ticketWizardState.get(key) || {};
            if (!st.managePanelId) { 
                await interaction.deferReply({ ephemeral: true });
                await interaction.editReply({ content: 'Geen paneel geselecteerd.' });
                return; 
            }
            const { updateOrPostTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
            try { await updateOrPostTicketPanel(db, interaction.client, st.managePanelId); } catch (e) { console.error(e); }
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({ content: '🔄 Bericht ververst.' });
            return;
        } if (interaction.isStringSelectMenu?.() && interaction.customId === 'ticket_manage_select_button') {
            const st = ticketWizardState.get(key) || {};
            const val = interaction.values?.[0];
            if (!st.managePanelId || !val || val === 'none') { 
                await interaction.deferUpdate();
                await interaction.editReply({});
                return; 
            }
            st.manageButtonId = Number(val);
            ticketWizardState.set(key, st);
            // Offer actions
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_manage_edit_button').setLabel('Bewerk knop').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_manage_delete_button').setLabel('Verwijder knop').setStyle(ButtonStyle.Danger)
            );
            await interaction.deferUpdate();
            await interaction.editReply({ components: [row] });
            return;
        } if (interaction.isButton() && interaction.customId === 'ticket_manage_edit_button') {
            const st = ticketWizardState.get(key) || {};
            if (!st.manageButtonId) { await interaction.reply({ ephemeral: true, content: 'Geen knop geselecteerd.' }); return; }
            const { getButton } = await import('../../modules/tickets/ticketConfig.js');
            const b = getButton(db, st.manageButtonId);
            if (!b) { await interaction.reply({ ephemeral: true, content: 'Knop niet gevonden.' }); return; }
            const modal = new ModalBuilder().setCustomId('ticket_manage_edit_button_modal').setTitle('Bewerk knop');
            const label = new TextInputBuilder().setCustomId('label').setLabel('Label').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40).setValue(b.label || '');
            const style = new TextInputBuilder().setCustomId('style').setLabel('Stijl (PRIMARY/SECONDARY/SUCCESS/DANGER)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue((b.style || 'SECONDARY'));
            const type = new TextInputBuilder().setCustomId('ticket_type').setLabel('Ticket type').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(b.ticket_type || '');
            const options = new TextInputBuilder().setCustomId('options').setLabel('Opties: THREAD|CHANNEL, FORM:YES|NO').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40);
            const fieldsRaw = (() => { try { return b.form_fields ? JSON.stringify(JSON.parse(b.form_fields), null, 0) : ''; } catch { return typeof b.form_fields === 'string' ? b.form_fields : ''; } })();
            const formJson = new TextInputBuilder().setCustomId('form_json').setLabel('Form JSON (optioneel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setValue(fieldsRaw || '');
            modal.addComponents(
                new ActionRowBuilder().addComponents(label),
                new ActionRowBuilder().addComponents(type),
                new ActionRowBuilder().addComponents(style),
                new ActionRowBuilder().addComponents(options),
                new ActionRowBuilder().addComponents(formJson)
            );
            await interaction.showModal(modal);
            return;
        } if (interaction.isModalSubmit?.() && interaction.customId === 'ticket_manage_edit_button_modal') {
            const st = ticketWizardState.get(key) || {};
            if (!st.managePanelId || !st.manageButtonId) { await interaction.deferReply({ ephemeral: true }); await interaction.editReply({ content: 'Geen selectie.' }); return; }
            const { getButton, updatePanelButton } = await import('../../modules/tickets/ticketConfig.js');
            const existing = getButton(db, st.manageButtonId) || {};

            const label = interaction.fields.getTextInputValue('label')?.trim();
            const ticket_type = interaction.fields.getTextInputValue('ticket_type')?.trim().toLowerCase();
            const styleInput = interaction.fields.getTextInputValue('style')?.trim().toUpperCase();
            const allowed = ['PRIMARY','SECONDARY','SUCCESS','DANGER'];
            const style = allowed.includes(styleInput) ? styleInput : 'SECONDARY';
            const optionsRaw = interaction.fields.getTextInputValue('options')?.trim().toUpperCase() || '';
            const optParts = optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
            let thread_mode = undefined;
            let use_form = undefined;
            for (const p of optParts) {
                if (p === 'THREAD') thread_mode = true;
                else if (p === 'CHANNEL') thread_mode = false;
                else if (p === 'FORM:YES') use_form = true;
                else if (p === 'FORM:NO') use_form = false;
            }

            // Determine final use_form based on provided option or existing value
            const finalUseForm = (use_form !== undefined ? use_form : !!existing.use_form);

            // Parse existing form_fields (could be JSON string)
            const parseExistingFields = () => {
                try {
                    if (existing.form_fields === null || existing.form_fields === undefined) return null;
                    if (typeof existing.form_fields === 'string') return JSON.parse(existing.form_fields);
                    return existing.form_fields;
                } catch { return null; }
            };

            let form_fields = undefined;
            const formJsonText = interaction.fields.getTextInputValue('form_json')?.trim();
            if (finalUseForm === true) {
                // Form mode: expect JSON array if provided, else keep existing
                if (formJsonText) {
                    try {
                        const parsed = JSON.parse(formJsonText);
                        if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 5) throw new Error('Form JSON moet 1-5 velden bevatten');
                        form_fields = parsed;
                    } catch (e) {
                        await interaction.deferReply({ ephemeral: true });
                        await interaction.editReply({ content: `Ongeldige Form JSON: ${e.message || e}` });
                        return;
                    }
                } else {
                    // Keep existing fields in form mode
                    const ex = parseExistingFields();
                    form_fields = Array.isArray(ex) ? ex : [];
                }
            } else {
                // Non-form mode: only store thread override if provided
                if (thread_mode !== undefined) {
                    form_fields = { thread_mode };
                } else {
                    // preserve existing override if present
                    const ex = parseExistingFields();
                    form_fields = ex && !Array.isArray(ex) ? ex : null;
                }
            }

            // Build updates
            const finalTicketType = ticket_type || existing.ticket_type || '';
            const updates = { label, style, ticket_type: finalTicketType, use_form: finalUseForm };
            if (form_fields !== undefined) {
                updates.form_fields = finalUseForm ? form_fields : form_fields; // same variable, clarity
            }

            updatePanelButton(db, st.manageButtonId, updates);
            const { updateOrPostTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
            try { await updateOrPostTicketPanel(db, interaction.client, st.managePanelId); } catch {}
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({ content: '✅ Knop bijgewerkt.' });
            return;
        } if (interaction.isButton() && interaction.customId === 'ticket_manage_delete_button') {
            const st = ticketWizardState.get(key) || {};
            if (!st.managePanelId || !st.manageButtonId) { await interaction.deferReply({ ephemeral: true }); await interaction.editReply({ content: 'Geen knop geselecteerd.' }); return; }
            const { removePanelButton } = await import('../../modules/tickets/ticketConfig.js');
            removePanelButton(db, st.manageButtonId);
            const { updateOrPostTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
            try { await updateOrPostTicketPanel(db, interaction.client, st.managePanelId); } catch {}
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({ content: '🗑️ Knop verwijderd.' });
            return;
        }
    } catch (error) {
        console.error('Ticket wizard component error:', error);
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({ ephemeral: true, embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Wizard Fout')
                        .setDescription('Er ging iets mis bij het verwerken van je actie.')
                        .setTimestamp()
                ]});
            }
        } catch {}
    }
}
// Utility functions for antiinvite and antispam configuration
export async function configureAntiInvite(interaction, db, guildId, options = {}) {
    await interaction.deferReply({ ephemeral: true });

    // Get current config
    let stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    let config = stmt.get(guildId);
    
    if (!config) {
        // Create config if it doesn't exist
        stmt = db.prepare(`
            INSERT INTO guild_config (guild_id) 
            VALUES (?)
        `);
        stmt.run(guildId);
        config = { guild_id: guildId };
    }

    // Get options (from interaction or direct options)
    const enabled = options.enabled !== undefined ? options.enabled : 
        (interaction.options ? interaction.options.getBoolean('enabled') : undefined);
    const defaultState = options.default_state !== undefined ? options.default_state : 
        (interaction.options ? interaction.options.getBoolean('default_state') : undefined);
    const addChannel = options.add_channel || 
        (interaction.options ? interaction.options.getChannel('add_channel') : undefined);
    const removeChannel = options.remove_channel || 
        (interaction.options ? interaction.options.getChannel('remove_channel') : undefined);
    const addExemptChannel = options.add_exempt_channel || 
        (interaction.options ? interaction.options.getChannel('add_exempt_channel') : undefined);
    const removeExemptChannel = options.remove_exempt_channel || 
        (interaction.options ? interaction.options.getChannel('remove_exempt_channel') : undefined);
    const addExemptRole = options.add_exempt_role || 
        (interaction.options ? interaction.options.getRole('add_exempt_role') : undefined);
    const removeExemptRole = options.remove_exempt_role || 
        (interaction.options ? interaction.options.getRole('remove_exempt_role') : undefined);

    // Update enabled if provided
    if (enabled !== undefined && enabled !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_invite_enabled = ? 
            WHERE guild_id = ?
        `);
        stmt.run(enabled ? 1 : 0, guildId);
        config.anti_invite_enabled = enabled ? 1 : 0;
    }

    // Update default state if provided
    if (defaultState !== undefined && defaultState !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_invite_default_state = ? 
            WHERE guild_id = ?
        `);
        stmt.run(defaultState ? 1 : 0, guildId);
        config.anti_invite_default_state = defaultState ? 1 : 0;
    }

    // Handle channel lists
    if (addChannel || removeChannel || addExemptChannel || removeExemptChannel || addExemptRole || removeExemptRole) {
        // Parse current lists
        const channels = config.anti_invite_channels ? JSON.parse(config.anti_invite_channels) : [];
        const exemptChannels = config.anti_invite_exempt_channels ? JSON.parse(config.anti_invite_exempt_channels) : [];
        const exemptRoles = config.anti_invite_exempt_roles ? JSON.parse(config.anti_invite_exempt_roles) : [];

        // Add/remove channels
        if (addChannel && !channels.includes(addChannel.id)) {
            channels.push(addChannel.id);
        }
        if (removeChannel) {
            const index = channels.indexOf(removeChannel.id);
            if (index > -1) channels.splice(index, 1);
        }
        
        if (addExemptChannel && !exemptChannels.includes(addExemptChannel.id)) {
            exemptChannels.push(addExemptChannel.id);
        }
        if (removeExemptChannel) {
            const index = exemptChannels.indexOf(removeExemptChannel.id);
            if (index > -1) exemptChannels.splice(index, 1);
        }
        
        if (addExemptRole && !exemptRoles.includes(addExemptRole.id)) {
            exemptRoles.push(addExemptRole.id);
        }
        if (removeExemptRole) {
            const index = exemptRoles.indexOf(removeExemptRole.id);
            if (index > -1) exemptRoles.splice(index, 1);
        }

        // Update database
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_invite_channels = ?, anti_invite_exempt_channels = ?, anti_invite_exempt_roles = ?
            WHERE guild_id = ?
        `);
        stmt.run(JSON.stringify(channels), JSON.stringify(exemptChannels), JSON.stringify(exemptRoles), guildId);
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Anti-Invite Configuratie Bijgewerkt')
        .setDescription('De anti-invite configuratie is succesvol bijgewerkt!')
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

export async function configureAntiSpam(interaction, db, guildId, options = {}) {
    await interaction.deferReply({ ephemeral: true });

    // Get current config
    let stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    let config = stmt.get(guildId);
    
    if (!config) {
        // Create config if it doesn't exist
        stmt = db.prepare(`
            INSERT INTO guild_config (guild_id) 
            VALUES (?)
        `);
        stmt.run(guildId);
        config = { guild_id: guildId };
    }

    // Get options (from interaction or direct options)
    const enabled = options.enabled !== undefined ? options.enabled : 
        (interaction.options ? interaction.options.getBoolean('enabled') : undefined);
    const defaultState = options.default_state !== undefined ? options.default_state : 
        (interaction.options ? interaction.options.getBoolean('default_state') : undefined);
    const threshold = options.threshold !== undefined ? options.threshold : 
        (interaction.options ? interaction.options.getInteger('threshold') : undefined);
    const timeWindow = options.time_window !== undefined ? options.time_window : 
        (interaction.options ? interaction.options.getInteger('time_window') : undefined);
    const addChannel = options.add_channel || 
        (interaction.options ? interaction.options.getChannel('add_channel') : undefined);
    const removeChannel = options.remove_channel || 
        (interaction.options ? interaction.options.getChannel('remove_channel') : undefined);
    const addExemptChannel = options.add_exempt_channel || 
        (interaction.options ? interaction.options.getChannel('add_exempt_channel') : undefined);
    const removeExemptChannel = options.remove_exempt_channel || 
        (interaction.options ? interaction.options.getChannel('remove_exempt_channel') : undefined);
    const addExemptRole = options.add_exempt_role || 
        (interaction.options ? interaction.options.getRole('add_exempt_role') : undefined);
    const removeExemptRole = options.remove_exempt_role || 
        (interaction.options ? interaction.options.getRole('remove_exempt_role') : undefined);

    // Update enabled if provided
    if (enabled !== undefined && enabled !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_enabled = ? 
            WHERE guild_id = ?
        `);
        stmt.run(enabled ? 1 : 0, guildId);
        config.anti_spam_enabled = enabled ? 1 : 0;
    }

    // Update default state if provided
    if (defaultState !== undefined && defaultState !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_default_state = ? 
            WHERE guild_id = ?
        `);
        stmt.run(defaultState ? 1 : 0, guildId);
        config.anti_spam_default_state = defaultState ? 1 : 0;
    }

    // Update threshold if provided
    if (threshold !== undefined && threshold !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_message_threshold = ? 
            WHERE guild_id = ?
        `);
        stmt.run(threshold, guildId);
    }

    // Update time window if provided
    if (timeWindow !== undefined && timeWindow !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_time_window = ? 
            WHERE guild_id = ?
        `);
        stmt.run(timeWindow, guildId);
    }

    // Handle channel lists
    if (addChannel || removeChannel || addExemptChannel || removeExemptChannel || addExemptRole || removeExemptRole) {
        // Parse current lists
        const channels = config.anti_spam_channels ? JSON.parse(config.anti_spam_channels) : [];
        const exemptChannels = config.anti_spam_exempt_channels ? JSON.parse(config.anti_spam_exempt_channels) : [];
        const exemptRoles = config.anti_spam_exempt_roles ? JSON.parse(config.anti_spam_exempt_roles) : [];

        // Add/remove channels
        if (addChannel && !channels.includes(addChannel.id)) {
            channels.push(addChannel.id);
        }
        if (removeChannel) {
            const index = channels.indexOf(removeChannel.id);
            if (index > -1) channels.splice(index, 1);
        }
        
        if (addExemptChannel && !exemptChannels.includes(addExemptChannel.id)) {
            exemptChannels.push(addExemptChannel.id);
        }
        if (removeExemptChannel) {
            const index = exemptChannels.indexOf(removeExemptChannel.id);
            if (index > -1) exemptChannels.splice(index, 1);
        }
        
        if (addExemptRole && !exemptRoles.includes(addExemptRole.id)) {
            exemptRoles.push(addExemptRole.id);
        }
        if (removeExemptRole) {
            const index = exemptRoles.indexOf(removeExemptRole.id);
            if (index > -1) exemptRoles.splice(index, 1);
        }

        // Update database
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_channels = ?, anti_spam_exempt_channels = ?, anti_spam_exempt_roles = ?
            WHERE guild_id = ?
        `);
        stmt.run(JSON.stringify(channels), JSON.stringify(exemptChannels), JSON.stringify(exemptRoles), guildId);
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Anti-Spam Configuratie Bijgewerkt')
        .setDescription('De anti-spam configuratie is succesvol bijgewerkt!')
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

export async function enableAntiInvite(interaction, db, guildId) {
    return configureAntiInvite(interaction, db, guildId, { enabled: true });
}

export async function disableAntiInvite(interaction, db, guildId) {
    return configureAntiInvite(interaction, db, guildId, { enabled: false });
}

export async function enableAntiSpam(interaction, db, guildId) {
    return configureAntiSpam(interaction, db, guildId, { enabled: true });
}

export async function disableAntiSpam(interaction, db, guildId) {
    return configureAntiSpam(interaction, db, guildId, { enabled: false });
}

export async function showAntiInviteStatus(interaction, db, guildId) {
    await interaction.deferReply({ ephemeral: true });

    // Get current config
    const stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    const config = stmt.get(guildId) || {};

    // Parse lists
    const channels = config.anti_invite_channels ? JSON.parse(config.anti_invite_channels) : [];
    const exemptChannels = config.anti_invite_exempt_channels ? JSON.parse(config.anti_invite_exempt_channels) : [];
    const exemptRoles = config.anti_invite_exempt_roles ? JSON.parse(config.anti_invite_exempt_roles) : [];

    // Format status values
    const enabled = config.anti_invite_enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld';
    const defaultState = config.anti_invite_default_state ? 'Aan' : 'Uit';
    
    let channelList = '';
    if (channels.length > 0) {
        channelList = channels.map(id => `<#${id}>`).join(', ');
    } else {
        channelList = 'Geen specifieke kanalen geconfigureerd';
    }
    
    let exemptChannelList = '';
    if (exemptChannels.length > 0) {
        exemptChannelList = exemptChannels.map(id => `<#${id}>`).join(', ');
    } else {
        exemptChannelList = 'Geen vrijgestelde kanalen';
    }
    
    let exemptRoleList = '';
    if (exemptRoles.length > 0) {
        exemptRoleList = exemptRoles.map(id => `<@&${id}>`).join(', ');
    } else {
        exemptRoleList = 'Geen vrijgestelde rollen';
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Anti-Invite Status')
        .addFields(
            { name: 'Status', value: enabled, inline: true },
            { name: 'Standaard Status', value: defaultState, inline: true },
            { name: 'Specifieke Kanalen', value: channelList, inline: false },
            { name: 'Vrijgestelde Kanalen', value: exemptChannelList, inline: false },
            { name: 'Vrijgestelde Rollen', value: exemptRoleList, inline: false }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

export async function showAntiSpamStatus(interaction, db, guildId) {
    await interaction.deferReply({ ephemeral: true });

    // Get current config
    const stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    const config = stmt.get(guildId) || {};

    // Parse lists
    const channels = config.anti_spam_channels ? JSON.parse(config.anti_spam_channels) : [];
    const exemptChannels = config.anti_spam_exempt_channels ? JSON.parse(config.anti_spam_exempt_channels) : [];
    const exemptRoles = config.anti_spam_exempt_roles ? JSON.parse(config.anti_spam_exempt_roles) : [];

    // Format status values
    const enabled = config.anti_spam_enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld';
    const defaultState = config.anti_spam_default_state ? 'Aan' : 'Uit';
    const threshold = config.anti_spam_message_threshold || 5;
    const timeWindow = config.anti_spam_time_window || 5;
    
    let channelList = '';
    if (channels.length > 0) {
        channelList = channels.map(id => `<#${id}>`).join(', ');
    } else {
        channelList = 'Geen specifieke kanalen geconfigureerd';
    }
    
    let exemptChannelList = '';
    if (exemptChannels.length > 0) {
        exemptChannelList = exemptChannels.map(id => `<#${id}>`).join(', ');
    } else {
        exemptChannelList = 'Geen vrijgestelde kanalen';
    }
    
    let exemptRoleList = '';
    if (exemptRoles.length > 0) {
        exemptRoleList = exemptRoles.map(id => `<@&${id}>`).join(', ');
    } else {
        exemptRoleList = 'Geen vrijgestelde rollen';
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Anti-Spam Status')
        .addFields(
            { name: 'Status', value: enabled, inline: true },
            { name: 'Standaard Status', value: defaultState, inline: true },
            { name: 'Drempel', value: `${threshold} berichten`, inline: true },
            { name: 'Tijdvenster', value: `${timeWindow} seconden`, inline: true },
            { name: 'Specifieke Kanalen', value: channelList, inline: false },
            { name: 'Vrijgestelde Kanalen', value: exemptChannelList, inline: false },
            { name: 'Vrijgestelde Rollen', value: exemptRoleList, inline: false }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

export default {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configureer de bot instellingen')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('welkom')
                .setDescription('Stel welkomstberichten in')
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het kanaal voor welkomstberichten')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('rol')
                        .setDescription('De rol die toegewezen moet worden aan nieuwe leden')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('titel')
                        .setDescription('De titel van het welkomstbericht')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('bericht')
                        .setDescription('Het welkomstbericht ({user}, {guild}, {member_count})')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('kleur')
                        .setDescription('De kleur van de embed (hex code, bijv. #00ff00)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('afbeelding')
                        .setDescription('De URL van de afbeelding in de embed (gebruik "user_avatar" voor de profielfoto)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('footer')
                        .setDescription('De footer tekst van de embed')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('embed_enabled')
                        .setDescription('Of de welkomstboodschap een embed moet zijn')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tickets')
                .setDescription('Open de Ticket Wizard (beheer panelen en knoppen)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tellen')
                .setDescription('Stel tel kanaal in')
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het kanaal voor tellen')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('birthday_channel')
                .setDescription('Stel het kanaal in voor verjaardagsberichten')
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het kanaal voor verjaardagen')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('shop')
                .setDescription('Shop instellingen beheren')
                .addStringOption(option =>
                    option.setName('actie')
                        .setDescription('Wat wil je doen?')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Item toevoegen', value: 'add' },
                            { name: 'Item verwijderen', value: 'remove' },
                            { name: 'Shop bekijken', value: 'view' },
                            { name: 'Shop resetten', value: 'reset' }
                        ))
                .addStringOption(option =>
                    option.setName('naam')
                        .setDescription('Naam van het item')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('beschrijving')
                        .setDescription('Beschrijving van het item')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('prijs')
                        .setDescription('Prijs van het item')
                        .setRequired(false)
                        .setMinValue(1))
                .addStringOption(option =>
                    option.setName('categorie')
                        .setDescription('Categorie van het item')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Jobs', value: 'Jobs' },
                            { name: 'Ranks', value: 'Ranks' },
                            { name: 'Items', value: 'Items' },
                            { name: 'Boosters', value: 'Boosters' },
                            { name: 'Cosmetics', value: 'Cosmetics' },
                            { name: 'Tools', value: 'Tools' },
                            { name: 'Food', value: 'Food' },
                            { name: 'Other', value: 'Other' }
                        ))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type van het item')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Job Unlock', value: 'job' },
                            { name: 'Rank/Role', value: 'role' },
                            { name: 'Money Multiplier', value: 'multiplier' },
                            { name: 'Cosmetic Item', value: 'cosmetic' },
                            { name: 'Other', value: 'other' }
                        ))
                .addStringOption(option =>
                    option.setName('data')
                        .setDescription('Extra data (bijv. role ID, job naam, multiplier waarde)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('levels')
                .setDescription('Stel level systeem in')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Level systeem aan/uit')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('level_up_kanaal')
                        .setDescription('Het kanaal waar level up berichten komen')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('xp_per_message')
                        .setDescription('Hoeveel XP per bericht (standaard: 15-25)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100))
                .addIntegerOption(option =>
                    option.setName('xp_per_minute_voice')
                        .setDescription('Hoeveel XP per minuut in voice (standaard: 5)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(50))
                .addIntegerOption(option =>
                    option.setName('message_cooldown')
                        .setDescription('Cooldown tussen XP berichten in seconden (standaard: 60)')
                        .setRequired(false)
                        .setMinValue(10)
                        .setMaxValue(300))
                .addStringOption(option =>
                    option.setName('embed_image')
                        .setDescription('Afbeelding voor level embeds (URL)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('embed_footer')
                        .setDescription('Footer tekst voor level embeds')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('embed_color')
                        .setDescription('Kleur voor level embeds (hex code, bijv. #00ff00)')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('reset_embed')
                        .setDescription('Reset embed instellingen naar standaard')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('member_count')
                .setDescription('Stel member count voice kanaal in')
                .addChannelOption(option =>
                    option.setName('kanaal')
                        .setDescription('Het voice kanaal dat de member count toont')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('format')
                        .setDescription('Het format voor de member count (gebruik {count} voor aantal)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('invites')
                .setDescription('Stel invite tracking in')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Invite tracking aan/uit')
                        .setRequired(true))
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
                .setName('antispam')
                .setDescription('Anti-spam systeem instellingen')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Anti-spam systeem aan/uit')
                        .setRequired(false))
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
                .setName('economy')
                .setDescription('Economie-instellingen')
                .addBooleanOption(option =>
                    option.setName('rob_enabled')
                        .setDescription('Zet het /rob commando aan of uit')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option.setName('inventory_enabled')
                        .setDescription('Inventory systeem aan/uit (ook via economy)')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option.setName('inventory_public_viewing')
                        .setDescription('Mogen users elkaars inventory bekijken?')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('inventory_max_items_per_category')
                        .setDescription('Max items per categorie (0 = onbeperkt)')
                        .setMinValue(0)
                        .setMaxValue(100)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Bekijk huidige configuratie')),

    async execute(interaction) {
        // Defer the reply immediately at the start
        await interaction.deferReply({ ephemeral: true }); 

        const subcommand = interaction.options.getSubcommand();
        const db = interaction.client.db;
        
        console.log(`⚙️ [config] Processing subcommand: ${subcommand} for user ${interaction.user.tag}`);
        
        try {
            await ensureConfigTableExists(db);

            switch (subcommand) {
                case 'welkom':
                    await handleWelcomeConfig(interaction, db);
                    break;
                case 'tickets':
                    await handleTicketWizard(interaction, db);
                    break;
                case 'tellen':
                    await handleCountingConfig(interaction, db);
                    break;
                case 'birthday_channel':
                    await handleBirthdayChannelConfig(interaction, db);
                    break;
                case 'view':
                    await handleViewConfig(interaction, db);
                    break;
                case 'shop':
                    await handleShopConfig(interaction, db);
                    break;
                case 'levels':
                    await handleLevelsConfig(interaction, db);
                    break;
                case 'member_count':
                    await handleMemberCountConfig(interaction, db);
                    break;
                case 'invites':
                    await handleInvitesConfig(interaction, db);
                    break;
                case 'warns':
                    await handleWarnsConfig(interaction, db);
                    break;
                case 'antiinvite':
                    await handleAntiInviteConfig(interaction, db);
                    break;
                case 'antispam':
                    await handleAntiSpamConfig(interaction, db);
                    break;
                case 'economy':
                    await handleEconomyConfig(interaction, db);
                    break;
                default:
                    console.error(`❌ [config] Unknown subcommand: ${subcommand}`);
                    const unknownEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Onbekend Subcommando')
                        .setDescription(`Het subcommando "${subcommand}" is onbekend.`)
                        .setTimestamp();
                    await interaction.editReply({ embeds: [unknownEmbed] });
                    break;
            }
            
            console.log(`✅ [config] Subcommand ${subcommand} completed successfully`);
            
        } catch (error) {
            console.error(`❌ [config] Error in subcommand ${subcommand}:`, error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Er is een fout opgetreden')
                .setDescription('Er is een onverwachte fout opgetreden bij het uitvoeren van dit commando. Probeer het later opnieuw.')
                .setTimestamp();

            // Check if the interaction is still available and not replied to
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        }
    },
};

async function ensureConfigTableExists(db) {
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS shop_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                price INTEGER NOT NULL,
                category TEXT DEFAULT 'Other',
                type TEXT DEFAULT 'other',
                item_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        db.prepare(`
            CREATE TABLE IF NOT EXISTS guild_config (
                guild_id TEXT PRIMARY KEY
            )
        `).run();

        db.prepare(`
            CREATE TABLE IF NOT EXISTS welcome_logs (
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                welcomed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, guild_id)
            )
        `).run();

        // Create user inventory table
        db.prepare(`
            CREATE TABLE IF NOT EXISTS user_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                item_id INTEGER NOT NULL,
                quantity INTEGER DEFAULT 1,
                acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                item_data TEXT,
                FOREIGN KEY (item_id) REFERENCES shop_items (id),
                UNIQUE(user_id, guild_id, item_id)
            )
        `).run();
        
        const columns = [
            { name: 'welcome_channel', type: 'TEXT' },
            { name: 'welcome_role', type: 'TEXT' },
            { name: 'welcome_title', type: 'TEXT' },
            { name: 'welcome_message', type: 'TEXT' },
            { name: 'welcome_color', type: 'TEXT' },
            { name: 'welcome_image', type: 'TEXT' },
            { name: 'welcome_footer', type: 'TEXT' },
            { name: 'welcome_embed_enabled', type: 'INTEGER' },
            { name: 'counting_channel', type: 'TEXT' },
            { name: 'counting_number', type: 'INTEGER' },
            { name: 'birthday_channel', type: 'TEXT' },
            { name: 'ticket_channel', type: 'TEXT' },
            { name: 'ticket_category', type: 'TEXT' },
            { name: 'ticket_staff_role', type: 'TEXT' },
            { name: 'ticket_log_channel', type: 'TEXT' },
            { name: 'levels_enabled', type: 'INTEGER' },
            { name: 'level_up_channel', type: 'TEXT' },
            { name: 'xp_per_message', type: 'INTEGER' },
            { name: 'xp_per_minute_voice', type: 'INTEGER' },
            { name: 'message_cooldown', type: 'INTEGER' },
            { name: 'level_embed_image', type: 'TEXT' },
            { name: 'level_embed_footer', type: 'TEXT' },
            { name: 'level_embed_color', type: 'TEXT' },
            { name: 'member_count_channel', type: 'TEXT' },
            { name: 'member_count_format', type: 'TEXT' },
            { name: 'invites_enabled', type: 'INTEGER' },
            { name: 'invite_log_channel', type: 'TEXT' },
            { name: 'warns_enabled', type: 'INTEGER' },
            { name: 'inventory_enabled', type: 'INTEGER' },
            { name: 'inventory_public_viewing', type: 'INTEGER' },
            { name: 'inventory_max_items_per_category', type: 'INTEGER' },
            { name: 'rob_enabled', type: 'INTEGER' },
        ];

        const existingColumns = db.prepare('PRAGMA table_info(guild_config)').all().map(c => c.name);

        for (const col of columns) {
            if (!existingColumns.includes(col.name)) {
                console.log(`📊 [config] Adding missing column "${col.name}" to guild_config table.`);
                db.prepare(`ALTER TABLE guild_config ADD COLUMN ${col.name} ${col.type}`).run();
            }
        }
        
        createLevelingTables(db);
        createInviteTrackingTables(db);
        createBirthdayTable(db);
        
        console.log('✅ [config] guild_config table is up-to-date');
        
    } catch (e) {
        console.error('❌ [config] Error ensuring guild_config table exists:', e);
    }
}

// Economy config: toggle rob feature
async function handleEconomyConfig(interaction, db) {
    const guildId = interaction.guild.id;
    const robEnabled = interaction.options.getBoolean('rob_enabled');
    const inventoryEnabled = interaction.options.getBoolean('inventory_enabled');
    const inventoryPublic = interaction.options.getBoolean('inventory_public_viewing');
    const inventoryMaxPerCat = interaction.options.getInteger('inventory_max_items_per_category');

    // Ensure row exists
    let existing = db.prepare('SELECT guild_id FROM guild_config WHERE guild_id = ?').get(guildId);
    if (!existing) {
        db.prepare('INSERT INTO guild_config (guild_id, rob_enabled) VALUES (?, 0)').run(guildId);
    }

    // Build dynamic updates for provided options
    const updates = [];
    const values = [];
    if (robEnabled !== null && robEnabled !== undefined) {
        updates.push('rob_enabled = ?');
        values.push(robEnabled ? 1 : 0);
    }
    if (inventoryEnabled !== null && inventoryEnabled !== undefined) {
        updates.push('inventory_enabled = ?');
        values.push(inventoryEnabled ? 1 : 0);
    }
    if (inventoryPublic !== null && inventoryPublic !== undefined) {
        updates.push('inventory_public_viewing = ?');
        values.push(inventoryPublic ? 1 : 0);
    }
    if (inventoryMaxPerCat !== null && inventoryMaxPerCat !== undefined) {
        updates.push('inventory_max_items_per_category = ?');
        values.push(inventoryMaxPerCat);
    }

    if (updates.length > 0) {
        const sql = `UPDATE guild_config SET ${updates.join(', ')} WHERE guild_id = ?`;
        db.prepare(sql).run(...values, guildId);
    }

    // Fetch current settings to display
    const cfg = db.prepare('SELECT rob_enabled, inventory_enabled, inventory_public_viewing, inventory_max_items_per_category FROM guild_config WHERE guild_id = ?').get(guildId) || {};
    const color = cfg.rob_enabled ? '#00cc66' : '#ff9900';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('💰 Economie & Inventory Instellingen Bijgewerkt')
        .addFields(
            { name: 'Rob commando', value: cfg.rob_enabled ? 'Aan' : 'Uit', inline: true },
            { name: 'Inventory', value: cfg.inventory_enabled ? 'Aan' : 'Uit', inline: true },
            { name: 'Public viewing', value: cfg.inventory_public_viewing ? 'Aan' : 'Uit', inline: true },
            { name: 'Max per categorie', value: (cfg.inventory_max_items_per_category ?? 0) === 0 ? 'Onbeperkt' : String(cfg.inventory_max_items_per_category), inline: true },
        )
        .setDescription('Je kunt dit later opnieuw aanpassen via `/config economy`.')
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

function createLevelingTables(db) {
    // User levels table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_levels (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 0,
            total_xp INTEGER DEFAULT 0,
            last_message DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, guild_id)
        )
    `).run();

    // User boosters table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_boosters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            type TEXT NOT NULL,
            multiplier REAL NOT NULL,
            expires_at DATETIME NOT NULL,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // Voice activity tracking
    db.prepare(`
        CREATE TABLE IF NOT EXISTS voice_activity (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            joined_at DATETIME NOT NULL,
            PRIMARY KEY (user_id, guild_id)
        )
    `).run();
}

function createInviteTrackingTables(db) {
    // Invite tracking table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS invite_tracking (
            guild_id TEXT NOT NULL,
            invite_code TEXT NOT NULL,
            inviter_id TEXT NOT NULL,
            uses INTEGER DEFAULT 0,
            max_uses INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id, invite_code)
        )
    `).run();

    // User invites table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_invites (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            invites INTEGER DEFAULT 0,
            fake_invites INTEGER DEFAULT 0,
            left_invites INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, guild_id)
        )
    `).run();
}

function createBirthdayTable(db) {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS user_birthdays (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            birth_date TEXT NOT NULL,
            year INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, guild_id)
        )
    `).run();
}

async function handleWelcomeConfig(interaction, db) {
    const guildId = interaction.guild.id;

    const channel = interaction.options.getChannel('kanaal');
    const role = interaction.options.getRole('rol');
    const title = interaction.options.getString('titel');
    const message = interaction.options.getString('bericht');
    const color = interaction.options.getString('kleur');
    const image = interaction.options.getString('afbeelding');
    const footer = interaction.options.getString('footer');
    const embedEnabled = interaction.options.getBoolean('embed_enabled');

    // 1. Zorg dat er een rij bestaat
    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }

    // 2. Bouw een dynamische UPDATE statement
    const updates = [];
    const values = [];

    if (channel) {
        updates.push("welcome_channel = ?");
        values.push(channel.id);
    }
    if (role) {
        updates.push("welcome_role = ?");
        values.push(role.id);
    }
    if (title !== null) {
        updates.push("welcome_title = ?");
        values.push(title);
    }
    if (message !== null) {
        updates.push("welcome_message = ?");
        values.push(message);
    }
    if (color !== null) {
        updates.push("welcome_color = ?");
        values.push(color);
    }
    if (image !== null) {
        updates.push("welcome_image = ?");
        values.push(image);
    }
    if (footer !== null) {
        updates.push("welcome_footer = ?");
        values.push(footer);
    }
    if (embedEnabled !== null) {
        updates.push("welcome_embed_enabled = ?");
        values.push(embedEnabled ? 1 : 0);
    }

    if (updates.length > 0) {
        const updateStmt = `UPDATE guild_config SET ${updates.join(", ")} WHERE guild_id = ?`;
        db.prepare(updateStmt).run(...values, guildId);
    }

    // 3. Geef feedback
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Welkomst Configuratie')
        .addFields(
            { name: 'Kanaal', value: `${channel}`, inline: true },
            { name: 'Rol', value: role ? `${role}` : 'Niet ingesteld', inline: true },
            { name: 'Embed Aan?', value: embedEnabled ? 'Ja' : 'Nee', inline: true },
            { name: 'Titel', value: title || 'Niet ingesteld', inline: false },
            { name: 'Bericht', value: message || 'Niet ingesteld', inline: false },
            { name: 'Kleur', value: color || 'Niet ingesteld', inline: true },
            { name: 'Afbeelding', value: image || 'Niet ingesteld', inline: true },
            { name: 'Footer', value: footer || 'Niet ingesteld', inline: false }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}


async function handleTicketConfig(interaction, db) {
    const guildId = interaction.guild.id;

    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }

    // Get current ticket config
    let config = getTicketConfig(db, guildId);
    
    // Get options
    const category = interaction.options.getChannel('category');
    const channel = interaction.options.getChannel('channel');
    const threadMode = interaction.options.getBoolean('thread_mode');
    const logChannel = interaction.options.getChannel('log_channel');
    
    // If no options provided, show current config
    if (!category && !channel && threadMode === null && !logChannel) {
        if (!config) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('⚙️ Ticket Configuratie')
                .setDescription('Ticket systeem is nog niet geconfigureerd.')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('⚙️ Ticket Configuratie')
            .setDescription('Huidige ticket systeem instellingen:')
            .setTimestamp();
        
        if (config.ticket_category_id) {
            embed.addFields({ 
                name: '🎫 Categorie', 
                value: `<#${config.ticket_category_id}>`, 
                inline: true 
            });
        } else {
            embed.addFields({ 
                name: '🎫 Categorie', 
                value: 'Niet ingesteld', 
                inline: true 
            });
        }
        
        if (config.ticket_channel_id) {
            embed.addFields({ 
                name: '💬 Thread Kanaal', 
                value: `<#${config.ticket_channel_id}>`, 
                inline: true 
            });
        } else {
            embed.addFields({ 
                name: '💬 Thread Kanaal', 
                value: 'Niet ingesteld', 
                inline: true 
            });
        }
        
        embed.addFields({ 
            name: '🔄 Thread Modus', 
            value: config.thread_mode ? 'Aan' : 'Uit', 
            inline: true 
        });
        
        if (config.log_channel_id) {
            embed.addFields({ 
                name: '📝 Log Kanaal', 
                value: `<#${config.log_channel_id}>`, 
                inline: true 
            });
        } else {
            embed.addFields({ 
                name: '📝 Log Kanaal', 
                value: 'Niet ingesteld', 
                inline: true 
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    // Update config
    const updateData = {};
    
    if (category) {
        updateData.ticket_category_id = category.id;
    }
    
    if (channel) {
        updateData.ticket_channel_id = channel.id;
    }
    
    if (threadMode !== null) {
        updateData.thread_mode = threadMode ? 1 : 0;
    }
    
    if (logChannel) {
        updateData.log_channel_id = logChannel.id;
    }
    
    // If we have a current config, merge updates
    if (config) {
        setTicketConfig(db, guildId, { ...config, ...updateData });
    } else {
        // Create new config
        setTicketConfig(db, guildId, updateData);
    }
    
    // Get updated config
    config = getTicketConfig(db, guildId);
    
    // Update legacy guild_config table for backward compatibility
    const stmt = db.prepare(`
        UPDATE guild_config 
        SET ticket_channel = ?, ticket_category = ?, ticket_log_channel = ?
        WHERE guild_id = ?
    `);
    
    stmt.run(channel?.id, category?.id, logChannel?.id, interaction.guild.id);
    
    // Update new ticket_config table
    const currentConfig = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guildId);
    if (currentConfig) {
        const newConfig = {
            ticket_category_id: category?.id || currentConfig.ticket_category_id,
            ticket_channel_id: channel?.id || currentConfig.ticket_channel_id,
            thread_mode: threadMode !== null ? (threadMode ? 1 : 0) : currentConfig.thread_mode,
            log_channel_id: logChannel?.id || currentConfig.log_channel_id
        };
        
        const updateStmt = db.prepare(`
            UPDATE ticket_config 
            SET ticket_category_id = ?, ticket_channel_id = ?, thread_mode = ?, log_channel_id = ?
            WHERE guild_id = ?
        `);
        updateStmt.run(
            newConfig.ticket_category_id,
            newConfig.ticket_channel_id,
            newConfig.thread_mode,
            newConfig.log_channel_id,
            guildId
        );
    } else {
        const insertStmt = db.prepare(`
            INSERT INTO ticket_config (guild_id, ticket_category_id, ticket_channel_id, thread_mode, log_channel_id)
            VALUES (?, ?, ?, ?, ?)
        `);
        insertStmt.run(category?.id, channel?.id, guildId, threadMode ? 1 : 0, logChannel?.id);
    }

    if (channel) {
        await createTicketEmbed(channel);
    }

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Ticket Configuratie Bijgewerkt')
        .setDescription('De ticket configuratie is succesvol bijgewerkt.')
        .setTimestamp();
    
    if (config.ticket_category_id) {
        embed.addFields({ 
            name: '🎫 Categorie', 
            value: `<#${config.ticket_category_id}>`, 
            inline: true 
        });
    }
    
    if (config.ticket_channel_id) {
        embed.addFields({ 
            name: '💬 Thread Kanaal', 
            value: `<#${config.ticket_channel_id}>`, 
            inline: true 
        });
    }
    
    embed.addFields({ 
        name: '🔄 Thread Modus', 
        value: config.thread_mode ? 'Aan' : 'Uit', 
        inline: true 
    });
    
    if (config.log_channel_id) {
        embed.addFields({ 
            name: '📝 Log Kanaal', 
            value: `<#${config.log_channel_id}>`, 
            inline: true 
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleCountingConfig(interaction, db) {
    const guildId = interaction.guild.id;
    const channel = interaction.options.getChannel('kanaal');

    // 1. Zorg dat de rij bestaat
    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }

    // 2. UPDATE alleen de nodige kolommen
    db.prepare(`
        UPDATE guild_config SET counting_channel = ?, counting_number = 0 WHERE guild_id = ?
    `).run(channel.id, guildId);

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔢 Tel Kanaal Configuratie')
        .addFields(
            { name: 'Kanaal', value: `${channel}`, inline: true },
            { name: 'Startgetal', value: '0', inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleBirthdayChannelConfig(interaction, db) {
    const guildId = interaction.guild.id;

    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }
    
    const channel = interaction.options.getChannel('kanaal');

    try {
        // Ensure the column exists before inserting
        db.prepare(`
            UPDATE guild_config 
            SET birthday_channel = ?
            WHERE guild_id = ?
        `).run(channel.id, interaction.guild.id);

        console.log(`🎂 [config] Birthday channel set to ${channel.name} (${channel.id}) for guild ${interaction.guild.name}`);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🎂 Verjaardag Kanaal Configuratie')
            .addFields(
                { name: 'Kanaal', value: `${channel}`, inline: true }
            )
            .setDescription('Het verjaardag kanaal is ingesteld! Gebruik `/birthday set` om je verjaardag in te stellen.')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('❌ [config] Error setting birthday channel:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Er is een fout opgetreden bij het instellen van het verjaardag kanaal.')
            .setTimestamp();
            
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleShopConfig(interaction, db) {
    const guildId = interaction.guild.id;

    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }

    const action = interaction.options.getString('actie');
    const name = interaction.options.getString('naam');
    const description = interaction.options.getString('beschrijving');
    const price = interaction.options.getInteger('prijs');
    const category = interaction.options.getString('categorie');
    const type = interaction.options.getString('type');
    const data = interaction.options.getString('data');

    console.log(`🏪 [config.shop] Processing action: ${action} for guild ${interaction.guild.name}`);

    switch (action) {
        case 'add':
            if (!name || !price) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Fout')
                    .setDescription('Naam en prijs zijn verplicht om een item toe te voegen!')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const stmt = db.prepare(`
                INSERT INTO shop_items (guild_id, name, description, price, category, type, item_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(
                guildId,
                name,
                description || 'Geen beschrijving',
                price,
                category || 'Other',
                type || 'other',
                data
            );

            console.log(`✅ [config.shop] Added item "${name}" for ${price} coins`);

            const addEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🏪 Item Toegevoegd')
                .addFields(
                    { name: 'Naam', value: name, inline: true },
                    { name: 'Prijs', value: `${price} coins`, inline: true },
                    { name: 'Categorie', value: category || 'Other', inline: true },
                    { name: 'Type', value: type || 'other', inline: true },
                    { name: 'Beschrijving', value: description || 'Geen beschrijving', inline: false }
                )
                .setTimestamp();

            if (data) {
                addEmbed.addFields({ name: 'Extra Data', value: data, inline: false });
            }

            await interaction.editReply({ embeds: [addEmbed] });
            break;

        case 'remove':
            if (!name) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Fout')
                    .setDescription('Naam is verplicht om een item te verwijderen!')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const deleteStmt = db.prepare('DELETE FROM shop_items WHERE guild_id = ? AND name = ?');
            const result = deleteStmt.run(guildId, name);

            if (result.changes === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⚠️ Niet Gevonden')
                    .setDescription(`Item "${name}" niet gevonden in de shop.`)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            console.log(`🗑️ [config.shop] Removed item "${name}"`);

            const removeEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🗑️ Item Verwijderd')
                .setDescription(`Item "${name}" is succesvol verwijderd uit de shop.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [removeEmbed] });
            break;

        case 'view':
            const viewStmt = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? ORDER BY category, price');
            const items = viewStmt.all(guildId);

            if (!items || items.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('🏪 Shop Leeg')
                    .setDescription('Er zijn nog geen items in de shop.')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const categories = {};
            items.forEach(item => {
                if (!categories[item.category]) {
                    categories[item.category] = [];
                }
                categories[item.category].push(item);
            });

            const viewEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🏪 Shop Overzicht')
                .setDescription(`Totaal ${items.length} items in de shop`)
                .setTimestamp();

            Object.keys(categories).forEach(cat => {
                const categoryItems = categories[cat];
                const itemList = categoryItems.map(item => 
                    `**${item.name}** - ${item.price} coins (${item.type})`
                ).join('\n');
                
                viewEmbed.addFields({
                    name: `${getCategoryEmoji(cat)} ${cat} (${categoryItems.length})`,
                    value: itemList.length > 1024 ? itemList.substring(0, 1021) + '...' : itemList,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [viewEmbed] });
            break;

        case 'reset':
            const resetStmt = db.prepare('DELETE FROM shop_items WHERE guild_id = ?');
            const resetResult = resetStmt.run(guildId);

            const resetEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🗑️ Shop Gereset')
                .setDescription(`Alle ${resetResult.changes} items zijn verwijderd uit de shop.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [resetEmbed] });
            break;
    }
}

async function handleLevelsConfig(interaction, db) {
    const guildId = interaction.guild.id;

    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }

    const enabled = interaction.options.getBoolean('enabled');
    const levelUpChannel = interaction.options.getChannel('level_up_kanaal');
    const xpPerMessage = interaction.options.getInteger('xp_per_message') || 20;
    const xpPerMinuteVoice = interaction.options.getInteger('xp_per_minute_voice') || 5;
    const messageCooldown = interaction.options.getInteger('message_cooldown') || 60;
    const embedImage = interaction.options.getString('embed_image');
    const embedFooter = interaction.options.getString('embed_footer');
    const embedColor = interaction.options.getString('embed_color');
    const resetEmbed = interaction.options.getBoolean('reset_embed');

    // Build dynamic update statement
    const updates = [];
    const values = [];

    if (enabled !== null) {
        updates.push("levels_enabled = ?");
        values.push(enabled ? 1 : 0);
    }
    
    if (levelUpChannel) {
        updates.push("level_up_channel = ?");
        values.push(levelUpChannel.id);
    }
    
    if (xpPerMessage !== null) {
        updates.push("xp_per_message = ?");
        values.push(xpPerMessage);
    }
    
    if (xpPerMinuteVoice !== null) {
        updates.push("xp_per_minute_voice = ?");
        values.push(xpPerMinuteVoice);
    }
    
    if (messageCooldown !== null) {
        updates.push("message_cooldown = ?");
        values.push(messageCooldown);
    }
    
    if (resetEmbed) {
        // Reset embed settings to null
        updates.push("level_embed_image = ?, level_embed_footer = ?, level_embed_color = ?");
        values.push(null, null, null);
    } else {
        if (embedImage !== null) {
            updates.push("level_embed_image = ?");
            values.push(embedImage);
        }
        
        if (embedFooter !== null) {
            updates.push("level_embed_footer = ?");
            values.push(embedFooter);
        }
        
        if (embedColor !== null) {
            updates.push("level_embed_color = ?");
            values.push(embedColor);
        }
    }

    if (updates.length > 0) {
        const updateStmt = `UPDATE guild_config SET ${updates.join(", ")} WHERE guild_id = ?`;
        db.prepare(updateStmt).run(...values, guildId);
    }

    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00ff00' : '#ff9900')
        .setTitle('📊 Level Systeem Configuratie')
        .addFields(
            { name: 'Status', value: enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld', inline: true },
            { name: 'Level Up Kanaal', value: levelUpChannel ? `${levelUpChannel}` : 'Niet ingesteld', inline: true },
            { name: 'XP per Bericht', value: `${xpPerMessage}`, inline: true },
            { name: 'XP per Minuut Voice', value: `${xpPerMinuteVoice}`, inline: true },
            { name: 'Bericht Cooldown', value: `${messageCooldown}s`, inline: true }
        )
        .setTimestamp();

    // Add embed customization info if any options were provided
    const embedCustomizations = [];
    if (embedImage !== null) {
        embedCustomizations.push(`Afbeelding: ${embedImage || 'Verwijderd'}`);
    }
    if (embedFooter !== null) {
        embedCustomizations.push(`Footer: ${embedFooter || 'Verwijderd'}`);
    }
    if (embedColor !== null) {
        embedCustomizations.push(`Kleur: ${embedColor || 'Verwijderd'}`);
    }
    if (resetEmbed) {
        embedCustomizations.push('Embed instellingen gereset naar standaard');
    }

    if (embedCustomizations.length > 0) {
        embed.addFields({ name: 'Embed Aanpassingen', value: embedCustomizations.join('\n'), inline: false });
    }

    if (enabled) {
        embed.setDescription('Het level systeem is nu actief! Gebruikers krijgen XP voor berichten en voice chat.');
    } else {
        embed.setDescription('Het level systeem is uitgeschakeld.');
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleMemberCountConfig(interaction, db) {
    const guildId = interaction.guild.id;

    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }

    const channel = interaction.options.getChannel('kanaal');
    const format = interaction.options.getString('format') || 'Leden: {count}';

    const stmt = db.prepare(`
        UPDATE guild_config 
        SET member_count_channel = ?, member_count_format = ?
        WHERE guild_id = ?
    `);
    
    stmt.run(channel.id, format, interaction.guild.id);

    // Update the channel name immediately
    try {
        const memberCount = interaction.guild.memberCount;
        const channelName = format.replace('{count}', memberCount);
        await channel.setName(channelName);
    } catch (error) {
        console.error('❌ [config] Error updating member count channel:', error);
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('👥 Member Count Configuratie')
        .addFields(
            { name: 'Kanaal', value: `${channel}`, inline: true },
            { name: 'Format', value: format, inline: true },
            { name: 'Huidige Count', value: `${interaction.guild.memberCount}`, inline: true }
        )
        .setDescription('Het member count kanaal is ingesteld en wordt automatisch bijgewerkt!')
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleInvitesConfig(interaction, db) {
    const guildId = interaction.guild.id;

    // 1. Zorg dat de rij bestaat
    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }

    // 2. Haal opties op
    const enabled = interaction.options.getBoolean('enabled');
    const logChannel = interaction.options.getChannel('log_kanaal');

    // 3. Voer veilige update uit
    const stmt = db.prepare(`
        UPDATE guild_config 
        SET invites_enabled = ?, invite_log_channel = ?
        WHERE guild_id = ?
    `);
    stmt.run(enabled ? 1 : 0, logChannel?.id, guildId);

    // 4. Extra setup indien ingeschakeld
    if (enabled) {
        try {
            const invites = await interaction.guild.invites.fetch();

            const deleteStmt = db.prepare('DELETE FROM invite_tracking WHERE guild_id = ?');
            deleteStmt.run(guildId);

            const insertStmt = db.prepare(`
                INSERT INTO invite_tracking (guild_id, invite_code, inviter_id, uses, max_uses)
                VALUES (?, ?, ?, ?, ?)
            `);

            invites.forEach(invite => {
                insertStmt.run(
                    guildId,
                    invite.code,
                    invite.inviter?.id || 'unknown',
                    invite.uses || 0,
                    invite.maxUses || 0
                );
            });

            console.log(`📊 [config] Initialized invite tracking with ${invites.size} invites`);
        } catch (error) {
            console.error('❌ [config] Error initializing invite tracking:', error);
        }
    }

    // 5. Bevestiging sturen
    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00ff00' : '#ff9900')
        .setTitle('📨 Invite Tracking Configuratie')
        .addFields(
            { name: 'Status', value: enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld', inline: true },
            { name: 'Log Kanaal', value: logChannel ? `${logChannel}` : 'Niet ingesteld', inline: true }
        )
        .setDescription(enabled
            ? 'Invite tracking is nu actief! De bot houdt bij wie welke invites gebruikt.'
            : 'Invite tracking is uitgeschakeld.')
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}



async function handleViewConfig(interaction, db) {
    const guildId = interaction.guild.id;

    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }


    const stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    const config = stmt.get(interaction.guild.id);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('⚙️ Server Configuratie')
        .setTimestamp();

    if (!config) {
        embed.setDescription('Geen configuratie gevonden. Gebruik de config commando\'s om de bot in te stellen.');
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    const fields = [];
    
    if (config.welcome_channel) {
        fields.push({
            name: '👋 Welkomst',
            value: `Kanaal: <#${config.welcome_channel}>\n${config.welcome_role ? `Rol: <@&${config.welcome_role}>` : 'Rol: Niet ingesteld'}\nEmbed: ${config.welcome_embed_enabled ? 'Ja' : 'Nee'}\nTitel: ${config.welcome_title || 'Niet ingesteld'}\nBericht: ${config.welcome_message || 'Niet ingesteld'}\nKleur: ${config.welcome_color || 'Niet ingesteld'}\nAfbeelding: ${config.welcome_image || 'Niet ingesteld'}\nFooter: ${config.welcome_footer || 'Niet ingesteld'}`,
            inline: false
        });
    }

    if (config.ticket_channel) {
        fields.push({
            name: '🎫 Tickets',
            value: `Kanaal: <#${config.ticket_channel}>\nCategorie: <#${config.ticket_category}>\nStaff Rol: ${config.ticket_staff_role ? `<@&${config.ticket_staff_role}>` : 'Niet ingesteld'}\nLog Kanaal: ${config.ticket_log_channel ? `<#${config.ticket_log_channel}>` : 'Niet ingesteld'}`,
            inline: false
        });
    }

    if (config.counting_channel) {
        fields.push({
            name: '🔢 Tellen',
            value: `Kanaal: <#${config.counting_channel}>\nHuidig getal: ${config.counting_number || 0}`,
            inline: false
        });
    }

    if (config.birthday_channel) {
        fields.push({
            name: '🎂 Verjaardagen',
            value: `Kanaal: <#${config.birthday_channel}>`,
            inline: false
        });
    }

    if (config.levels_enabled) {
        fields.push({
            name: '📊 Level Systeem',
            value: `Status: ${config.levels_enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld'}\nLevel Up Kanaal: ${config.level_up_channel ? `<#${config.level_up_channel}>` : 'Niet ingesteld'}\nXP per Bericht: ${config.xp_per_message || 20}\nXP per Minuut Voice: ${config.xp_per_minute_voice || 5}\nBericht Cooldown: ${config.message_cooldown || 60}s`,
            inline: false
        });
    }

    if (config.member_count_channel) {
        fields.push({
            name: '👥 Member Count',
            value: `Kanaal: <#${config.member_count_channel}>\nFormat: ${config.member_count_format || 'Leden: {count}'}`,
            inline: false
        });
    }

    if (config.invites_enabled) {
        fields.push({
            name: '📨 Invite Tracking',
            value: `Status: ${config.invites_enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld'}\nLog Kanaal: ${config.invite_log_channel ? `<#${config.invite_log_channel}>` : 'Niet ingesteld'}`,
            inline: false
        });
    }

    if (config.warns_enabled !== null) {
        fields.push({
            name: '⚠️ Waarschuwingen',
            value: `Status: ${config.warns_enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld'}`,
            inline: false
        });
    }

    if (config.inventory_enabled !== null) {
        let inventoryValue = `Status: ${config.inventory_enabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld'}`;
        
        if (config.inventory_enabled && config.inventory_public_viewing !== null) {
            inventoryValue += `\nPubliek Bekijken: ${config.inventory_public_viewing ? '✅ Toegestaan' : '❌ Niet toegestaan'}`;
        }
        
        if (config.inventory_enabled && config.inventory_max_items_per_category !== null) {
            inventoryValue += `\nMax Items per Categorie: ${config.inventory_max_items_per_category === 0 ? 'Onbeperkt' : config.inventory_max_items_per_category}`;
        }

        fields.push({
            name: '🎒 Inventory Systeem',
            value: inventoryValue,
            inline: false
        });
    }

    if (fields.length === 0) {
        embed.setDescription('Geen modules geconfigureerd.');
    } else {
        embed.addFields(fields);
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleWarnsConfig(interaction, db) {
    const guildId = interaction.guild.id;

    const existing = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
    if (!existing) {
        db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    }

    const enabled = interaction.options.getBoolean('enabled');

    const stmt = db.prepare(`
        UPDATE guild_config 
        SET warns_enabled = ?
        WHERE guild_id = ?
    `);
    stmt.run(enabled ? 1 : 0, guildId);

    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00ff00' : '#ff0000')
        .setTitle('⚠️ Waarschuwingssysteem bijgewerkt')
        .setDescription(`Het waarschuwingssysteem is nu **${enabled ? 'ingeschakeld' : 'uitgeschakeld'}**.`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

function getCategoryEmoji(category) {
    const emojis = {
        'Jobs': '💼',
        'Ranks': '🏆',
        'Items': '📦',
        'Boosters': '⚡',
        'Cosmetics': '✨',
        'Tools': '🔧',
        'Food': '🍕',
        'Other': '❓'
    };
    return emojis[category] || '📦';
}

async function handleAntiInviteConfig(interaction, db) {
    const guildId = interaction.guild.id;

    // Get current config
    let stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    let config = stmt.get(guildId);
    
    if (!config) {
        // Create config if it doesn't exist
        stmt = db.prepare(`
            INSERT INTO guild_config (guild_id) 
            VALUES (?)
        `);
        stmt.run(guildId);
        config = { guild_id: guildId };
    }

    // Get options
    const enabled = interaction.options.getBoolean('enabled');
    const defaultState = interaction.options.getBoolean('default_state');
    const addChannel = interaction.options.getChannel('add_channel');
    const removeChannel = interaction.options.getChannel('remove_channel');
    const addExemptChannel = interaction.options.getChannel('add_exempt_channel');
    const removeExemptChannel = interaction.options.getChannel('remove_exempt_channel');
    const addExemptRole = interaction.options.getRole('add_exempt_role');
    const removeExemptRole = interaction.options.getRole('remove_exempt_role');

    // Update enabled if provided
    if (enabled !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_invite_enabled = ? 
            WHERE guild_id = ?
        `);
        stmt.run(enabled ? 1 : 0, guildId);
        config.anti_invite_enabled = enabled ? 1 : 0;
    }

    // Update default state if provided
    if (defaultState !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_invite_default_state = ? 
            WHERE guild_id = ?
        `);
        stmt.run(defaultState ? 1 : 0, guildId);
        config.anti_invite_default_state = defaultState ? 1 : 0;
    }

    // Handle channel lists
    if (addChannel || removeChannel || addExemptChannel || removeExemptChannel || addExemptRole || removeExemptRole) {
        // Parse current lists
        const channels = config.anti_invite_channels ? JSON.parse(config.anti_invite_channels) : [];
        const exemptChannels = config.anti_invite_exempt_channels ? JSON.parse(config.anti_invite_exempt_channels) : [];
        const exemptRoles = config.anti_invite_exempt_roles ? JSON.parse(config.anti_invite_exempt_roles) : [];

        // Add/remove channels
        if (addChannel && !channels.includes(addChannel.id)) {
            channels.push(addChannel.id);
        }
        if (removeChannel) {
            const index = channels.indexOf(removeChannel.id);
            if (index > -1) channels.splice(index, 1);
        }
        
        if (addExemptChannel && !exemptChannels.includes(addExemptChannel.id)) {
            exemptChannels.push(addExemptChannel.id);
        }
        if (removeExemptChannel) {
            const index = exemptChannels.indexOf(removeExemptChannel.id);
            if (index > -1) exemptChannels.splice(index, 1);
        }
        
        if (addExemptRole && !exemptRoles.includes(addExemptRole.id)) {
            exemptRoles.push(addExemptRole.id);
        }
        if (removeExemptRole) {
            const index = exemptRoles.indexOf(removeExemptRole.id);
            if (index > -1) exemptRoles.splice(index, 1);
        }

        // Update database
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_invite_channels = ?, anti_invite_exempt_channels = ?, anti_invite_exempt_roles = ?
            WHERE guild_id = ?
        `);
        stmt.run(JSON.stringify(channels), JSON.stringify(exemptChannels), JSON.stringify(exemptRoles), guildId);
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Anti-Invite Configuratie Bijgewerkt')
        .setDescription('De anti-invite configuratie is succesvol bijgewerkt!')
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleAntiSpamConfig(interaction, db) {
    const guildId = interaction.guild.id;

    // Get current config
    let stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
    let config = stmt.get(guildId);
    
    if (!config) {
        // Create config if it doesn't exist
        stmt = db.prepare(`
            INSERT INTO guild_config (guild_id) 
            VALUES (?)
        `);
        stmt.run(guildId);
        config = { guild_id: guildId };
    }

    // Get options
    const enabled = interaction.options.getBoolean('enabled');
    const defaultState = interaction.options.getBoolean('default_state');
    const threshold = interaction.options.getInteger('threshold');
    const timeWindow = interaction.options.getInteger('time_window');
    const addChannel = interaction.options.getChannel('add_channel');
    const removeChannel = interaction.options.getChannel('remove_channel');
    const addExemptChannel = interaction.options.getChannel('add_exempt_channel');
    const removeExemptChannel = interaction.options.getChannel('remove_exempt_channel');
    const addExemptRole = interaction.options.getRole('add_exempt_role');
    const removeExemptRole = interaction.options.getRole('remove_exempt_role');

    // Update enabled if provided
    if (enabled !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_enabled = ? 
            WHERE guild_id = ?
        `);
        stmt.run(enabled ? 1 : 0, guildId);
        config.anti_spam_enabled = enabled ? 1 : 0;
    }

    // Update default state if provided
    if (defaultState !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_default_state = ? 
            WHERE guild_id = ?
        `);
        stmt.run(defaultState ? 1 : 0, guildId);
        config.anti_spam_default_state = defaultState ? 1 : 0;
    }

    // Update threshold if provided
    if (threshold !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_message_threshold = ? 
            WHERE guild_id = ?
        `);
        stmt.run(threshold, guildId);
    }

    // Update time window if provided
    if (timeWindow !== null) {
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_time_window = ? 
            WHERE guild_id = ?
        `);
        stmt.run(timeWindow, guildId);
    }

    // Handle channel lists
    if (addChannel || removeChannel || addExemptChannel || removeExemptChannel || addExemptRole || removeExemptRole) {
        // Parse current lists
        const channels = config.anti_spam_channels ? JSON.parse(config.anti_spam_channels) : [];
        const exemptChannels = config.anti_spam_exempt_channels ? JSON.parse(config.anti_spam_exempt_channels) : [];
        const exemptRoles = config.anti_spam_exempt_roles ? JSON.parse(config.anti_spam_exempt_roles) : [];

        // Add/remove channels
        if (addChannel && !channels.includes(addChannel.id)) {
            channels.push(addChannel.id);
        }
        if (removeChannel) {
            const index = channels.indexOf(removeChannel.id);
            if (index > -1) channels.splice(index, 1);
        }
        
        if (addExemptChannel && !exemptChannels.includes(addExemptChannel.id)) {
            exemptChannels.push(addExemptChannel.id);
        }
        if (removeExemptChannel) {
            const index = exemptChannels.indexOf(removeExemptChannel.id);
            if (index > -1) exemptChannels.splice(index, 1);
        }
        
        if (addExemptRole && !exemptRoles.includes(addExemptRole.id)) {
            exemptRoles.push(addExemptRole.id);
        }
        if (removeExemptRole) {
            const index = exemptRoles.indexOf(removeExemptRole.id);
            if (index > -1) exemptRoles.splice(index, 1);
        }

        // Update database
        stmt = db.prepare(`
            UPDATE guild_config 
            SET anti_spam_channels = ?, anti_spam_exempt_channels = ?, anti_spam_exempt_roles = ?
            WHERE guild_id = ?
        `);
        stmt.run(JSON.stringify(channels), JSON.stringify(exemptChannels), JSON.stringify(exemptRoles), guildId);
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Anti-Spam Configuratie Bijgewerkt')
        .setDescription('De anti-spam configuratie is succesvol bijgewerkt!')
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}