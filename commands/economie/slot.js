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

function getGuildSlotConfig(db, guildId) {
  try {
    const row = db.prepare(`
      SELECT 
        COALESCE(slot_enabled, 0) AS enabled,
        COALESCE(slot_min_bet, 10) AS min_bet,
        COALESCE(slot_max_bet, 1000) AS max_bet,
        COALESCE(slot_cooldown_seconds, 30) AS cooldown
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

const symbols = [
  { emoji: '🍒', weight: 4, payout: 5 },   // 3x -> 5x
  { emoji: '🍋', weight: 4, payout: 4 },   // 3x -> 4x
  { emoji: '🍇', weight: 3, payout: 6 },   // 3x -> 6x
  { emoji: '🍉', weight: 3, payout: 7 },   // 3x -> 7x
  { emoji: '⭐',  weight: 2, payout: 10 },  // 3x -> 10x
  { emoji: '💎', weight: 1, payout: 20 },  // 3x -> 20x
];

function buildWheel() {
  const pool = [];
  for (const s of symbols) {
    for (let i = 0; i < s.weight; i++) pool.push(s.emoji);
  }
  return pool;
}
const wheel = buildWheel();

function spinReel() { return wheel[Math.floor(Math.random() * wheel.length)]; }

function getTriplePayout(emoji) {
  const sym = symbols.find(s => s.emoji === emoji);
  return sym ? sym.payout : 0;
}

export default {
  data: new SlashCommandBuilder()
    .setName('slot')
    .setDescription('Speel de slots met server-instellingen')
    .addIntegerOption(o =>
      o.setName('bedrag')
        .setDescription('Hoeveel wil je inzetten?')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const { ensureFeatureEnabled } = await import('../utils/economyFeatures.js');
    if (!(await ensureFeatureEnabled(interaction, 'slot', 'slot'))) return;
    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const amount = Math.floor(toNumber(interaction.options.getInteger('bedrag'), 0));

    const cfg = getGuildSlotConfig(db, guildId);
    if (!cfg.enabled) {
      return interaction.reply({ content: '🎰 Slots staan uit op deze server.', ephemeral: true });
    }

    // Ensure user row
    let user = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
    if (!user) {
      db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 1000, 0)').run(userId, guildId);
      user = { balance: 1000, bank: 0, last_slot: null };
    }

    // Validate bet
    if (!Number.isFinite(amount) || amount <= 0) {
      return interaction.reply({ content: '❌ Ongeldig bedrag.', ephemeral: true });
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
    const last = user.last_slot ? new Date(user.last_slot) : null;
    const cdMs = Math.max(0, toNumber(cfg.cooldown, 30)) * 1000;
    if (last && (now - last) < cdMs) {
      const nextUnix = Math.floor((last.getTime() + cdMs) / 1000);
      return interaction.reply({ content: `⏰ Je kan opnieuw spelen <t:${nextUnix}:R> (om <t:${nextUnix}:T>).`, ephemeral: true });
    }

    // Spin 3 reels
    const r1 = spinReel();
    const r2 = spinReel();
    const r3 = spinReel();

    let multiplier = 0;
    if (r1 === r2 && r2 === r3) {
      multiplier = getTriplePayout(r1);
    } else if (r1 === r2 || r1 === r3 || r2 === r3) {
      multiplier = 2; // any pair -> 2x
    } else {
      multiplier = 0; // no match
    }

    const winnings = amount * multiplier;
    const netChange = winnings - amount;

    try {
      const stmt = db.prepare('UPDATE users SET balance = balance + ?, last_slot = ? WHERE user_id = ? AND guild_id = ?');
      stmt.run(netChange, now.toISOString(), userId, guildId);
    } catch (e) {
      console.error('❌ Failed to update slot result:', e);
      return interaction.reply({ content: 'Er ging iets mis. Probeer het later opnieuw.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(multiplier > 0 ? '#00cc66' : '#cc0000')
      .setTitle(multiplier > 0 ? '🎉 Jackpot!' : '😢 Helaas')
      .setDescription(`${r1} | ${r2} | ${r3}`)
      .addFields(
        { name: 'Inzet', value: `€${amount.toLocaleString()}`, inline: true },
        { name: 'Uitbetaling', value: multiplier > 0 ? `€${winnings.toLocaleString()} (x${multiplier})` : '€0', inline: true },
        { name: 'Saldo verandering', value: `${netChange >= 0 ? '+' : ''}€${netChange.toLocaleString()}`, inline: true },
        (() => { const nextUnix = Math.floor((Date.now() + cdMs) / 1000); return { name: 'Volgende spel', value: `<t:${nextUnix}:R>`, inline: true }; })(),
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
