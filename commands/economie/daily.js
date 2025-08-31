import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ensureFeatureEnabled } from '../utils/economyFeatures.js';

function toNumber(v, def = 0) {
  try {
    if (v === null || v === undefined) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  } catch { return def; }
}

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim je dagelijkse beloning'),

  async execute(interaction) {
    if (!(await ensureFeatureEnabled(interaction, 'daily', 'daily'))) return;
    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Defaults (can be made configurable later via /config economy)
    const reward = 250;
    const cooldownHours = 24;

    // Ensure user row
    let user = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
    if (!user) {
      db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 1000, 0)').run(userId, guildId);
      user = { balance: 1000, bank: 0, last_daily: null };
    }

    // Cooldown check
    const now = new Date();
    const last = user.last_daily ? new Date(user.last_daily) : null;
    const cdMs = Math.max(1, toNumber(cooldownHours, 24)) * 60 * 60 * 1000;
    if (last && (now - last) < cdMs) {
      const nextUnix = Math.floor((last.getTime() + cdMs) / 1000);
      return interaction.reply({ content: `⏰ Je kunt je daily weer claimen <t:${nextUnix}:R> (om <t:${nextUnix}:T>).`, ephemeral: true });
    }

    try {
      db.prepare('UPDATE users SET balance = balance + ?, last_daily = ? WHERE user_id = ? AND guild_id = ?')
        .run(reward, now.toISOString(), userId, guildId);
    } catch (e) {
      console.error('❌ Failed to grant daily:', e);
      return interaction.reply({ content: 'Er ging iets mis bij het uitkeren van je daily.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor('#00cc66')
      .setTitle('🎁 Daily geclaimd!')
      .setDescription(`Je hebt €${reward.toLocaleString()} ontvangen.`)
      .addFields((() => { const nextUnix = Math.floor((Date.now() + cdMs) / 1000); return { name: 'Volgende claim', value: `<t:${nextUnix}:R>`, inline: true }; })())
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: false });
  }
};
