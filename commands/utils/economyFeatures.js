import { EmbedBuilder } from 'discord.js';

// Mapping between command key and guild_config column
const FEATURE_MAP = {
  balance: 'eco_balance_enabled',
  crime: 'eco_crime_enabled',
  daily: 'eco_daily_enabled',
  deposit: 'eco_deposit_enabled',
  eco: 'eco_eco_enabled',
  inventory: 'inventory_enabled', // reuse existing
  jobstats: 'eco_jobstats_enabled',
  poker: 'poker_enabled', // reuse existing
  rob: 'rob_enabled', // reuse existing
  roulette: 'roulette_enabled', // reuse existing
  shop: 'eco_shop_enabled',
  slot: 'slot_enabled', // reuse existing
  weekly: 'eco_weekly_enabled',
  withdraw: 'eco_withdraw_enabled',
  work: 'eco_work_enabled',
  blackjack: 'bj_enabled',
  jackblack: 'bj_enabled',
};

export function getFeatureColumn(key) {
  return FEATURE_MAP[key];
}

export function isFeatureEnabled(db, guildId, key) {
  const col = getFeatureColumn(key);
  if (!col) return true; // if unknown, don't block
  try {
    const row = db.prepare(`SELECT ${col} AS v FROM guild_config WHERE guild_id = ?`).get(guildId) || {};
    const v = row.v;
    if (v === null || v === undefined) return true; // default enabled unless explicitly disabled
    return !!Number(v);
  } catch {
    return true;
  }
}

export async function ensureFeatureEnabled(interaction, key, displayName) {
  const db = interaction.client.db;
  const guildId = interaction.guild.id;
  if (isFeatureEnabled(db, guildId, key)) return true;
  const name = displayName || key;
  const embed = new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('❌ Functie uitgeschakeld')
    .setDescription(`De functie/command "${name}" is momenteel niet ingeschakeld door de server.`)
    .setTimestamp();
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch {}
  return false;
}
