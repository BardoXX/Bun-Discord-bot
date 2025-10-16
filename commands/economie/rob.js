import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} from 'discord.js';
import { getDb, get, run } from '../utils/database.js';

export const command = {
  data: new SlashCommandBuilder()
      .setName('rob')
      .setDescription('Probeer iemand te beroven van hun geld')
      .addUserOption(option =>
          option.setName('gebruiker')
              .setDescription('De gebruiker die je wilt beroven')
              .setRequired(true)
      )
      .addStringOption(option =>
          option.setName('bron')
              .setDescription('Kies uit: wallet of bank')
              .setRequired(false)
              .addChoices(
                  { name: 'Wallet', value: 'wallet' },
                  { name: 'Bank', value: 'bank' }
              )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  execute: async (interaction) => {
      try {
          console.log('[ROB] Commando ontvangen:', interaction.commandName);

          // Get database instance
          const db = getDb();
          if (!db) {
              console.error('[ROB] Fout: Database niet geïnitialiseerd');
              const embed = new EmbedBuilder()
                  .setColor('#FF0000')
                  .setTitle('❌ Database fout')
                  .setDescription('Er is een fout opgetreden bij het verbinden met de database. Probeer het later opnieuw.')
                  .setTimestamp();

              return interaction.reply({ embeds: [embed], ephemeral: true });
          }

          if (!interaction.inGuild()) {
              console.log('[ROB] Fout: Commando buiten server gebruikt');
              const embed = new EmbedBuilder()
                  .setColor('#FF0000')
                  .setTitle('❌ Server fout')
                  .setDescription('Dit commando kan alleen in een server worden gebruikt.')
                  .setTimestamp();

              return interaction.reply({ embeds: [embed], ephemeral: true });
          }

          console.log('[ROB] Database verbinding succesvol');

          const targetUser = interaction.options.getUser('gebruiker');
          const source = interaction.options.getString('bron') || 'wallet';

          // Settings for the robbery system (always enabled)
          const settings = {
              robbery: {
                  cooldown: 7200, // 2 hours in seconds
                  minLevel: 0,
                  maxRobAmount: 10000,
                  successRate: 0.6, // 60% success rate
                  failFineMultiplier: 0.5 // 50% of attempted amount as fine
              }
          };

          // Robbery feature is always enabled
          await handleRobUser(interaction, db, settings, targetUser, source);
      } catch (error) {
          console.error('Error in rob command:', error);

          if (!interaction.replied) {
              const embed = new EmbedBuilder()
                  .setColor('#FF0000')
                  .setTitle('❌ Commando fout')
                  .setDescription('Er is een fout opgetreden bij het uitvoeren van dit commando.')
                  .setTimestamp();

              await interaction.reply({ embeds: [embed], ephemeral: true });
          } else {
              const embed = new EmbedBuilder()
                  .setColor('#FF0000')
                  .setTitle('❌ Verwerkingsfout')
                  .setDescription('Er is een fout opgetreden tijdens het verwerken van je overval.')
                  .setTimestamp();

              await interaction.followUp({ embeds: [embed], ephemeral: true });
          }
      }
  }
};

/**
 * Handle user robbery
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {Object} db
 * @param {Object} settings
 * @param {Object} targetUser
 * @param {string} source
 */
async function handleRobUser(interaction, db, settings, targetUser, source) {
    console.log('[ROB] handleRobUser aangeroepen');

    // Check if user is trying to rob themselves
    if (targetUser.id === interaction.user.id) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Ongeldige actie')
            .setDescription('Je kunt jezelf niet beroven!')
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Check if target is a bot
    if (targetUser.bot) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Ongeldige actie')
            .setDescription('Je kunt geen bots beroven!')
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      console.log('[ROB] Gebruikersdata ophalen...');

      // Ensure economy profiles exist (auto-create if missing) - using the 'users' table like balance.js
      await run(
        'INSERT OR IGNORE INTO users (user_id, guild_id, balance, bank, last_robbery, level) VALUES (?, ?, 0, 0, 0, 1)',
        [interaction.user.id, interaction.guild.id]
      );
      await run(
        'INSERT OR IGNORE INTO users (user_id, guild_id, balance, bank, last_robbery, level) VALUES (?, ?, 0, 0, 0, 1)',
        [targetUser.id, interaction.guild.id]
      );

      // Get user and target data from the 'users' table
      let [userData, targetData] = await Promise.all([
        get('SELECT * FROM users WHERE user_id = ? AND guild_id = ?',
          [interaction.user.id, interaction.guild.id]),
        get('SELECT * FROM users WHERE user_id = ? AND guild_id = ?',
          [targetUser.id, interaction.guild.id])
      ]);

      if (!userData) {
        console.log('[ROB] Profiel voor gebruiker is aangemaakt met standaardwaarden.');
        userData = {
          user_id: interaction.user.id,
          guild_id: interaction.guild.id,
          balance: 0,
          bank: 0,
          last_robbery: 0,
          level: 1
        };
        // Insert the new user with default values
        await run(
          'INSERT INTO users (user_id, guild_id, balance, bank, last_robbery, level) VALUES (?, ?, 0, 0, 0, 1)',
          [userData.user_id, userData.guild_id]
        );
      }

      if (!targetData) {
        console.log('[ROB] Profiel voor doelgebruiker is aangemaakt met standaardwaarden.');
        targetData = {
          user_id: targetUser.id,
          guild_id: interaction.guild.id,
          balance: 0,
          bank: 0,
          last_robbery: 0,
          level: 1
        };
        // Insert the new target user with default values
        await run(
          'INSERT INTO users (user_id, guild_id, balance, bank, last_robbery, level) VALUES (?, ?, 0, 0, 0, 1)',
          [targetData.user_id, targetData.guild_id]
        );
      }

      // Check if user is on cooldown
      const now = Math.floor(Date.now() / 1000);
      const lastRobbery = Number(userData.last_robbery) || 0;
      const cooldown = settings.robbery.cooldown;

      if (now - lastRobbery < cooldown) {
          const remaining = cooldown - (now - lastRobbery);
          const embed = new EmbedBuilder()
              .setColor('#FFA500')
              .setTitle('⏰ Cooldown actief')
              .setDescription(`Je moet nog ${formatTime(remaining)} wachten voordat je weer kunt beroven.`)
              .setTimestamp();

          return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Check minimum level requirement
      const minLevel = settings.robbery.minLevel;
      if (Number(userData.level) < minLevel) {
          const embed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Level te laag')
              .setDescription(`Je moet minimaal level ${minLevel} zijn om te kunnen beroven.`)
              .setTimestamp();

          return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Check if target has enough money
      const targetAmount = source === 'bank' ? Number(targetData.bank) : Number(targetData.balance);
      if (targetAmount <= 0) {
          const embed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Geen geld beschikbaar')
              .setDescription(`${targetUser.username} heeft geen geld in ${source === 'bank' ? 'zijn bankrekening' : 'zijn portemonnee'}!`)
              .setTimestamp();

          return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Calculate rob amount (up to maxRobAmount or target's amount, whichever is lower)
      const maxRobAmount = Math.min(settings.robbery.maxRobAmount, targetAmount);
      const robAmount = Math.floor(Math.random() * maxRobAmount) + 1;

      // Determine success (60% chance by default)
      const isSuccess = Math.random() < settings.robbery.successRate;

      // Update last robbery time in the 'users' table
      await run(
          'UPDATE users SET last_robbery = ? WHERE user_id = ? AND guild_id = ?',
          [now, interaction.user.id, interaction.guild.id]
      );

      if (isSuccess) {
          // Successful robbery - transfer money from target to robber
          if (source === 'bank') {
              await run(
                  'UPDATE users SET bank = bank - ? WHERE user_id = ? AND guild_id = ?',
                  [robAmount, targetUser.id, interaction.guild.id]
              );
          } else {
              await run(
                  'UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?',
                  [robAmount, targetUser.id, interaction.guild.id]
              );
          }

          // Add money to robber's balance
          await run(
              'UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?',
              [robAmount, interaction.user.id, interaction.guild.id]
          );

          const embed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('✅ Beroving gelukt!')
              .setDescription(`Je hebt **€${robAmount.toLocaleString()}** gestolen van ${targetUser.username}'s ${source === 'bank' ? 'bankrekening' : 'portemonnee'}!`)
              .setTimestamp();

          return interaction.reply({ embeds: [embed] });
      } else {
          // Failed robbery
          const fineAmount = Math.min(
              Math.floor(robAmount * settings.robbery.failFineMultiplier),
              Number(userData.balance)
          );

          if (fineAmount > 0) {
              await run(
                  'UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?',
                  [fineAmount, interaction.user.id, interaction.guild.id]
              );
          }

          const embed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Beroving mislukt!')
              .setDescription(`Je poging om ${targetUser.username} te beroven is mislukt!${fineAmount > 0 ? `\n💰 Je bent **€${fineAmount.toLocaleString()}** kwijtgeraakt als boete.` : ''}`)
              .setTimestamp();

          return interaction.reply({ embeds: [embed] });
      }

    } catch (error) {
        console.error('Error in handleRobUser:', error);
        throw error;
    }
}

/**
 * Format seconds into a human-readable string
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours} uur`);
    if (minutes > 0) parts.push(`${minutes} minuten`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} seconden`);

    return parts.join(' ');
}

export default command;
