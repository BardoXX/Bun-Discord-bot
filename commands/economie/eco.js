import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { ensureFeatureEnabled } from '../utils/economyFeatures.js';

export default {
  data: new SlashCommandBuilder()
    .setName('eco')
    .setDescription('Admin economie tools: saldo toevoegen, verwijderen, instellen of resetten')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc
      .setName('add')
      .setDescription('Voeg geld toe aan een gebruiker')
      .addUserOption(o => o.setName('gebruiker').setDescription('Doel gebruiker').setRequired(true))
      .addIntegerOption(o => o.setName('bedrag').setDescription('Bedrag om toe te voegen').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('rekening').setDescription('Welke rekening?').addChoices(
        { name: 'Contant', value: 'cash' },
        { name: 'Bank', value: 'bank' },
        { name: 'Beide (50/50)', value: 'both' }
      ).setRequired(true))
    )
    .addSubcommand(sc => sc
      .setName('remove')
      .setDescription('Verwijder geld van een gebruiker')
      .addUserOption(o => o.setName('gebruiker').setDescription('Doel gebruiker').setRequired(true))
      .addIntegerOption(o => o.setName('bedrag').setDescription('Bedrag om te verwijderen').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('rekening').setDescription('Welke rekening?').addChoices(
        { name: 'Contant', value: 'cash' },
        { name: 'Bank', value: 'bank' },
        { name: 'Probeer eerst contant, dan bank', value: 'smart' }
      ).setRequired(true))
    )
    .addSubcommand(sc => sc
      .setName('set')
      .setDescription('Stel het saldo van een gebruiker in')
      .addUserOption(o => o.setName('gebruiker').setDescription('Doel gebruiker').setRequired(true))
      .addIntegerOption(o => o.setName('bedrag').setDescription('Nieuw saldo').setMinValue(0).setRequired(true))
      .addStringOption(o => o.setName('rekening').setDescription('Welke rekening?').addChoices(
        { name: 'Contant', value: 'cash' },
        { name: 'Bank', value: 'bank' }
      ).setRequired(true))
    )
    .addSubcommand(sc => sc
      .setName('reset')
      .setDescription('Reset saldo van een gebruiker (contant en bank naar 0)')
      .addUserOption(o => o.setName('gebruiker').setDescription('Doel gebruiker').setRequired(true))
    ),

  async execute(interaction) {
    // Safe defer
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }
    } catch {
      return;
    }

    if (!(await ensureFeatureEnabled(interaction, 'eco', 'eco'))) return;
    const db = interaction.client.db;
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    // Helper respond
    const respond = async (payload) => {
      try {
        if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
        return await interaction.reply({ ...payload, ephemeral: true });
      } catch {}
    };

    // Ensure users table has required columns
    const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!userCols.includes('balance')) {
      db.prepare('ALTER TABLE users ADD COLUMN balance INTEGER DEFAULT 0').run();
    }
    if (!userCols.includes('bank')) {
      db.prepare('ALTER TABLE users ADD COLUMN bank INTEGER DEFAULT 0').run();
    }

    const user = interaction.options.getUser('gebruiker');
    if (!user || user.bot) {
      return respond({ content: '❌ Ongeldige gebruiker.' });
    }

    // Ensure user row
    const ensureUser = (userId) => {
      let row = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
      if (!row) {
        db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)').run(userId, guildId);
        row = { user_id: userId, guild_id: guildId, balance: 0, bank: 0 };
      }
      return row;
    };

    const clampNonNegative = (n) => Math.max(0, Math.floor(Number(n) || 0));

    try {
      let row = ensureUser(user.id);

      if (sub === 'add') {
        const amount = clampNonNegative(interaction.options.getInteger('bedrag'));
        const account = interaction.options.getString('rekening');
        if (amount <= 0) return respond({ content: '❌ Bedrag moet groter dan 0 zijn.' });

        if (account === 'cash') {
          db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?')
            .run(amount, user.id, guildId);
        } else if (account === 'bank') {
          db.prepare('UPDATE users SET bank = bank + ? WHERE user_id = ? AND guild_id = ?')
            .run(amount, user.id, guildId);
        } else if (account === 'both') {
          const half1 = Math.floor(amount / 2);
          const half2 = amount - half1;
          db.prepare('UPDATE users SET balance = balance + ?, bank = bank + ? WHERE user_id = ? AND guild_id = ?')
            .run(half1, half2, user.id, guildId);
        }

        row = ensureUser(user.id);
        const embed = new EmbedBuilder()
          .setColor('#00cc66')
          .setTitle('💰 Saldo Toegevoegd')
          .setDescription(`Aan ${user} is **€${amount.toLocaleString()}** toegevoegd (${account}).`)
          .addFields(
            { name: 'Contant', value: `€${Number(row.balance).toLocaleString()}`, inline: true },
            { name: 'Bank', value: `€${Number(row.bank).toLocaleString()}`, inline: true },
          )
          .setTimestamp();
        return respond({ embeds: [embed] });
      }

      if (sub === 'remove') {
        const amount = clampNonNegative(interaction.options.getInteger('bedrag'));
        const account = interaction.options.getString('rekening');
        if (amount <= 0) return respond({ content: '❌ Bedrag moet groter dan 0 zijn.' });

        if (account === 'cash') {
          const newBal = clampNonNegative(row.balance - amount);
          db.prepare('UPDATE users SET balance = ? WHERE user_id = ? AND guild_id = ?')
            .run(newBal, user.id, guildId);
        } else if (account === 'bank') {
          const newBank = clampNonNegative(row.bank - amount);
          db.prepare('UPDATE users SET bank = ? WHERE user_id = ? AND guild_id = ?')
            .run(newBank, user.id, guildId);
        } else if (account === 'smart') {
          // Remove from cash first, then bank if needed
          let remaining = amount;
          let newBal = row.balance;
          let newBank = row.bank;
          const takeCash = Math.min(newBal, remaining);
          newBal -= takeCash;
          remaining -= takeCash;
          if (remaining > 0) {
            const takeBank = Math.min(newBank, remaining);
            newBank -= takeBank;
            remaining -= takeBank;
          }
          db.prepare('UPDATE users SET balance = ?, bank = ? WHERE user_id = ? AND guild_id = ?')
            .run(clampNonNegative(newBal), clampNonNegative(newBank), user.id, guildId);
        }

        row = ensureUser(user.id);
        const embed = new EmbedBuilder()
          .setColor('#ff6666')
          .setTitle('🧾 Saldo Verwijderd')
          .setDescription(`Van ${user} is **€${amount.toLocaleString()}** verwijderd (${account}).`)
          .addFields(
            { name: 'Contant', value: `€${Number(row.balance).toLocaleString()}`, inline: true },
            { name: 'Bank', value: `€${Number(row.bank).toLocaleString()}`, inline: true },
          )
          .setTimestamp();
        return respond({ embeds: [embed] });
      }

      if (sub === 'set') {
        const amount = clampNonNegative(interaction.options.getInteger('bedrag'));
        const account = interaction.options.getString('rekening');

        if (account === 'cash') {
          db.prepare('UPDATE users SET balance = ? WHERE user_id = ? AND guild_id = ?')
            .run(amount, user.id, guildId);
        } else if (account === 'bank') {
          db.prepare('UPDATE users SET bank = ? WHERE user_id = ? AND guild_id = ?')
            .run(amount, user.id, guildId);
        }

        row = ensureUser(user.id);
        const embed = new EmbedBuilder()
          .setColor('#3399ff')
          .setTitle('⚙️ Saldo Ingesteld')
          .setDescription(`Saldo van ${user} ingesteld op **€${amount.toLocaleString()}** (${account}).`)
          .addFields(
            { name: 'Contant', value: `€${Number(row.balance).toLocaleString()}`, inline: true },
            { name: 'Bank', value: `€${Number(row.bank).toLocaleString()}`, inline: true },
          )
          .setTimestamp();
        return respond({ embeds: [embed] });
      }

      if (sub === 'reset') {
        db.prepare('UPDATE users SET balance = 0, bank = 0 WHERE user_id = ? AND guild_id = ?')
          .run(user.id, guildId);
        row = ensureUser(user.id);
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('♻️ Saldo Gereset')
          .setDescription(`Saldo van ${user} is gereset naar 0.`)
          .addFields(
            { name: 'Contant', value: `€${Number(row.balance).toLocaleString()}`, inline: true },
            { name: 'Bank', value: `€${Number(row.bank).toLocaleString()}`, inline: true },
          )
          .setTimestamp();
        return respond({ embeds: [embed] });
      }

      return respond({ content: '❌ Onbekend subcommando.' });
    } catch (error) {
      console.error('❌ [eco] Error:', error);
      try {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Fout')
          .setDescription('Er ging iets mis bij het uitvoeren van /eco.')
          .setTimestamp();
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      } catch {}
    }
  }
};
