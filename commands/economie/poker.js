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

function getGuildPokerConfig(db, guildId) {
  try {
    const row = db.prepare(`
      SELECT 
        COALESCE(poker_enabled, 0) AS enabled,
        COALESCE(poker_min_bet, 50) AS min_bet,
        COALESCE(poker_max_bet, 2000) AS max_bet,
        COALESCE(poker_cooldown_seconds, 60) AS cooldown
      FROM guild_config WHERE guild_id = ?
    `).get(guildId) || {};
    let minBet = Math.max(1, toNumber(row.min_bet, 50));
    let maxBet = Math.max(1, toNumber(row.max_bet, 2000));
    if (minBet > maxBet) { const t = minBet; minBet = maxBet; maxBet = t; }
    return {
      enabled: toBool(row.enabled, false),
      minBet,
      maxBet,
      cooldown: Math.max(0, toNumber(row.cooldown, 60)),
    };
  } catch {
    return { enabled: false, minBet: 50, maxBet: 2000, cooldown: 60 };
  }
}

// Deck helpers
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VAL = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

function draw5() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 5);
}

function evaluateHand(cards) {
  // returns { name, multiplier }
  const counts = new Map();
  const suits = new Map();
  const vals = cards.map(c => RANK_VAL[c.r]).sort((a,b)=>a-b);
  for (const c of cards) {
    counts.set(c.r, (counts.get(c.r) || 0) + 1);
    suits.set(c.s, (suits.get(c.s) || 0) + 1);
  }
  const isFlush = Array.from(suits.values()).some(v => v === 5);
  // straight (A can be low in A-2-3-4-5)
  let isStraight = false;
  let distinct = [...new Set(vals)];
  if (distinct.length === 5) {
    const min = Math.min(...distinct);
    const max = Math.max(...distinct);
    isStraight = (max - min === 4) || (JSON.stringify(distinct) === JSON.stringify([2,3,4,5,14]));
  }
  const countVals = Array.from(counts.values()).sort((a,b)=>b-a); // e.g. [3,2]

  // straight flush / royal flush
  if (isStraight && isFlush) {
    const isRoyal = vals.includes(10) && vals.includes(11) && vals.includes(12) && vals.includes(13) && vals.includes(14);
    return isRoyal ? { name: 'Royal Flush', multiplier: 100 } : { name: 'Straight Flush', multiplier: 50 };
  }
  if (countVals[0] === 4) return { name: 'Four of a Kind', multiplier: 25 };
  if (countVals[0] === 3 && countVals[1] === 2) return { name: 'Full House', multiplier: 7 };
  if (isFlush) return { name: 'Flush', multiplier: 5 };
  if (isStraight) return { name: 'Straight', multiplier: 4 };
  if (countVals[0] === 3) return { name: 'Three of a Kind', multiplier: 3 };
  if (countVals[0] === 2 && countVals[1] === 2) return { name: 'Two Pair', multiplier: 2 };
  // Pair or High card = loss in this simple variant
  return { name: countVals[0] === 2 ? 'Pair' : 'High Card', multiplier: 0 };
}

export default {
  data: new SlashCommandBuilder()
    .setName('poker')
    .setDescription('Speel 5-kaarten poker (video poker variant) met server-instellingen')
    .addIntegerOption(o =>
      o.setName('bedrag')
        .setDescription('Hoeveel wil je inzetten?')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const amountOpt = interaction.options.getInteger('bedrag') ?? interaction.options.getInteger('amount') ?? interaction.options.getInteger('inzet');
    const amount = Math.floor(toNumber(amountOpt, 0));

    const cfg = getGuildPokerConfig(db, guildId);
    if (!cfg.enabled) {
      return interaction.reply({ content: '🃏 Poker staat uit op deze server.', ephemeral: true });
    }

    // Ensure user row
    let user = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
    if (!user) {
      db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 1000, 0)').run(userId, guildId);
      user = { balance: 1000, bank: 0, last_poker: null };
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
    const last = user.last_poker ? new Date(user.last_poker) : null;
    const cdMs = Math.max(0, toNumber(cfg.cooldown, 60)) * 1000;
    if (last && (now - last) < cdMs) {
      const nextUnix = Math.floor((last.getTime() + cdMs) / 1000);
      return interaction.reply({ content: `⏰ Je kan opnieuw spelen <t:${nextUnix}:R> (om <t:${nextUnix}:T>).`, ephemeral: true });
    }

    // Deal and evaluate
    const cards = draw5();
    const hand = evaluateHand(cards);

    const winnings = amount * hand.multiplier; // total returned on win
    const netChange = winnings - amount; // subtract bet, add winnings

    // Apply balance and set cooldown timestamp
    try {
      const stmt = db.prepare('UPDATE users SET balance = balance + ?, last_poker = ? WHERE user_id = ? AND guild_id = ?');
      stmt.run(netChange, now.toISOString(), userId, guildId);
    } catch (e) {
      // Try to add the missing column and retry once
      try {
        db.prepare('ALTER TABLE users ADD COLUMN last_poker TEXT').run();
        const stmt2 = db.prepare('UPDATE users SET balance = balance + ?, last_poker = ? WHERE user_id = ? AND guild_id = ?');
        stmt2.run(netChange, now.toISOString(), userId, guildId);
      } catch (e2) {
        console.error('❌ Failed to update poker result (after alter):', e2);
        return interaction.reply({ content: 'Er ging iets mis. Probeer het later opnieuw.', ephemeral: true });
      }
    }

    const cardsText = cards.map(c => `\`${c.r}${c.s}\``).join(' ');
    const title = hand.multiplier > 0 ? '🎉 Je hebt gewonnen!' : '😢 Je hebt verloren';
    const colorHex = hand.multiplier > 0 ? '#00cc66' : '#cc0000';
    const nextUnix = Math.floor((Date.now() + cdMs) / 1000);

    const embed = new EmbedBuilder()
      .setColor(colorHex)
      .setTitle(title)
      .setDescription(`Hand: **${hand.name}**\nKaarten: ${cardsText}`)
      .addFields(
        { name: 'Inzet', value: `€${amount.toLocaleString()}`, inline: true },
        { name: 'Uitbetaling', value: hand.multiplier > 0 ? `€${winnings.toLocaleString()} (x${hand.multiplier})` : '€0', inline: true },
        { name: 'Saldo verandering', value: `${netChange >= 0 ? '+' : ''}€${netChange.toLocaleString()}`, inline: true },
        { name: 'Volgende spel', value: `<t:${nextUnix}:R>`, inline: true },
      )
      .setFooter({ text: 'Uitbetalingen: 2 Pair x2 • Trips x3 • Straight x4 • Flush x5 • Full House x7 • Quads x25 • Straight Flush x50 • Royal x100' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
