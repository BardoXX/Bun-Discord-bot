import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BirthdaySystem } from '../utils/birthdaySystem.js';

// Initialize birthday system
let birthdaySystem;

export default {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Verjaardag commando\'s')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Stel je verjaardag in')
        .addIntegerOption(option =>
          option.setName('dag')
            .setDescription('Dag van je verjaardag (1-31)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31))
        .addIntegerOption(option =>
          option.setName('maand')
            .setDescription('Maand van je verjaardag (1-12)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(12)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('Bekijk een verjaardag')
        .addUserOption(option =>
          option.setName('gebruiker')
            .setDescription('De gebruiker waarvan je de verjaardag wilt bekijken')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Bekijk alle verjaardagen in deze server'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Verwijder je verjaardag'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('today')
        .setDescription('Bekijk wie er vandaag jarig is')),

  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const subcommand = interaction.options.getSubcommand();
    const db = interaction.client.db;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Initialize birthday system (use shared instance on client)
    if (!interaction.client.birthdaySystem) {
      interaction.client.birthdaySystem = new BirthdaySystem(db);
    }
    birthdaySystem = interaction.client.birthdaySystem;

    console.log(`🎂 [birthday] Processing subcommand: ${subcommand} for user ${interaction.user.tag}`);

    try {
      switch (subcommand) {
        case 'set':
          await handleSetBirthday(interaction, guildId, userId);
          break;
        case 'view':
          await handleViewBirthday(interaction, guildId);
          break;
        case 'list':
          await handleListBirthdays(interaction, guildId);
          break;
        case 'remove':
          await handleRemoveBirthday(interaction, guildId, userId);
          break;
        case 'today':
          await handleTodaysBirthdays(interaction, guildId);
          break;
        default:
          const unknownEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Onbekend Subcommando')
            .setDescription(`Het subcommando "${subcommand}" is onbekend.`)
            .setTimestamp();
          await interaction.editReply({ embeds: [unknownEmbed] });
          break;
      }

      console.log(`✅ [birthday] Subcommand ${subcommand} completed successfully`);

    } catch (error) {
      console.error(`❌ [birthday] Error in subcommand ${subcommand}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Er is een fout opgetreden')
        .setDescription('Er is een onverwachte fout opgetreden bij het uitvoeren van dit commando. Probeer het later opnieuw.')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

// Table initialization is now handled by BirthdaySystem class

async function handleSetBirthday(interaction, guildId, userId) {
  const day = interaction.options.getInteger('dag');
  const month = interaction.options.getInteger('maand');

  try {
    // Use the birthday system to set the birthday
    birthdaySystem.setBirthday(guildId, userId, day, month);

    console.log(`🎂 [birthday] Set birthday for ${interaction.user.tag}: ${day}/${month}`);

    // Create and send success embed
    const embed = birthdaySystem.createBirthdayEmbed(
      interaction.user,
      day,
      month
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ [birthday] Error setting birthday:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Fout')
      .setDescription('Er is een fout opgetreden bij het instellen van je verjaardag. Controleer of de datum geldig is.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function handleViewBirthday(interaction, guildId) {
  const targetUser = interaction.options.getUser('gebruiker') || interaction.user;

  try {
    const birthday = birthdaySystem.getBirthday(guildId, targetUser.id);

    const embed = new EmbedBuilder()
      .setColor('#ff69b4')
      .setTitle('🎂 Verjaardag')
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    if (!birthday) {
      embed.setDescription(`**${targetUser.tag}** heeft nog geen verjaardag ingesteld.`);
    } else {
      embed.setDescription(
        `**${targetUser.tag}** is jarig op **${birthday.day} ${birthdaySystem.getMonthName(birthday.month)}**.`
      );
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ [birthday] Error viewing birthday:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Fout')
      .setDescription('Er is een fout opgetreden bij het ophalen van de verjaardag.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function handleListBirthdays(interaction, guildId) {
  try {
    const birthdays = birthdaySystem.getAllBirthdays(guildId);

    const embed = new EmbedBuilder()
      .setColor('#ff69b4')
      .setTitle('🎂 Verjaardagen')
      .setTimestamp();

    if (!birthdays || birthdays.length === 0) {
      embed.setDescription('Er zijn nog geen verjaardagen ingesteld in deze server.');
    } else {
      // Group by month
      const grouped = {};
      birthdays.forEach(bd => {
        const monthName = birthdaySystem.getMonthName(bd.month);
        if (!grouped[monthName]) {
          grouped[monthName] = [];
        }
        grouped[monthName].push({
          ...bd,
          day: Number(bd.day),    // Convert day to Number
          month: Number(bd.month) // Convert month to Number
        });
      });

      let description = '';
      for (const [month, bds] of Object.entries(grouped)) {
        description += `**${month.charAt(0).toUpperCase() + month.slice(1)}**\n`;
        bds.sort((a, b) => a.day - b.day);
        description += bds.map(bd => {
          const user = interaction.guild.members.cache.get(bd.user_id)?.user?.tag || `Gebruiker (${bd.user_id})`;
          return `• ${bd.day} - ${user}`;
        }).join('\n') + '\n\n';
      }

      embed.setDescription(description);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ [birthday] Error listing birthdays:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Fout')
      .setDescription('Er is een fout opgetreden bij het ophalen van de verjaardagen.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function handleRemoveBirthday(interaction, guildId, userId) {
  try {
    birthdaySystem.removeBirthday(guildId, userId);

    const embed = new EmbedBuilder()
      .setColor('#ff69b4')
      .setTitle('🎂 Verjaardag Verwijderd')
      .setTimestamp();

    embed.setDescription('Je verjaardag is succesvol verwijderd.');

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ [birthday] Error removing birthday:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Fout')
      .setDescription('Er is een fout opgetreden bij het verwijderen van je verjaardag.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function handleTodaysBirthdays(interaction, guildId) {
  try {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;

    // Get today's birthdays using the birthday system
    const birthdays = birthdaySystem.getTodaysBirthdays(guildId, day, month);

    // Create and send the embed
    const embed = birthdaySystem.createTodaysBirthdayEmbed(birthdays, interaction.guild);

    // If no birthdays today, update the description
    if (birthdays.length === 0) {
      embed.setDescription('Er is vandaag niemand jarig in deze server.');
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ [birthday] Error getting today\'s birthdays:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Fout')
      .setDescription('Er is een fout opgetreden bij het ophalen van de verjaardagen van vandaag.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
