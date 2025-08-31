import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } from 'discord.js';
import { ackUpdate } from '../../modules/utils/ack.js';

const ticketWizardState = new Map();

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
    new ChannelSelectMenuBuilder().setCustomId('ticket_wizard_channel').setPlaceholder('Kies kanaal voor panelen').addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
  );
  const rowCat = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('ticket_wizard_category').setPlaceholder('Kies categorie voor tickets').addChannelTypes(ChannelType.GuildCategory).setMinValues(1).setMaxValues(1)
  );
  const rowLog = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('ticket_wizard_log').setPlaceholder('Kies log kanaal (optioneel)').addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
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
    new StringSelectMenuBuilder().setCustomId('ticket_wizard_types').setPlaceholder('Kies ticket types (1-5)').setMinValues(1).setMaxValues(5).addOptions(typeChoices.map(t => ({ label: t.label, value: t.value, emoji: t.emoji })))
  );
  const rowBtns = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_wizard_toggle_overwrite').setLabel(state?.overwrite ? 'Overwrite: Aan' : 'Overwrite: Uit').setStyle(state?.overwrite ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_wizard_toggle_thread').setLabel(state?.thread_mode ? 'Modus: Thread' : 'Modus: Kanaal').setStyle(state?.thread_mode ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_wizard_create_panel').setLabel('Paneel aanmaken').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_wizard_add_custom').setLabel('➕ Custom knop toevoegen').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_wizard_manage').setLabel('🛠️ Beheer panelen').setStyle(ButtonStyle.Secondary)
  );
  return [row1, rowCat, rowLog, rowTypes, rowBtns];
}

export async function handleTicketWizard(interaction, db) {
  const key = getWizardKey(interaction);
  const state = ticketWizardState.get(key) || { channelId: null, categoryId: null, logChannelId: null, types: [], customButtons: [], thread_mode: false, overwrite: false };
  const embed = buildWizardEmbed(state);
  const components = buildWizardComponents(state);
  await interaction.editReply({ embeds: [embed], components });
}

export async function handleTicketWizardComponent(interaction) {
  const db = interaction.client.db;
  const key = `${interaction.guild.id}:${interaction.user.id}`;
  const state = ticketWizardState.get(key) || { channelId: null, overwrite: false };

  try {
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

    if (interaction.isButton() && interaction.customId === 'ticket_wizard_add_custom') {
      const modal = new ModalBuilder().setCustomId('ticket_wizard_add_custom_modal').setTitle('Custom Ticketknop');
      const label = new TextInputBuilder().setCustomId('label').setLabel('Knop label').setRequired(true).setStyle(TextInputStyle.Short).setMaxLength(40);
      const type = new TextInputBuilder().setCustomId('ticket_type').setLabel('Ticket type (uniek id, bijv. custom-1)').setRequired(true).setStyle(TextInputStyle.Short).setMaxLength(32);
      const style = new TextInputBuilder().setCustomId('style').setLabel('Stijl: PRIMARY | SECONDARY | SUCCESS | DANGER').setRequired(true).setStyle(TextInputStyle.Short).setMaxLength(10);
      const options = new TextInputBuilder().setCustomId('options').setLabel('Opties: THREAD|CHANNEL, FORM:YES|NO').setRequired(false).setStyle(TextInputStyle.Short).setMaxLength(40);
      const formJson = new TextInputBuilder().setCustomId('form_json').setLabel('Form JSON (optioneel)').setRequired(false).setStyle(TextInputStyle.Paragraph).setMaxLength(1000);
      modal.addComponents(new ActionRowBuilder().addComponents(label), new ActionRowBuilder().addComponents(type), new ActionRowBuilder().addComponents(style), new ActionRowBuilder().addComponents(options), new ActionRowBuilder().addComponents(formJson));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === 'ticket_wizard_back') {
        const stBack = ticketWizardState.get(key) || {};
        delete stBack.managePanelId;
        delete stBack.manageButtonId;
        ticketWizardState.set(key, stBack);
        await ackUpdate(interaction, { embeds: [buildWizardEmbed(stBack)], components: buildWizardComponents(stBack) });
        return;
      }
      if (id === 'ticket_wizard_toggle_overwrite') {
        state.overwrite = !state.overwrite;
        ticketWizardState.set(key, state);
        await ackUpdate(interaction, { embeds: [buildWizardEmbed(state)], components: buildWizardComponents(state) });
        return;
      }
      if (id === 'ticket_wizard_toggle_thread') {
        state.thread_mode = !state.thread_mode;
        ticketWizardState.set(key, state);
        await ackUpdate(interaction, { embeds: [buildWizardEmbed(state)], components: buildWizardComponents(state) });
        return;
      }

      if (id === 'ticket_wizard_create_panel') {
        if (!state.channelId) {
          await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Kanaal vereist').setDescription('Kies eerst een plaatsingskanaal via de select menu.').setTimestamp()] });
          return;
        }
        if (!state.types || state.types.length < 1) {
          await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff9900').setTitle('⚠️ Kies ticket types').setDescription('Selecteer ten minste 1 ticket type in de wizard.').setTimestamp()] });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        const guildId = interaction.guild.id;
        const ensureRow = db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)');
        ensureRow.run(guildId);
        const updates = [];
        const vals = [];
        if (state.categoryId) { updates.push('ticket_category = ?'); vals.push(state.categoryId); }
        if (state.logChannelId) { updates.push('ticket_log_channel = ?'); vals.push(state.logChannelId); }
        if (updates.length) { db.prepare(`UPDATE guild_config SET ${updates.join(', ')} WHERE guild_id = ?`).run(...vals, guildId); }

        const TYPE_DEF = {
          'support': { label: 'Algemene Hulp', style: 'PRIMARY', emoji: '🆘' },
          'account': { label: 'Account Probleem', style: 'SECONDARY', emoji: '👤' },
          'player-report': { label: 'Speler Report', style: 'DANGER', emoji: '🚨' },
          'bug-report': { label: 'Bug Report', style: 'SECONDARY', emoji: '🐞' },
          'unban': { label: 'Unban Aanvraag', style: 'SUCCESS', emoji: '📝' },
          'unmute': { label: 'Unmute Aanvraag', style: 'SUCCESS', emoji: '🔈' },
        };

        const { createTicketPanel, postTicketPanel, getTicketPanelsForGuild, deleteTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
        const { addPanelButton, setTicketConfig } = await import('../../modules/tickets/ticketConfig.js');
        const { clearButtonCache, clearPanelCache } = await import('../../modules/tickets/ticketButtonHandler.js');

        if (state.overwrite) {
          const existing = getTicketPanelsForGuild(db, guildId);
          for (const p of existing) deleteTicketPanel(db, p.id);
          clearPanelCache();
        }

        try {
          setTicketConfig(db, guildId, { ticket_category_id: state.categoryId || null, thread_mode: !!state.thread_mode, log_channel_id: state.logChannelId || null });
        } catch {}

        const panel = await createTicketPanel(db, guildId, 'Tickets', state.channelId, { title: '🎫 Tickets', description: 'Kies het type ticket dat je wilt openen.', color: '#2f3136' });

        const builtButtons = [];
        for (const cb of (state.customButtons || [])) {
          const safeStyle = ['PRIMARY','SECONDARY','SUCCESS','DANGER'].includes(cb.style) ? cb.style : 'SECONDARY';
          builtButtons.push({ label: cb.label, style: safeStyle, emoji: cb.emoji, ticket_type: cb.ticket_type, thread_mode: cb.thread_mode, use_form: !!cb.use_form, form_fields: cb.form_fields });
        }
        for (const t of (state.types || [])) {
          const def = TYPE_DEF[t];
          if (!def) continue;
          builtButtons.push({ label: def.label, style: def.style, emoji: def.emoji, ticket_type: t });
        }
        for (const btn of builtButtons.slice(0, 5)) {
          addPanelButton(db, panel.id, {
            label: btn.label,
            style: btn.style,
            emoji: btn.emoji,
            ticket_type: btn.ticket_type,
            use_form: !!btn.use_form,
            form_fields: btn.use_form ? JSON.stringify(btn.form_fields || []) : ((btn.thread_mode === true || btn.thread_mode === false) ? { thread_mode: btn.thread_mode } : null),
            role_requirement: null,
          });
        }
        clearButtonCache();
        const message = await postTicketPanel(db, interaction.client, panel.id);

        const success = new EmbedBuilder().setColor('#00ff00').setTitle('✅ Paneel aangemaakt').setDescription(`Paneel geplaatst in <#${state.channelId}>`).addFields(
          { name: 'Categorie', value: state.categoryId ? `<#${state.categoryId}>` : 'Niet gekozen', inline: true },
          { name: 'Log kanaal', value: state.logChannelId ? `<#${state.logChannelId}>` : 'Niet gekozen', inline: true },
          { name: 'Modus', value: state.thread_mode ? 'Thread' : 'Kanaal', inline: true },
          { name: 'Buttons', value: String((state.types?.length || 0) + (state.customButtons?.length || 0)), inline: true },
          { name: 'Bericht', value: `[Openen](${message.url})`, inline: false },
        ).setTimestamp();
        await interaction.editReply({ embeds: [success] });
        return;
      }

      if (id === 'ticket_wizard_manage') {
        const { getTicketPanelsForGuild } = await import('../../modules/tickets/ticketPanelManager.js');
        const panels = getTicketPanelsForGuild(db, interaction.guild.id);
        const options = panels.slice(0, 25).map(p => ({ label: `${p.panel_name} (#${p.id})`, value: String(p.id), description: p.embed_title?.slice(0, 90) || ' ' }));
        const embed = new EmbedBuilder().setColor('#5865f2').setTitle('🛠️ Beheer Ticketpanelen').setDescription('Selecteer een paneel om te beheren:').setTimestamp();
        const rowSel = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket_manage_select_panel').setPlaceholder(options.length ? 'Kies een paneel' : 'Geen panelen gevonden').setMinValues(1).setMaxValues(1).addOptions(options.length ? options : [{ label: 'Geen panelen', value: 'none', description: 'Maak eerst een paneel aan' }]));
        const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_wizard_back').setLabel('Terug').setStyle(ButtonStyle.Secondary));
        await ackUpdate(interaction, { embeds: [embed], components: [rowSel, rowBack] });
        return;
      }
    }

    if (interaction.isModalSubmit?.() && interaction.customId === 'ticket_wizard_add_custom_modal') {
      const key2 = `${interaction.guild.id}:${interaction.user.id}`;
      const st = ticketWizardState.get(key2) || { channelId: null, categoryId: null, logChannelId: null, types: [], customButtons: [], thread_mode: false, overwrite: false };
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
      for (const p of optParts) { if (p === 'THREAD') thread_mode = true; else if (p === 'CHANNEL') thread_mode = false; else if (p === 'FORM:YES') use_form = true; else if (p === 'FORM:NO') use_form = false; }
      let form_fields = undefined;
      const formJsonText = interaction.fields.getTextInputValue('form_json')?.trim();
      if (use_form) {
        if (!formJsonText) { await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Formulier ontbreekt').setDescription('Je hebt FORM:YES gezet, maar geen Form JSON opgegeven.').setTimestamp()] }); return; }
        try {
          const parsed = JSON.parse(formJsonText);
          if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 5) throw new Error('Form JSON moet een array van 1-5 velden zijn');
          for (const f of parsed) {
            if (typeof f.label !== 'string' || f.label.length < 1 || f.label.length > 45) throw new Error('Elk veld moet een label (<=45) hebben');
            if (f.style && !['short','paragraph'].includes(String(f.style).toLowerCase())) throw new Error('style moet short of paragraph zijn');
            if (f.min_length && isNaN(Number(f.min_length))) throw new Error('min_length moet een nummer zijn');
            if (f.max_length && isNaN(Number(f.max_length))) throw new Error('max_length moet een nummer zijn');
          }
          form_fields = parsed;
        } catch (e) {
          await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Ongeldige Form JSON').setDescription(String(e.message || e)).setTimestamp()] });
          return;
        }
      }
      if (!label || !ticket_type) {
        await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Ongeldige invoer').setDescription('Label en ticket type zijn vereist.').setTimestamp()] });
        return;
      }
      const arr = Array.isArray(st.customButtons) ? st.customButtons : [];
      const idx = arr.findIndex(b => b.ticket_type === ticket_type);
      const newBtn = { label, style, ticket_type, thread_mode, use_form, form_fields };
      if (idx >= 0) arr[idx] = newBtn; else arr.push(newBtn);
      st.customButtons = arr;
      ticketWizardState.set(key2, st);
      await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#00cc66').setTitle('✅ Custom knop toegevoegd').setDescription(`Toegevoegd: ${label} (${style})${thread_mode !== undefined ? ` • Modus: ${thread_mode ? 'THREAD' : 'CHANNEL'}` : ''}${use_form ? ' • Formulier: AAN' : ''}`).setTimestamp()] });
      return;
    }

    // Management flows (edit embed/buttons, refresh)
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'ticket_manage_select_panel') {
      const sel = interaction.values?.[0];
      if (!sel || sel === 'none') { await ackUpdate(interaction, { components: [] }); return; }
      const panelId = Number(sel);
      const st = ticketWizardState.get(key) || {};
      st.managePanelId = panelId;
      ticketWizardState.set(key, st);
      const { getTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
      const { getButtonsForPanel } = await import('../../modules/tickets/ticketConfig.js');
      const panel = getTicketPanel(db, panelId);
      const buttons = getButtonsForPanel(db, panelId);
      const btnOptions = buttons.slice(0, 25).map(b => ({ label: `${b.label} [${b.style}]`, value: String(b.id), description: `${b.ticket_type}${b.use_form ? ' • FORM' : ''}`.slice(0, 90) }));
      const embed = new EmbedBuilder().setColor('#5865f2').setTitle(`Beheer: ${panel.panel_name} (#${panel.id})`).setDescription(`Kanaal: <#${panel.channel_id}>
Titel: ${panel.embed_title || '—'}
Omschrijving: ${(panel.embed_description || '—').slice(0, 200)}`).setTimestamp();
      const rowActions = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_manage_edit_embed').setLabel('Wijzig embed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_manage_refresh_panel').setLabel('Refresh paneel').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_wizard_back').setLabel('Terug').setStyle(ButtonStyle.Secondary)
      );
      const rowBtnSel = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket_manage_select_button').setPlaceholder(btnOptions.length ? 'Kies knop om te bewerken' : 'Geen knoppen').setMinValues(1).setMaxValues(1).addOptions(btnOptions.length ? btnOptions : [{ label: 'Geen knoppen', value: 'none' }]));
      await interaction.deferUpdate();
      await interaction.editReply({ embeds: [embed], components: [rowActions, rowBtnSel] });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket_manage_edit_embed') {
      const st = ticketWizardState.get(key) || {};
      if (!st.managePanelId) { await interaction.reply({ ephemeral: true, content: 'Geen paneel geselecteerd.' }); return; }
      const { getTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
      const p = getTicketPanel(db, st.managePanelId);
      const modal = new ModalBuilder().setCustomId('ticket_manage_edit_embed_modal').setTitle('Wijzig paneel embed');
      const ti = new TextInputBuilder().setCustomId('title').setLabel('Titel').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(p.embed_title || '');
      const de = new TextInputBuilder().setCustomId('description').setLabel('Omschrijving').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setValue(p.embed_description || '');
      const co = new TextInputBuilder().setCustomId('color').setLabel('Kleur (hex, bijv. #2f3136)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setValue(p.embed_color || '');
      modal.addComponents(new ActionRowBuilder().addComponents(ti), new ActionRowBuilder().addComponents(de), new ActionRowBuilder().addComponents(co));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit?.() && interaction.customId === 'ticket_manage_edit_embed_modal') {
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
    }

    if (interaction.isButton() && interaction.customId === 'ticket_manage_refresh_panel') {
      const st = ticketWizardState.get(key) || {};
      if (!st.managePanelId) { await interaction.deferReply({ ephemeral: true }); await interaction.editReply({ content: 'Geen paneel geselecteerd.' }); return; }
      const { updateOrPostTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
      try { await updateOrPostTicketPanel(db, interaction.client, st.managePanelId); } catch (e) { console.error(e); }
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ content: '🔄 Bericht ververst.' });
      return;
    }

    if (interaction.isStringSelectMenu?.() && interaction.customId === 'ticket_manage_select_button') {
      const st = ticketWizardState.get(key) || {};
      const val = interaction.values?.[0];
      if (!st.managePanelId || !val || val === 'none') { await interaction.deferUpdate(); await interaction.editReply({}); return; }
      st.manageButtonId = Number(val);
      ticketWizardState.set(key, st);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_manage_edit_button').setLabel('Bewerk knop').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_manage_delete_button').setLabel('Verwijder knop').setStyle(ButtonStyle.Danger)
      );
      await interaction.deferUpdate();
      await interaction.editReply({ components: [row] });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket_manage_edit_button') {
      const { getButton } = await import('../../modules/tickets/ticketConfig.js');
      const st = ticketWizardState.get(key) || {};
      if (!st.manageButtonId) { await interaction.reply({ ephemeral: true, content: 'Geen knop geselecteerd.' }); return; }
      const b = getButton(db, st.manageButtonId);
      if (!b) { await interaction.reply({ ephemeral: true, content: 'Knop niet gevonden.' }); return; }
      const modal = new ModalBuilder().setCustomId('ticket_manage_edit_button_modal').setTitle('Bewerk knop');
      const label = new TextInputBuilder().setCustomId('label').setLabel('Label').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40).setValue(b.label || '');
      const style = new TextInputBuilder().setCustomId('style').setLabel('Stijl (PRIMARY/SECONDARY/SUCCESS/DANGER)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue((b.style || 'SECONDARY'));
      const type = new TextInputBuilder().setCustomId('ticket_type').setLabel('Ticket type').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(b.ticket_type || '');
      const options = new TextInputBuilder().setCustomId('options').setLabel('Opties: THREAD|CHANNEL, FORM:YES|NO').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40);
      const fieldsRaw = (() => { try { return b.form_fields ? JSON.stringify(JSON.parse(b.form_fields), null, 0) : ''; } catch { return typeof b.form_fields === 'string' ? b.form_fields : ''; } })();
      const formJson = new TextInputBuilder().setCustomId('form_json').setLabel('Form JSON (optioneel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setValue(fieldsRaw || '');
      modal.addComponents(new ActionRowBuilder().addComponents(label), new ActionRowBuilder().addComponents(type), new ActionRowBuilder().addComponents(style), new ActionRowBuilder().addComponents(options), new ActionRowBuilder().addComponents(formJson));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit?.() && interaction.customId === 'ticket_manage_edit_button_modal') {
      const { getButton, updatePanelButton } = await import('../../modules/tickets/ticketConfig.js');
      const st = ticketWizardState.get(key) || {};
      if (!st.managePanelId || !st.manageButtonId) { await interaction.deferReply({ ephemeral: true }); await interaction.editReply({ content: 'Geen selectie.' }); return; }
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
      for (const p of optParts) { if (p === 'THREAD') thread_mode = true; else if (p === 'CHANNEL') thread_mode = false; else if (p === 'FORM:YES') use_form = true; else if (p === 'FORM:NO') use_form = false; }
      const finalUseForm = (use_form !== undefined ? use_form : !!existing.use_form);
      const parseExistingFields = () => { try { if (existing.form_fields === null || existing.form_fields === undefined) return null; if (typeof existing.form_fields === 'string') return JSON.parse(existing.form_fields); return existing.form_fields; } catch { return null; } };
      let form_fields = undefined;
      const formJsonText = interaction.fields.getTextInputValue('form_json')?.trim();
      if (finalUseForm === true) {
        if (formJsonText) {
          try {
            const parsed = JSON.parse(formJsonText);
            if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 5) throw new Error('Form JSON moet 1-5 velden bevatten');
            form_fields = parsed;
          } catch (e) { await interaction.deferReply({ ephemeral: true }); await interaction.editReply({ content: `Ongeldige Form JSON: ${e.message || e}` }); return; }
        } else { const ex = parseExistingFields(); form_fields = Array.isArray(ex) ? ex : []; }
      } else {
        if (thread_mode !== undefined) form_fields = { thread_mode }; else { const ex = parseExistingFields(); form_fields = ex && !Array.isArray(ex) ? ex : null; }
      }
      const finalTicketType = ticket_type || existing.ticket_type || '';
      const updates = { label, style, ticket_type: finalTicketType, use_form: finalUseForm };
      if (form_fields !== undefined) updates.form_fields = form_fields;
      updatePanelButton(db, st.manageButtonId, updates);
      const { updateOrPostTicketPanel } = await import('../../modules/tickets/ticketPanelManager.js');
      try { await updateOrPostTicketPanel(db, interaction.client, st.managePanelId); } catch {}
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ content: '✅ Knop bijgewerkt.' });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket_manage_delete_button') {
      const { removePanelButton } = await import('../../modules/tickets/ticketConfig.js');
      const st = ticketWizardState.get(key) || {};
      if (!st.managePanelId || !st.manageButtonId) { await interaction.deferReply({ ephemeral: true }); await interaction.editReply({ content: 'Geen knop geselecteerd.' }); return; }
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
        await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Wizard Fout').setDescription('Er ging iets mis bij het verwerken van je actie.').setTimestamp()] });
      }
    } catch {}
  }
}
