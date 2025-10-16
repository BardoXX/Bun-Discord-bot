import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

function toNumber(v, def = 0) {
  try {
    if (v === null || v === undefined) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  } catch { return def; }
}

export default {
  data: new SlashCommandBuilder()
    .setName('monthly')
    .setDescription('Claim je maandelijkse beloning'),

  async execute(interaction) {
    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Defaults (can be made configurable later via /config economy)
    const reward = 10000;
    const cooldownDays = 30;

    // Ensure user row
    let user = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
    if (!user) {
      db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 1000, 0)').run(userId, guildId);
      user = { balance: 1000, bank: 0, last_monthly: null };
    }

    // Cooldown check
    const now = new Date();
    const last = user.last_monthly ? new Date(user.last_monthly) : null;
    const cdMs = Math.max(1, toNumber(cooldownDays, 30)) * 24 * 60 * 60 * 1000;
    if (last && (now - last) < cdMs) {
      const nextUnix = Math.floor((last.getTime() + cdMs) / 1000);
      return interaction.reply({ content: `⏰ Je kunt je monthly weer claimen <t:${nextUnix}:R> (om <t:${nextUnix}:T>).`, ephemeral: true });
    }

    try {
      db.prepare('UPDATE users SET balance = balance + ?, last_monthly = ? WHERE user_id = ? AND guild_id = ?')
        .run(reward, now.toISOString(), userId, guildId);
    } catch (e) {
      console.error('❌ Failed to grant monthly:', e);
      return interaction.reply({ content: 'Er ging iets mis bij het uitkeren van je monthly.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('🎁 Monthly geclaimd!')
      .setDescription(`Je hebt €${reward.toLocaleString()} ontvangen.`)
      .addFields((() => { const nextUnix = Math.floor((Date.now() + cdMs) / 1000); return { name: 'Volgende claim', value: `<t:${nextUnix}:R>`, inline: true }; })())
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: false });
  }
};