import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, RoleSelectMenuBuilder } from 'discord.js';

function getGuildEcoSettings(db, guildId) {
  const row = db.prepare(`SELECT 
      eco_work_allow_multipliers AS allowMultipliers,
      eco_work_cooldown_minutes AS cooldownMinutes,
      eco_work_gate_mode AS gateMode,
      eco_work_panel_channel_id AS panelChannelId,
      rob_enabled AS robEnabled,
      inventory_enabled AS inventoryEnabled,
      inventory_public_viewing AS inventoryPublic,
      COALESCE(roulette_enabled, 0) AS rouletteEnabled,
      COALESCE(roulette_min_bet, 10) AS rouletteMinBet,
      COALESCE(roulette_max_bet, 1000) AS rouletteMaxBet,
      COALESCE(roulette_cooldown_seconds, 30) AS rouletteCooldown,
      COALESCE(slot_enabled, 0) AS slotEnabled,
      COALESCE(slot_min_bet, 10) AS slotMinBet,
      COALESCE(slot_max_bet, 1000) AS slotMaxBet,
      COALESCE(slot_cooldown_seconds, 30) AS slotCooldown,
      COALESCE(counting_reward_enabled, 0) AS countingRewardEnabled,
      COALESCE(counting_reward_amount, 5) AS countingRewardAmount,
      COALESCE(counting_reward_goal_interval, 10) AS countingRewardInterval,
      counting_reward_specific_goals AS countingRewardGoals,
      COALESCE(poker_enabled, 0) AS pokerEnabled,
      COALESCE(poker_min_bet, 50) AS pokerMinBet,
      COALESCE(poker_max_bet, 2000) AS pokerMaxBet,
      COALESCE(poker_cooldown_seconds, 60) AS pokerCooldown,
      COALESCE(bj_enabled, 0) AS bjEnabled,
      COALESCE(bj_min_bet, 10) AS bjMinBet,
      COALESCE(bj_max_bet, 1000) AS bjMaxBet,
      COALESCE(bj_house_edge, 0.01) AS bjHouseEdge,
      COALESCE(bj_cooldown_seconds, 30) AS bjCooldown
    FROM guild_config WHERE guild_id = ?`).get(guildId) || {};
  const toNum = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  return {
    allowMultipliers: !!row.allowMultipliers,
    cooldownMinutes: toNum(row.cooldownMinutes, 60),
    gateMode: row.gateMode ?? 'level',
    panelChannelId: row.panelChannelId ?? null,
    robEnabled: !!row.robEnabled,
    inventoryEnabled: !!row.inventoryEnabled,
    inventoryPublic: !!row.inventoryPublic,
    rouletteEnabled: !!row.rouletteEnabled,
    rouletteMinBet: toNum(row.rouletteMinBet, 10),
    rouletteMaxBet: toNum(row.rouletteMaxBet, 1000),
    rouletteCooldown: toNum(row.rouletteCooldown, 30),
    slotEnabled: !!row.slotEnabled,
    slotMinBet: toNum(row.slotMinBet, 10),
    slotMaxBet: toNum(row.slotMaxBet, 1000),
    slotCooldown: toNum(row.slotCooldown, 30),
    countingRewardEnabled: !!row.countingRewardEnabled,
    countingRewardAmount: toNum(row.countingRewardAmount, 5),
    countingRewardInterval: toNum(row.countingRewardInterval, 10),
    countingRewardGoals: row.countingRewardGoals ?? null,
    pokerEnabled: !!row.pokerEnabled,
    pokerMinBet: toNum(row.pokerMinBet, 50),
    pokerMaxBet: toNum(row.pokerMaxBet, 2000),
    pokerCooldown: toNum(row.pokerCooldown, 60),
    bjEnabled: !!row.bjEnabled,
    bjMinBet: toNum(row.bjMinBet, 10),
    bjMaxBet: toNum(row.bjMaxBet, 1000),
    bjHouseEdge: Number(row.bjHouseEdge ?? 0.01),
    bjCooldown: toNum(row.bjCooldown, 30),
  };
}

function buildEconomyHomeEmbed(settings, jobsCount) {
  const gate = settings.gateMode || 'level';
  const cd = settings.cooldownMinutes ?? 60;
  const mult = settings.allowMultipliers ? 'Aan' : 'Uit';
  const panel = settings.panelChannelId ? `<#${settings.panelChannelId}>` : 'Niet ingesteld';
  const rob = (settings.robEnabled ? 1 : 0) ? 'Aan' : 'Uit';
  const inv = (settings.inventoryEnabled ? 1 : 0) ? 'Aan' : 'Uit';
  const invPublic = (settings.inventoryPublic ? 1 : 0) ? 'Publiek' : 'Privé';
  return new EmbedBuilder()
    .setColor('#00b894')
    .setTitle('💼 Economie Wizard')
    .setDescription('Kies hieronder wat je wilt beheren. Gebruik de knoppen om instellingen te wijzigen.\n\n• ⚙️ Algemeen: cooldown, multipliers, gating, panel\n• 🕵️ Rob en 📦 Inventory: aan/uit en zichtbaarheid\n• 🂡 Blackjack: aan/uit, inzet, house edge, cooldown\n• 🎰 Roulette: aan/uit, inzet, cooldown\n• ♠️ Poker: aan/uit, inzet, cooldown\n• 🧰 Jobs beheren: toevoegen/bewerken/verwijderen')
    .addFields(
      { name: 'Cooldown (/work)', value: `${cd} min`, inline: true },
      { name: 'Multipliers', value: mult, inline: true },
      { name: 'Gating', value: gate, inline: true },
      { name: 'Panel kanaal', value: panel, inline: false },
      { name: 'Jobs', value: String(jobsCount), inline: true },
      { name: 'Rob (/rob)', value: rob, inline: true },
      { name: 'Inventory', value: `${inv} • ${invPublic}`, inline: true },
      { name: 'Blackjack', value: (settings.bjEnabled ? 'Aan' : 'Uit'), inline: true },
      { name: 'Blackjack inzet', value: `${settings.bjMinBet} - ${settings.bjMaxBet}`, inline: true },
      { name: 'Blackjack edge', value: `${Math.round((settings.bjHouseEdge ?? 0.01) * 100)}%`, inline: true },
      { name: 'Roulette', value: (settings.rouletteEnabled ? 'Aan' : 'Uit'), inline: true },
      { name: 'Roulette inzet', value: `${settings.rouletteMinBet} - ${settings.rouletteMaxBet}`, inline: true },
      { name: 'Roulette cooldown', value: `${settings.rouletteCooldown}s`, inline: true },
      { name: 'Slots', value: (settings.slotEnabled ? 'Aan' : 'Uit'), inline: true },
      { name: 'Slots inzet', value: `${settings.slotMinBet} - ${settings.slotMaxBet}`, inline: true },
      { name: 'Slots cooldown', value: `${settings.slotCooldown}s`, inline: true },
      { name: 'Counting beloningen', value: (settings.countingRewardEnabled ? `Aan • elke ${settings.countingRewardInterval} of doelen` : 'Uit'), inline: true },
      { name: 'Poker', value: (settings.pokerEnabled ? 'Aan' : 'Uit'), inline: true },
      { name: 'Poker inzet', value: `${settings.pokerMinBet} - ${settings.pokerMaxBet}`, inline: true },
      { name: 'Poker cooldown', value: `${settings.pokerCooldown}s`, inline: true },
    )
    .setTimestamp();
}

function buildEconomyHomeComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_open_work').setStyle(ButtonStyle.Primary).setLabel('⚙️ Algemeen'),
    new ButtonBuilder().setCustomId('eco_open_rob').setStyle(ButtonStyle.Secondary).setLabel('🕵️ Rob'),
    new ButtonBuilder().setCustomId('eco_open_inventory').setStyle(ButtonStyle.Secondary).setLabel('📦 Inventory')
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_open_gambling').setStyle(ButtonStyle.Secondary).setLabel('🎲 Gambling'),
    new ButtonBuilder().setCustomId('eco_open_counting').setStyle(ButtonStyle.Secondary).setLabel('🔢 Counting beloningen')
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_open_features').setStyle(ButtonStyle.Secondary).setLabel('🧩 Functies')
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_wizard_close').setStyle(ButtonStyle.Danger).setLabel('Sluiten')
  );
  return [row1, row2, row3, row4];
}

function buildEcoWorkMenu(settings) {
  const embed = new EmbedBuilder()
    .setColor('#0984e3')
    .setTitle('⚙️ Algemeen (/work)')
    .setDescription('Stel algemene economie-instellingen in. Beheer ook je Jobs hier.')
    .addFields(
      { name: 'Cooldown', value: `${settings.cooldownMinutes ?? 60} min`, inline: true },
      { name: 'Gating', value: settings.gateMode || 'level', inline: true },
      { name: 'Panel kanaal', value: settings.panelChannelId ? `<#${settings.panelChannelId}>` : 'Niet ingesteld', inline: true },
    );
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_wizard_set_cooldown').setStyle(ButtonStyle.Primary).setLabel('Cooldown instellen'));
  const row2 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('eco_wizard_gate_select').setPlaceholder('Kies gating').addOptions({ label: 'Level', value: 'level' }, { label: 'Role', value: 'role' }, { label: 'None', value: 'none' }));
  const row3 = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('eco_wizard_panel_channel').addChannelTypes(ChannelType.GuildText).setPlaceholder('Kies panel kanaal').setMinValues(1).setMaxValues(1));
  const row4 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_jobs_list').setStyle(ButtonStyle.Secondary).setLabel('🧰 Jobs: Lijst'));
  const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_wizard_back_home').setStyle(ButtonStyle.Secondary).setLabel('← Terug'));
  return { embed, components: [row1, row2, row3, row4, rowBack] };
}

function buildEcoRobMenu(settings) {
  const embed = new EmbedBuilder().setColor('#6c5ce7').setTitle('🕵️ Rob-instellingen').addFields({ name: 'Rob', value: settings.robEnabled ? 'Aan' : 'Uit', inline: true });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_wizard_toggle_rob').setStyle(settings.robEnabled ? ButtonStyle.Danger : ButtonStyle.Success).setLabel(settings.robEnabled ? 'Rob uitzetten' : 'Rob aanzetten'),
    new ButtonBuilder().setCustomId('eco_wizard_back_home').setStyle(ButtonStyle.Secondary).setLabel('← Terug')
  );
  return { embed, components: [row] };
}

function buildEcoInventoryMenu(settings) {
  const embed = new EmbedBuilder().setColor('#00b894').setTitle('📦 Inventory-instellingen').addFields(
    { name: 'Inventory', value: settings.inventoryEnabled ? 'Aan' : 'Uit', inline: true },
    { name: 'Zichtbaarheid', value: settings.inventoryPublic ? 'Publiek' : 'Privé', inline: true },
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_wizard_toggle_inventory').setStyle(settings.inventoryEnabled ? ButtonStyle.Danger : ButtonStyle.Success).setLabel(settings.inventoryEnabled ? 'Inventory uitzetten' : 'Inventory aanzetten'),
    new ButtonBuilder().setCustomId('eco_wizard_toggle_inventory_public').setStyle(ButtonStyle.Primary).setLabel('Toggle zichtbaarheid'),
    new ButtonBuilder().setCustomId('eco_wizard_back_home').setStyle(ButtonStyle.Secondary).setLabel('← Terug')
  );
  return { embed, components: [row] };
}

function buildEcoGamblingMenu(settings) {
  const embed = new EmbedBuilder().setColor('#d63031').setTitle('🎲 Gambling-instellingen').addFields(
    { name: 'Roulette', value: settings.rouletteEnabled ? 'Aan' : 'Uit', inline: true },
    { name: 'Roulette inzet', value: `${settings.rouletteMinBet} - ${settings.rouletteMaxBet}`, inline: true },
    { name: 'Roulette cooldown', value: `${settings.rouletteCooldown}s`, inline: true },
    { name: 'Slots', value: settings.slotEnabled ? 'Aan' : 'Uit', inline: true },
    { name: 'Slots inzet', value: `${settings.slotMinBet} - ${settings.slotMaxBet}`, inline: true },
    { name: 'Slots cooldown', value: `${settings.slotCooldown}s`, inline: true },
  );
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_wizard_toggle_roulette').setStyle(settings.rouletteEnabled ? ButtonStyle.Danger : ButtonStyle.Success).setLabel(settings.rouletteEnabled ? 'Roulette uitzetten' : 'Roulette aanzetten'),
    new ButtonBuilder().setCustomId('eco_wizard_set_roulette_bets').setStyle(ButtonStyle.Primary).setLabel('Roulette inzet'),
    new ButtonBuilder().setCustomId('eco_wizard_set_roulette_cd').setStyle(ButtonStyle.Secondary).setLabel('Roulette cooldown')
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_wizard_toggle_slot').setStyle(settings.slotEnabled ? ButtonStyle.Danger : ButtonStyle.Success).setLabel(settings.slotEnabled ? 'Slots uitzetten' : 'Slots aanzetten'),
    new ButtonBuilder().setCustomId('eco_wizard_set_slot_bets').setStyle(ButtonStyle.Primary).setLabel('Slots inzet')
  );
  const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_wizard_back_home').setStyle(ButtonStyle.Secondary).setLabel('← Terug'));
  return { embed, components: [row1, row2, rowBack] };
}

function buildEcoFeaturesHome() {
  const embed = new EmbedBuilder().setColor('#2ecc71').setTitle('🧩 Economie Functies')
    .setDescription('Kies een categorie om functies/commands in- of uit te schakelen.');
  const select = new StringSelectMenuBuilder()
    .setCustomId('eco_features_category')
    .setPlaceholder('Kies categorie')
    .addOptions(
      { label: 'Core', value: 'core', description: 'work, daily, weekly, balance, eco, inventory, jobstats, shop' },
      { label: 'Bank', value: 'bank', description: 'deposit, withdraw, balance' },
      { label: 'Crime', value: 'crime', description: 'crime, rob' },
      { label: 'Gambling', value: 'gambling', description: 'roulette, slot, poker, blackjack' }
    );
  const row = new ActionRowBuilder().addComponents(select);
  const back = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_wizard_back_home').setStyle(ButtonStyle.Secondary).setLabel('← Terug'));
  return { embed, components: [row, back] };
}

function buildEcoFeaturesCategory(db, guildId, category) {
  const row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId) || {};
  const toOnOff = v => (Number(v) ? 'Aan' : 'Uit');
  const embed = new EmbedBuilder().setColor('#2ecc71').setTitle(`🧩 Functies: ${category}`);
  const buttons = [];
  const button = (id, label, enabled) => new ButtonBuilder().setCustomId(id).setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger).setLabel(`${label}: ${enabled ? 'Aan' : 'Uit'}`);
  if (category === 'core') {
    buttons.push(button('eco_toggle_work','work', row.eco_work_enabled ?? 1));
    buttons.push(button('eco_toggle_daily','daily', row.eco_daily_enabled ?? 1));
    buttons.push(button('eco_toggle_weekly','weekly', row.eco_weekly_enabled ?? 1));
    buttons.push(button('eco_toggle_balance','balance', row.eco_balance_enabled ?? 1));
    buttons.push(button('eco_toggle_eco','eco', row.eco_eco_enabled ?? 1));
    buttons.push(button('eco_toggle_inventory','inventory', row.inventory_enabled ?? 0));
    buttons.push(button('eco_toggle_jobstats','jobstats', row.eco_jobstats_enabled ?? 1));
    buttons.push(button('eco_toggle_shop','shop', row.eco_shop_enabled ?? 1));
  } else if (category === 'bank') {
    buttons.push(button('eco_toggle_deposit','deposit', row.eco_deposit_enabled ?? 1));
    buttons.push(button('eco_toggle_withdraw','withdraw', row.eco_withdraw_enabled ?? 1));
    buttons.push(button('eco_toggle_balance','balance', row.eco_balance_enabled ?? 1));
  } else if (category === 'crime') {
    buttons.push(button('eco_toggle_crime','crime', row.eco_crime_enabled ?? 1));
    buttons.push(button('eco_toggle_rob','rob', row.rob_enabled ?? 0));
  } else if (category === 'gambling') {
    buttons.push(button('eco_toggle_roulette','roulette', row.roulette_enabled ?? 0));
    buttons.push(button('eco_toggle_slot','slot', row.slot_enabled ?? 0));
    buttons.push(button('eco_toggle_poker','poker', row.poker_enabled ?? 0));
    buttons.push(button('eco_toggle_blackjack','blackjack', row.bj_enabled ?? 0));
  }
  embed.setDescription('Klik op de knoppen om functies te schakelen.');
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
  }
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_open_features').setStyle(ButtonStyle.Secondary).setLabel('← Categorieën'), new ButtonBuilder().setCustomId('eco_wizard_back_home').setStyle(ButtonStyle.Secondary).setLabel('← Home')));
  return { embed, components: rows };
}

function buildEcoCountingMenu(settings) {
  const goalsText = (settings.countingRewardGoals && settings.countingRewardGoals.trim()) ? settings.countingRewardGoals : '—';
  const embed = new EmbedBuilder().setColor('#74b9ff').setTitle('🔢 Counting').setDescription('Hier kan je de Counting instellingen aanpassen.').addFields(
    { name: 'Status', value: settings.countingRewardEnabled ? 'Aan' : 'Uit', inline: true },
    { name: 'Bedrag per beloning', value: `€${(settings.countingRewardAmount ?? 5)}`, inline: true },
    { name: 'Mijlpaal-interval', value: `${settings.countingRewardInterval ?? 10}`, inline: true },
    { name: 'Specifieke doelen (komma-gescheiden)', value: goalsText, inline: false },
  );
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_wizard_toggle_counting_reward').setStyle(settings.countingRewardEnabled ? ButtonStyle.Danger : ButtonStyle.Success).setLabel(settings.countingRewardEnabled ? 'Beloningen: Aan → Uit' : 'Beloningen: Uit → Aan'),
    new ButtonBuilder().setCustomId('eco_wizard_set_counting_amount').setStyle(ButtonStyle.Primary).setLabel('Bedrag instellen'),
    new ButtonBuilder().setCustomId('eco_wizard_set_counting_interval').setStyle(ButtonStyle.Secondary).setLabel('Interval instellen'),
    new ButtonBuilder().setCustomId('eco_wizard_set_counting_goals').setStyle(ButtonStyle.Secondary).setLabel('Specifieke doelen')
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('eco_wizard_counting_status').setStyle(ButtonStyle.Primary).setLabel('Status bekijken'),
    new ButtonBuilder().setCustomId('eco_wizard_counting_set_channel').setStyle(ButtonStyle.Secondary).setLabel('Kanaal instellen'),
    new ButtonBuilder().setCustomId('eco_wizard_counting_reset').setStyle(ButtonStyle.Danger).setLabel('Reset teller'),
    new ButtonBuilder().setCustomId('eco_wizard_counting_set_number').setStyle(ButtonStyle.Secondary).setLabel('Getal instellen')
  );
  const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_wizard_back_home').setStyle(ButtonStyle.Secondary).setLabel('← Terug'));
  return { embed, components: [row1, row2, row3] };
}

export async function handleEconomyWizard(interaction, db) {
  const guildId = interaction.guild.id;
  const settings = getGuildEcoSettings(db, guildId);
  let jobsCount = 0;
  try { const row = db.prepare('SELECT COUNT(*) AS c FROM jobs WHERE guild_id = ?').get(guildId); jobsCount = row?.c ?? 0; } catch { jobsCount = 0; }
  const embed = buildEconomyHomeEmbed(settings, jobsCount);
  const components = buildEconomyHomeComponents(settings);
  await interaction.editReply({ embeds: [embed], components });
}

export async function handleEconomyWizardComponent(interaction) {
  const db = interaction.client.db;
  const guildId = interaction.guild.id;

  if (interaction.isButton() && interaction.customId === 'eco_wizard_close') {
    try { if (interaction.message && interaction.message.deletable) { await interaction.message.delete(); return; } } catch {}
    return interaction.update({ content: 'Configuratie gesloten.', embeds: [], components: [] });
  }

  if (interaction.isButton() && interaction.customId === 'eco_open_work') {
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoWorkMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }
  if (interaction.isButton() && interaction.customId === 'eco_open_rob') {
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoRobMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }
  if (interaction.isButton() && interaction.customId === 'eco_open_inventory') {
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoInventoryMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }
  if (interaction.isButton() && interaction.customId === 'eco_open_features') {
    const { embed, components } = buildEcoFeaturesHome();
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isStringSelectMenu?.() && interaction.customId === 'eco_features_category') {
    const cat = interaction.values?.[0] || 'core';
    const { embed, components } = buildEcoFeaturesCategory(db, guildId, cat);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_open_gambling') {
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }
  if (interaction.isButton() && interaction.customId === 'eco_wizard_back_home') {
    const settings = getGuildEcoSettings(db, guildId);
    let jobsCount = 0; try { const row = db.prepare('SELECT COUNT(*) AS c FROM jobs WHERE guild_id = ?').get(guildId); jobsCount = row?.c ?? 0; } catch {}
    const embed = buildEconomyHomeEmbed(settings, jobsCount);
    const components = buildEconomyHomeComponents(settings);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_cooldown') {
    const modal = new ModalBuilder().setCustomId('eco_wizard_modal_cooldown').setTitle('Cooldown (/work)');
    const input = new TextInputBuilder().setCustomId('cooldown_minutes').setLabel('Cooldown in minuten (1-1440)').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_wizard_modal_cooldown') {
    const val = Math.max(1, Math.min(1440, parseInt(interaction.fields.getTextInputValue('cooldown_minutes'), 10) || 60));
    db.prepare('UPDATE guild_config SET eco_work_cooldown_minutes = ? WHERE guild_id = ?').run(val, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoWorkMenu(settings);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_slot_bets') {
    const s = getGuildEcoSettings(db, guildId);
    const modal = new ModalBuilder().setCustomId('eco_slot_bets_modal').setTitle('Slots inzet');
    const minI = new TextInputBuilder().setCustomId('min_bet').setLabel('Minimale inzet (>=0)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(s.slotMinBet ?? 10));
    const maxI = new TextInputBuilder().setCustomId('max_bet').setLabel('Maximale inzet (>= min)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(s.slotMaxBet ?? 1000));
    modal.addComponents(new ActionRowBuilder().addComponents(minI), new ActionRowBuilder().addComponents(maxI));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_slot_bets_modal') {
    const minb = Math.max(0, parseInt(interaction.fields.getTextInputValue('min_bet'), 10) || 0);
    let maxb = parseInt(interaction.fields.getTextInputValue('max_bet'), 10);
    maxb = isNaN(maxb) ? minb : Math.max(minb, maxb);
    db.prepare('UPDATE guild_config SET slot_min_bet = ?, slot_max_bet = ? WHERE guild_id = ?').run(minb, maxb, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_slot_cd') {
    const s = getGuildEcoSettings(db, guildId);
    const modal = new ModalBuilder().setCustomId('eco_slot_cd_modal').setTitle('Slots cooldown');
    const cdI = new TextInputBuilder().setCustomId('cooldown_seconds').setLabel('Cooldown in seconden (>=0)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(s.slotCooldown ?? 30));
    modal.addComponents(new ActionRowBuilder().addComponents(cdI));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_slot_cd_modal') {
    const cd = Math.max(0, parseInt(interaction.fields.getTextInputValue('cooldown_seconds'), 10) || 0);
    db.prepare('UPDATE guild_config SET slot_cooldown_seconds = ? WHERE guild_id = ?').run(cd, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_counting_amount') {
    const s = getGuildEcoSettings(db, guildId);
    const modal = new ModalBuilder().setCustomId('eco_counting_amount_modal').setTitle('Beloningsbedrag');
    const amtVal = Number(s.countingRewardAmount ?? 5);
    const amt = new TextInputBuilder().setCustomId('amount').setLabel('Bedrag per beloning (>=0)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Math.max(0, isNaN(amtVal) ? 5 : amtVal)));
    modal.addComponents(new ActionRowBuilder().addComponents(amt));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_counting_amount_modal') {
    let amount = parseInt(interaction.fields.getTextInputValue('amount'), 10);
    amount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    db.prepare('UPDATE guild_config SET counting_reward_amount = ? WHERE guild_id = ?').run(amount, guildId);
    const s = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoCountingMenu(s);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_counting_interval') {
    const s = getGuildEcoSettings(db, guildId);
    const modal = new ModalBuilder().setCustomId('eco_counting_interval_modal').setTitle('Mijlpaal-interval');
    const ivVal = Number(s.countingRewardInterval ?? 10);
    const iv = new TextInputBuilder().setCustomId('interval').setLabel('Elke N getallen belonen (0 = uit)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Math.max(0, isNaN(ivVal) ? 10 : ivVal)));
    modal.addComponents(new ActionRowBuilder().addComponents(iv));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_counting_interval_modal') {
    let iv = parseInt(interaction.fields.getTextInputValue('interval'), 10);
    iv = Number.isFinite(iv) ? Math.max(0, iv) : 0;
    db.prepare('UPDATE guild_config SET counting_reward_goal_interval = ? WHERE guild_id = ?').run(iv, guildId);
    const s = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoCountingMenu(s);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_counting_goals') {
    const s = getGuildEcoSettings(db, guildId);
    const modal = new ModalBuilder().setCustomId('eco_counting_goals_modal').setTitle('Specifieke doelen');
    const gl = new TextInputBuilder().setCustomId('goals').setLabel('Komma-gescheiden lijst van getallen (leeg = geen)').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(s.countingRewardGoals ?? '');
    modal.addComponents(new ActionRowBuilder().addComponents(gl));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_counting_goals_modal') {
    const goalsRaw = interaction.fields.getTextInputValue('goals') ?? '';
    const cleaned = goalsRaw.split(',').map(s => s.trim()).filter(Boolean).join(',');
    db.prepare('UPDATE guild_config SET counting_reward_specific_goals = ? WHERE guild_id = ?').run(cleaned || null, guildId);
    const s = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoCountingMenu(s);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_counting_status') {
    const row = db.prepare('SELECT counting_channel, counting_number FROM guild_config WHERE guild_id = ?').get(guildId) || {};
    const channelId = row.counting_channel || null;
    const cur = row.counting_number != null ? Number(row.counting_number) : 0;
    const embed = new EmbedBuilder().setColor('#0099ff').setTitle('🔢 Tellen Status').addFields(
      { name: 'Tel Kanaal', value: channelId ? `<#${channelId}>` : 'Niet ingesteld', inline: true },
      { name: 'Huidig Getal', value: String(cur), inline: true },
      { name: 'Volgend Getal', value: String(cur + 1), inline: true },
    ).setDescription(channelId ? `Het tel spel is actief in <#${channelId}>. Het volgende getal is **${cur + 1}**.` : 'Stel eerst een tel kanaal in.').setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_counting_set_channel') {
    const row = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('eco_wizard_counting_channel_select').addChannelTypes(ChannelType.GuildText).setPlaceholder('Kies tellen kanaal').setMinValues(1).setMaxValues(1));
    const s = getGuildEcoSettings(db, guildId);
    const { embed } = buildEcoCountingMenu(s);
    embed.setFooter({ text: 'Kies hieronder een kanaal voor het tellen.' });
    return interaction.update({ embeds: [embed], components: [row] });
  }
  if (interaction.isChannelSelectMenu?.() && interaction.customId === 'eco_wizard_counting_channel_select') {
    const chId = interaction.values?.[0];
    if (chId) db.prepare('UPDATE guild_config SET counting_channel = ?, counting_number = 0 WHERE guild_id = ?').run(chId, guildId);
    const s = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoCountingMenu(s);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_counting_reset') {
    db.prepare('UPDATE guild_config SET counting_number = 0 WHERE guild_id = ?').run(guildId);
    const row = db.prepare('SELECT counting_channel FROM guild_config WHERE guild_id = ?').get(guildId) || {};
    const channelId = row.counting_channel || null;
    const embed = new EmbedBuilder().setColor('#00ff00').setTitle('🔄 Teller Gereset').setDescription(channelId ? `De teller is gereset naar 0. Het volgende getal in <#${channelId}> is **1**.` : 'De teller is gereset naar 0.').setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
    if (channelId) { try { await interaction.guild.channels.fetch(channelId).then(ch => ch?.send('🔄 Teller gereset. Begin opnieuw met 1!')).catch(() => {}); } catch {} }
    return;
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_counting_set_number') {
    const modal = new ModalBuilder().setCustomId('eco_counting_set_number_modal').setTitle('Teller instellen');
    const ti = new TextInputBuilder().setCustomId('number').setLabel('Nieuw huidig getal (>=0)').setStyle(TextInputStyle.Short).setRequired(true).setValue('0');
    modal.addComponents(new ActionRowBuilder().addComponents(ti));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_counting_set_number_modal') {
    let n = parseInt(interaction.fields.getTextInputValue('number'), 10);
    n = Number.isFinite(n) && n >= 0 ? n : 0;
    db.prepare('UPDATE guild_config SET counting_number = ? WHERE guild_id = ?').run(n, guildId);
    const row = db.prepare('SELECT counting_channel FROM guild_config WHERE guild_id = ?').get(guildId) || {};
    const channelId = row.counting_channel || null;
    const embed = new EmbedBuilder().setColor('#00ff00').setTitle('🔢 Teller Ingesteld').setDescription(channelId ? `De teller is ingesteld op **${n}**. Het volgende getal in <#${channelId}> is **${n + 1}**.` : `De teller is ingesteld op **${n}**.`).setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.isStringSelectMenu?.() && interaction.customId === 'eco_wizard_gate_select') {
    const mode = interaction.values[0];
    db.prepare('UPDATE guild_config SET eco_work_gate_mode = ? WHERE guild_id = ?').run(mode, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoWorkMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isChannelSelectMenu?.() && interaction.customId === 'eco_wizard_panel_channel') {
    const chId = interaction.values?.[0];
    if (chId) db.prepare('UPDATE guild_config SET eco_work_panel_channel_id = ? WHERE guild_id = ?').run(chId, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoWorkMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }

  const toggleMap = {
    'eco_toggle_work': ['eco_work_enabled'],
    'eco_toggle_daily': ['eco_daily_enabled'],
    'eco_toggle_weekly': ['eco_weekly_enabled'],
    'eco_toggle_balance': ['eco_balance_enabled'],
    'eco_toggle_eco': ['eco_eco_enabled'],
    'eco_toggle_inventory': ['inventory_enabled'],
    'eco_toggle_jobstats': ['eco_jobstats_enabled'],
    'eco_toggle_shop': ['eco_shop_enabled'],
    'eco_toggle_deposit': ['eco_deposit_enabled'],
    'eco_toggle_withdraw': ['eco_withdraw_enabled'],
    'eco_toggle_crime': ['eco_crime_enabled'],
    'eco_toggle_rob': ['rob_enabled'],
    'eco_toggle_roulette': ['roulette_enabled'],
    'eco_toggle_slot': ['slot_enabled'],
    'eco_toggle_poker': ['poker_enabled'],
    'eco_toggle_blackjack': ['bj_enabled'],
  };
  if (interaction.isButton() && toggleMap[interaction.customId]) {
    const cols = toggleMap[interaction.customId];
    const row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId) || {};
    const updates = [];
    const vals = [];
    for (const col of cols) {
      const current = Number(row[col] ?? 0);
      const next = current ? 0 : 1;
      updates.push(`${col} = ?`);
      vals.push(next);
    }
    if (updates.length) db.prepare(`UPDATE guild_config SET ${updates.join(', ')} WHERE guild_id = ?`).run(...vals, guildId);
    const cat = interaction.message?.embeds?.[0]?.title?.toLowerCase().includes('gambling') ? 'gambling' : (interaction.message?.embeds?.[0]?.title?.toLowerCase().includes('crime') ? 'crime' : null);
    // Try to infer category from button id
    const id = interaction.customId;
    let derived = 'core';
    if (id.includes('deposit') || id.includes('withdraw')) derived = 'bank';
    else if (id.includes('crime') || id.endsWith('rob')) derived = 'crime';
    else if (id.includes('roulette') || id.includes('slot') || id.includes('poker') || id.includes('blackjack')) derived = 'gambling';
    else if (id.includes('balance') || id.includes('work') || id.includes('inventory') || id.includes('shop') || id.includes('jobstats') || id.includes('eco') || id.includes('daily') || id.includes('weekly')) derived = 'core';
    const { embed, components } = buildEcoFeaturesCategory(db, guildId, derived);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_toggle_rob') {
    const current = getGuildEcoSettings(db, guildId).robEnabled ? 1 : 0;
    db.prepare('UPDATE guild_config SET rob_enabled = ? WHERE guild_id = ?').run(current ? 0 : 1, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoRobMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_toggle_inventory') {
    const current = getGuildEcoSettings(db, guildId).inventoryEnabled ? 1 : 0;
    db.prepare('UPDATE guild_config SET inventory_enabled = ? WHERE guild_id = ?').run(current ? 0 : 1, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoInventoryMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_toggle_inventory_public') {
    const current = getGuildEcoSettings(db, guildId).inventoryPublic ? 1 : 0;
    db.prepare('UPDATE guild_config SET inventory_public_viewing = ? WHERE guild_id = ?').run(current ? 0 : 1, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoInventoryMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_toggle_roulette') {
    const current = getGuildEcoSettings(db, guildId).rouletteEnabled ? 1 : 0;
    db.prepare('UPDATE guild_config SET roulette_enabled = ? WHERE guild_id = ?').run(current ? 0 : 1, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_toggle_slot') {
    const current = getGuildEcoSettings(db, guildId).slotEnabled ? 1 : 0;
    db.prepare('UPDATE guild_config SET slot_enabled = ? WHERE guild_id = ?').run(current ? 0 : 1, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_toggle_counting_reward') {
    const cur = getGuildEcoSettings(db, guildId).countingRewardEnabled ? 1 : 0;
    db.prepare('UPDATE guild_config SET counting_reward_enabled = ? WHERE guild_id = ?').run(cur ? 0 : 1, guildId);
    const s = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoCountingMenu(s);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_toggle_blackjack') {
    const current = getGuildEcoSettings(db, guildId).bjEnabled ? 1 : 0;
    db.prepare('UPDATE guild_config SET bj_enabled = ? WHERE guild_id = ?').run(current ? 0 : 1, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_roulette_bets') {
    const s = getGuildEcoSettings(db, guildId);
    const modal = new ModalBuilder().setCustomId('eco_roulette_bets_modal').setTitle('Roulette inzet');
    const minI = new TextInputBuilder().setCustomId('min_bet').setLabel('Minimale inzet (>=0)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(s.rouletteMinBet ?? 10));
    const maxI = new TextInputBuilder().setCustomId('max_bet').setLabel('Maximale inzet (>= min)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(s.rouletteMaxBet ?? 1000));
    modal.addComponents(new ActionRowBuilder().addComponents(minI), new ActionRowBuilder().addComponents(maxI));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_roulette_bets_modal') {
    const minb = Math.max(0, parseInt(interaction.fields.getTextInputValue('min_bet'), 10) || 0);
    let maxb = parseInt(interaction.fields.getTextInputValue('max_bet'), 10);
    maxb = isNaN(maxb) ? minb : Math.max(minb, maxb);
    db.prepare('UPDATE guild_config SET roulette_min_bet = ?, roulette_max_bet = ? WHERE guild_id = ?').run(minb, maxb, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_roulette_cd') {
    const s = getGuildEcoSettings(db, guildId);
    const modal = new ModalBuilder().setCustomId('eco_roulette_cd_modal').setTitle('Roulette cooldown');
    const cdI = new TextInputBuilder().setCustomId('cooldown_seconds').setLabel('Cooldown in seconden (>=0)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(s.rouletteCooldown ?? 30));
    modal.addComponents(new ActionRowBuilder().addComponents(cdI));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_roulette_cd_modal') {
    const cd = Math.max(0, parseInt(interaction.fields.getTextInputValue('cooldown_seconds'), 10) || 0);
    db.prepare('UPDATE guild_config SET roulette_cooldown_seconds = ? WHERE guild_id = ?').run(cd, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_toggle_poker') {
    const current = getGuildEcoSettings(db, guildId).pokerEnabled ? 1 : 0;
    db.prepare('UPDATE guild_config SET poker_enabled = ? WHERE guild_id = ?').run(current ? 0 : 1, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.update({ embeds: [embed], components });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_poker_bets') {
    const s = getGuildEcoSettings(db, guildId);
    const modal = new ModalBuilder().setCustomId('eco_poker_bets_modal').setTitle('Poker inzet');
    const minI = new TextInputBuilder().setCustomId('min_bet').setLabel('Minimale inzet (>=0)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(s.pokerMinBet ?? 50));
    const maxI = new TextInputBuilder().setCustomId('max_bet').setLabel('Maximale inzet (>= min)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(s.pokerMaxBet ?? 2000));
    modal.addComponents(new ActionRowBuilder().addComponents(minI), new ActionRowBuilder().addComponents(maxI));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_poker_bets_modal') {
    const minb = Math.max(0, parseInt(interaction.fields.getTextInputValue('min_bet'), 10) || 0);
    let maxb = parseInt(interaction.fields.getTextInputValue('max_bet'), 10);
    maxb = isNaN(maxb) ? minb : Math.max(minb, maxb);
    db.prepare('UPDATE guild_config SET poker_min_bet = ?, poker_max_bet = ? WHERE guild_id = ?').run(minb, maxb, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'eco_wizard_set_poker_cd') {
    const s = getGuildEcoSettings(db, guildId);
    const modal = new ModalBuilder().setCustomId('eco_poker_cd_modal').setTitle('Poker cooldown');
    const cdI = new TextInputBuilder().setCustomId('cooldown_seconds').setLabel('Cooldown in seconden (>=0)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(s.pokerCooldown ?? 60));
    modal.addComponents(new ActionRowBuilder().addComponents(cdI));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_poker_cd_modal') {
    const cd = Math.max(0, parseInt(interaction.fields.getTextInputValue('cooldown_seconds'), 10) || 0);
    db.prepare('UPDATE guild_config SET poker_cooldown_seconds = ? WHERE guild_id = ?').run(cd, guildId);
    const settings = getGuildEcoSettings(db, guildId);
    const { embed, components } = buildEcoGamblingMenu(settings);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (interaction.isButton() && (interaction.customId === 'eco_wizard_open_jobs' || interaction.customId === 'eco_jobs_list')) {
    const jobs = db.prepare('SELECT * FROM eco_jobs WHERE guild_id = ? ORDER BY id ASC').all(guildId);
    const desc = jobs.length ? 'Selecteer een job hieronder en kies een actie.' : 'Geen jobs. Voeg er één toe met de knop.';
    const embed = new EmbedBuilder().setColor('#0984e3').setTitle('🧰 Jobs beheren').setDescription(desc).setFooter({ text: 'Gebruik de selectiemenu om een job te kiezen.' });
    const options = jobs.map(j => ({ label: `${j.name} (Lvl ${j.min_level})`, description: `${j.min_payout}-${j.max_payout}${j.required_role_id ? ` • rol` : ''}`, value: String(j.id) }));
    const select = new StringSelectMenuBuilder().setCustomId('eco_jobs_select').setPlaceholder(jobs.length ? 'Selecteer een job...' : 'Geen jobs beschikbaar').setMinValues(1).setMaxValues(1).addOptions(...options.slice(0, 25));
    const rowSelect = new ActionRowBuilder().addComponents(select.setDisabled(!jobs.length));
    const rowActions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('eco_jobs_add').setStyle(ButtonStyle.Success).setLabel('➕ Toevoegen'),
      new ButtonBuilder().setCustomId('eco_jobs_edit').setStyle(ButtonStyle.Primary).setLabel('✏️ Bewerken'),
      new ButtonBuilder().setCustomId('eco_jobs_delete').setStyle(ButtonStyle.Danger).setLabel('🗑️ Verwijderen'),
      new ButtonBuilder().setCustomId('eco_open_work').setStyle(ButtonStyle.Secondary).setLabel('← Terug naar Work')
    );
    return interaction.update({ embeds: [embed], components: [rowSelect, rowActions] });
  }

  if (interaction.isStringSelectMenu?.() && interaction.customId === 'eco_jobs_select') {
    const jobId = interaction.values?.[0];
    const job = db.prepare('SELECT * FROM eco_jobs WHERE id = ? AND guild_id = ?').get(jobId, guildId);
    if (!job) return interaction.update({});
    const embed = new EmbedBuilder().setColor('#0984e3').setTitle('🧰 Jobs beheren').setDescription(`Geselecteerd: **${job.name}**`).addFields(
      { name: 'Uitbetaling', value: `${job.min_payout}-${job.max_payout}`, inline: true },
      { name: 'Min. level', value: String(job.min_level), inline: true },
      { name: 'Rol vereist', value: job.required_role_id ? `<@&${job.required_role_id}>` : 'Geen', inline: true },
    );
    const jobs = db.prepare('SELECT * FROM eco_jobs WHERE guild_id = ? ORDER BY id ASC').all(guildId);
    const options = jobs.map(j => ({ label: `${j.name} (Lvl ${j.min_level})`, description: `${j.min_payout}-${j.max_payout}${j.required_role_id ? ` • rol` : ''}`, value: String(j.id), default: String(j.id) === String(job.id) }));
    const rowSelect = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('eco_jobs_select').setPlaceholder('Selecteer een job...').setMinValues(1).setMaxValues(1).addOptions(...options.slice(0, 25)));
    const rowActions1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`eco_jobs_add`).setStyle(ButtonStyle.Success).setLabel('➕ Toevoegen'),
      new ButtonBuilder().setCustomId(`eco_jobs_edit:${job.id}`).setStyle(ButtonStyle.Primary).setLabel('✏️ Bewerken'),
      new ButtonBuilder().setCustomId(`eco_jobs_delete:${job.id}`).setStyle(ButtonStyle.Danger).setLabel('🗑️ Verwijderen')
    );
    const rowActions2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`eco_jobs_role_pick:${job.id}`).setStyle(ButtonStyle.Secondary).setLabel('🎭 Rol instellen'),
      new ButtonBuilder().setCustomId(`eco_jobs_clear_role:${job.id}`).setStyle(ButtonStyle.Secondary).setLabel('🧹 Rol wissen'),
      new ButtonBuilder().setCustomId('eco_open_work').setStyle(ButtonStyle.Secondary).setLabel('��� Terug naar Work')
    );
    return interaction.update({ embeds: [embed], components: [rowSelect, rowActions1, rowActions2] });
  }

  if (interaction.isButton() && interaction.customId === 'eco_jobs_add') {
    const modal = new ModalBuilder().setCustomId('eco_jobs_add_modal').setTitle('Job toevoegen');
    const name = new TextInputBuilder().setCustomId('name').setLabel('Naam').setStyle(TextInputStyle.Short).setRequired(true);
    const minp = new TextInputBuilder().setCustomId('min_payout').setLabel('Min. uitbetaling').setStyle(TextInputStyle.Short).setRequired(true);
    const maxp = new TextInputBuilder().setCustomId('max_payout').setLabel('Max. uitbetaling').setStyle(TextInputStyle.Short).setRequired(true);
    const lvl = new TextInputBuilder().setCustomId('min_level').setLabel('Min. level').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(name), new ActionRowBuilder().addComponents(minp), new ActionRowBuilder().addComponents(maxp), new ActionRowBuilder().addComponents(lvl));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId === 'eco_jobs_add_modal') {
    const name = interaction.fields.getTextInputValue('name')?.trim().slice(0, 64);
    const minp = Math.max(0, parseInt(interaction.fields.getTextInputValue('min_payout'), 10) || 0);
    const maxp = Math.max(minp, parseInt(interaction.fields.getTextInputValue('max_payout'), 10) || minp);
    const lvl = Math.max(0, parseInt(interaction.fields.getTextInputValue('min_level'), 10) || 0);
    const insert = db.prepare('INSERT INTO eco_jobs (guild_id, name, min_payout, max_payout, min_level, required_role_id, premium) VALUES (?, ?, ?, ?, ?, ?, 0)').run(guildId, name, minp, maxp, lvl, null);
    const newId = insert.lastInsertRowid;
    interaction.customId = `eco_jobs_select`;
    interaction.values = [String(newId)];
    interaction.isStringSelectMenu = () => true;
    return handleEconomyWizardComponent(interaction);
  }

  if (interaction.isButton() && interaction.customId.startsWith('eco_jobs_edit')) {
    const parts = interaction.customId.split(':');
    const jobId = parts[1];
    if (!jobId) return interaction.reply({ content: 'Selecteer eerst een job via het menu.', ephemeral: true });
    const job = db.prepare('SELECT * FROM eco_jobs WHERE id = ? AND guild_id = ?').get(jobId, guildId);
    if (!job) return interaction.reply({ content: 'Job niet gevonden.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`eco_jobs_edit_modal:${job.id}`).setTitle('Job bewerken');
    const name = new TextInputBuilder().setCustomId('name').setLabel('Naam').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(job.name || ''));
    const minp = new TextInputBuilder().setCustomId('min_payout').setLabel('Min. uitbetaling').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(job.min_payout));
    const maxp = new TextInputBuilder().setCustomId('max_payout').setLabel('Max. uitbetaling').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(job.max_payout));
    const lvl = new TextInputBuilder().setCustomId('min_level').setLabel('Min. level').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(job.min_level));
    modal.addComponents(new ActionRowBuilder().addComponents(name), new ActionRowBuilder().addComponents(minp), new ActionRowBuilder().addComponents(maxp), new ActionRowBuilder().addComponents(lvl));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit?.() && interaction.customId.startsWith('eco_jobs_edit_modal:')) {
    const jobId = interaction.customId.split(':')[1];
    const name = interaction.fields.getTextInputValue('name')?.trim().slice(0, 64);
    const minp = Math.max(0, parseInt(interaction.fields.getTextInputValue('min_payout'), 10) || 0);
    const maxp = Math.max(minp, parseInt(interaction.fields.getTextInputValue('max_payout'), 10) || minp);
    const lvl = Math.max(0, parseInt(interaction.fields.getTextInputValue('min_level'), 10) || 0);
    db.prepare('UPDATE eco_jobs SET name = ?, min_payout = ?, max_payout = ?, min_level = ? WHERE id = ? AND guild_id = ?').run(name, minp, maxp, lvl, jobId, guildId);
    interaction.customId = 'eco_wizard_open_jobs';
    return handleEconomyWizardComponent(interaction);
  }

  if (interaction.isButton() && interaction.customId.startsWith('eco_jobs_delete')) {
    const parts = interaction.customId.split(':');
    const jobId = parts[1];
    if (!jobId) return interaction.reply({ content: 'Selecteer eerst een job via het menu.', ephemeral: true });
    db.prepare('DELETE FROM eco_jobs WHERE id = ? AND guild_id = ?').run(jobId, guildId);
    await interaction.reply({ content: '🗑️ Job verwijderd.', ephemeral: true });
    const msg = interaction.message;
    const fake = { ...interaction, isButton: () => true, customId: 'eco_wizard_open_jobs', message: msg };
    return handleEconomyWizardComponent(fake);
  }

  if (interaction.isButton() && interaction.customId.startsWith('eco_jobs_role_pick:')) {
    const jobId = interaction.customId.split(':')[1];
    const job = db.prepare('SELECT * FROM eco_jobs WHERE id = ? AND guild_id = ?').get(jobId, guildId);
    if (!job) return interaction.reply({ content: 'Job niet gevonden.', ephemeral: true });
    const embed = new EmbedBuilder().setColor('#6c5ce7').setTitle('🎭 Kies een rol voor deze job').setDescription(`Job: **${job.name}**`);
    const roleSelect = new RoleSelectMenuBuilder().setCustomId(`eco_jobs_role_select:${job.id}`).setPlaceholder('Kies een rol (optioneel)').setMinValues(1).setMaxValues(1);
    const rowSelect = new ActionRowBuilder().addComponents(roleSelect);
    const rowBack = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eco_wizard_open_jobs').setStyle(ButtonStyle.Secondary).setLabel('← Terug'));
    return interaction.update({ embeds: [embed], components: [rowSelect, rowBack] });
  }
  if (interaction.isRoleSelectMenu?.() && interaction.customId.startsWith('eco_jobs_role_select:')) {
    const jobId = interaction.customId.split(':')[1];
    const roleId = interaction.values?.[0] || null;
    db.prepare('UPDATE eco_jobs SET required_role_id = ? WHERE id = ? AND guild_id = ?').run(roleId, jobId, guildId);
    interaction.customId = 'eco_jobs_select';
    interaction.values = [String(jobId)];
    interaction.isStringSelectMenu = () => true;
    return handleEconomyWizardComponent(interaction);
  }

  if (interaction.isButton() && interaction.customId.startsWith('eco_jobs_clear_role:')) {
    const jobId = interaction.customId.split(':')[1];
    db.prepare('UPDATE eco_jobs SET required_role_id = NULL WHERE id = ? AND guild_id = ?').run(jobId, guildId);
    interaction.customId = 'eco_jobs_select';
    interaction.values = [String(jobId)];
    interaction.isStringSelectMenu = () => true;
    return handleEconomyWizardComponent(interaction);
  }
}
