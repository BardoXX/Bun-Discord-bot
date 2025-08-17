import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

function toNumber(v, def = 0) {
  try {
    if (v === null || v === undefined) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  } catch { return def; }
}

function toBool(v, def = false) {
  try {
    if (v === null || v === undefined) return def;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
    if (typeof v === 'bigint') return v !== 0n;
    const s = String(v).trim().toLowerCase();
    if (['1','true','yes','on','aan'].includes(s)) return true;
    if (['0','false','no','off','uit'].includes(s)) return false;
    const n = Number(s);
    if (!Number.isNaN(n)) return n !== 0;
    return def;
  } catch { return def; }
}

function getGuildRouletteConfig(db, guildId) {
  try {
    const row = db.prepare(`
      SELECT 
        COALESCE(roulette_enabled, 0) AS enabled,
        COALESCE(roulette_min_bet, 10) AS min_bet,
        COALESCE(roulette_max_bet, 1000) AS max_bet,
        COALESCE(roulette_cooldown_seconds, 30) AS cooldown
      FROM guild_config WHERE guild_id = ?
    `).get(guildId) || {};
    let minBet = Math.max(1, toNumber(row.min_bet, 10));
    let maxBet = Math.max(1, toNumber(row.max_bet, 1000));
    if (minBet > maxBet) { const t = minBet; minBet = maxBet; maxBet = t; }
    return {
      enabled: toBool(row.enabled, false),
      minBet,
      maxBet,
      cooldown: Math.max(0, toNumber(row.cooldown, 30)),
    };
  } catch {
    return { enabled: false, minBet: 10, maxBet: 1000, cooldown: 30 };
  }
}

// Standard European roulette colors for 1-36; 0 is green
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function numberToColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export default {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Speel roulette (rood/zwart/groen) met server-instellingen')
    .addIntegerOption(o =>
      o.setName('bedrag')
        .setDescription('Hoeveel wil je inzetten?')
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(o =>
      o.setName('kleur')
        .setDescription('Kies je kleur')
        .setRequired(true)
        .addChoices(
          { name: '🔴 Rood', value: 'red' },
          { name: '⚫ Zwart', value: 'black' },
          { name: '🟢 Groen (0)', value: 'green' },
        )
    ),

  async execute(interaction) {
    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Defensive: accept alias option names in case commands weren't refreshed yet
    const intOpt = (name) => interaction.options.getInteger(name);
    const strOpt = (name) => interaction.options.getString(name);
    const amountOpt = intOpt('bedrag') ?? intOpt('amount') ?? intOpt('inzet');
    const amount = Math.floor(toNumber(amountOpt, 0));
    let color = strOpt('kleur') ?? strOpt('color'); // red | black | green
    if (color) color = String(color).toLowerCase();

    const cfg = getGuildRouletteConfig(db, guildId);
    if (!cfg.enabled) {
      return interaction.reply({ content: '🎲 Roulette staat uit op deze server.', ephemeral: true });
    }

    // Ensure user row
    let user = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
    if (!user) {
      db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 1000, 0)').run(userId, guildId);
      user = { balance: 1000, bank: 0, last_roulette: null };
    }

    // Validate bet
    if (!Number.isFinite(amount) || amount <= 0) {
      return interaction.reply({ content: '❌ Ongeldig bedrag.', ephemeral: true });
    }
    if (!['red','black','green'].includes(color)) {
      return interaction.reply({ content: '❌ Ongeldige kleur. Kies rood, zwart of groen.', ephemeral: true });
    }
    if (amount < cfg.minBet) {
      return interaction.reply({ content: `❌ Minimale inzet is €${cfg.minBet}.`, ephemeral: true });
    }
    if (amount > cfg.maxBet) {
      return interaction.reply({ content: `❌ Maximale inzet is €${cfg.maxBet}.`, ephemeral: true });
    }
    const balance = toNumber(user.balance ?? 0, 0);
    if (amount > balance) {
      return interaction.reply({ content: '❌ Onvoldoende saldo.', ephemeral: true });
    }

    // Cooldown
    const now = new Date();
    const last = user.last_roulette ? new Date(user.last_roulette) : null;
    const cdMs = Math.max(0, toNumber(cfg.cooldown, 30)) * 1000;
    if (last && (now - last) < cdMs) {
      const nextUnix = Math.floor((last.getTime() + cdMs) / 1000);
      return interaction.reply({ content: `⏰ Je kan opnieuw spelen <t:${nextUnix}:R> (om <t:${nextUnix}:T>).`, ephemeral: true });
    }

    // Spin
    const resultNum = Math.floor(Math.random() * 37); // 0..36
    const resultColor = numberToColor(resultNum);

    // Payouts: red/black = 2x total return; green = 15x total return
    let multiplier = 0;
    if (color === 'red' || color === 'black') {
      multiplier = (resultColor === color) ? 2 : 0;
    } else if (color === 'green') {
      multiplier = (resultColor === 'green') ? 15 : 0;
    }

    const winnings = amount * multiplier; // total returned amount if win
    const netChange = winnings - amount; // subtract bet, add winnings

    // Apply balance and set cooldown timestamp
    try {
      const stmt = db.prepare('UPDATE users SET balance = balance + ?, last_roulette = ? WHERE user_id = ? AND guild_id = ?');
      stmt.run(netChange, now.toISOString(), userId, guildId);
    } catch (e) {
      console.error('❌ Failed to update roulette result:', e);
      return interaction.reply({ content: 'Er ging iets mis. Probeer het later opnieuw.', ephemeral: true });
    }

    const colorEmoji = resultColor === 'red' ? '🔴' : (resultColor === 'black' ? '⚫' : '🟢');
    const title = multiplier > 0 ? '🎉 Je hebt gewonnen!' : '😢 Je hebt verloren';
    const colorHex = multiplier > 0 ? '#00cc66' : '#cc0000';

    const embed = new EmbedBuilder()
      .setColor(colorHex)
      .setTitle(title)
      .setDescription(`Resultaat: ${colorEmoji} ${resultColor.toUpperCase()} ${resultNum}`)
      .addFields(
        { name: 'Inzet', value: `€${amount.toLocaleString()}`, inline: true },
        { name: 'Uitbetaling', value: multiplier > 0 ? `€${winnings.toLocaleString()} (x${multiplier})` : '€0', inline: true },
        { name: 'Saldo verandering', value: `${netChange >= 0 ? '+' : ''}€${netChange.toLocaleString()}`, inline: true },
        (() => { const nextUnix = Math.floor((Date.now() + cdMs) / 1000); return { name: 'Volgende spel', value: `<t:${nextUnix}:R>`, inline: true }; })(),
      )
      .setFooter({ text: 'Roulette odds: rood/zwart 1:1, groen 14:1 netto' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
