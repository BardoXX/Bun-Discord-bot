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
        .setDescription('Stel een verjaardag in')
        .addIntegerOption(option =>
          option.setName('dag')
            .setDescription('Dag van de verjaardag (1-31)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31))
        .addIntegerOption(option =>
          option.setName('maand')
            .setDescription('Maand van de verjaardag (1-12)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(12))
        .addUserOption(option =>
          option.setName('gebruiker')
            .setDescription('De gebruiker wiens verjaardag je wilt instellen')
            .setRequired(false)))
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
  const targetUser = interaction.options.getUser('gebruiker') || interaction.user;
  const day = interaction.options.getInteger('dag');
  const month = interaction.options.getInteger('maand');
  const setBy = interaction.user.id;

  try {
    // Check if user has permission to set birthdays for others
    if (targetUser.id !== interaction.user.id && !interaction.member.permissions.has('MANAGE_ROLES')) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Geen Toestemming')
        .setDescription('Je hebt geen toestemming om verjaardagen voor andere gebruikers in te stellen.')
        .setTimestamp();
      
      return await interaction.editReply({ embeds: [errorEmbed] });
    }

    // Use the birthday system to set the birthday
    await birthdaySystem.setBirthday(guildId, targetUser.id, day, month, setBy);

    console.log(`🎂 [birthday] Set birthday for ${targetUser.tag}: ${day}/${month} (set by ${interaction.user.tag})`);

    // Get the updated birthday record to include set_at timestamp
    const birthday = birthdaySystem.getBirthday(guildId, targetUser.id);

    // Create and send success embed
    const embed = birthdaySystem.createBirthdayEmbed(
      targetUser,
      day,
      month,
      setBy,
      birthday?.set_at
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ [birthday] Error setting birthday:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Fout')
      .setDescription('Er is een fout opgetreden bij het instellen van de verjaardag. Controleer of de datum geldig is.')
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
      let description = `**${targetUser.tag}** is jarig op **${birthday.day} ${birthdaySystem.getMonthName(birthday.month)}**.`;
      
      // Add who set the birthday if available
      if (birthday.set_by && birthday.set_by !== targetUser.id) {
        const setByUser = interaction.client.users.cache.get(birthday.set_by);
        const setByText = setByUser ? `<@${birthday.set_by}>` : `(ID: ${birthday.set_by})`;
        description += `\n\n👤 **Ingesteld door:** ${setByText}`;
      }
      
      // Add when it was set if available
      if (birthday.set_at) {
        const formattedDate = new Date(birthday.set_at).toLocaleDateString('nl-NL', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        description += `\n📅 **Datum ingesteld:** ${formattedDate}`;
      }
      
      embed.setDescription(description);
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
      .setColor('#FF69B4')
      .setTitle('🎂 Verjaardagskalender')
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || 'https://i.imgur.com/9Q1fq7a.png')
      .setFooter({ text: 'Gebruik /birthday set om je eigen verjaardag in te stellen!' })
      .setTimestamp();

    if (!birthdays || birthdays.length === 0) {
      embed.setDescription('Er zijn nog geen verjaardagen ingesteld in deze server. \nGebruik `/birthday set` om je verjaardag toe te voegen!');
      return await interaction.editReply({ embeds: [embed] });
    }

    // Group by month
    const grouped = {};
    birthdays.forEach(bd => {
      const monthName = birthdaySystem.getMonthName(bd.month);
      if (!grouped[monthName]) {
        grouped[monthName] = [];
      }
      grouped[monthName].push({
        ...bd,
        day: Number(bd.day),
        month: Number(bd.month)
      });
    });

    // Maandelijkse emoji's
    const monthEmojis = [
      '❄️',  // Januari
      '💝',  // Februari
      '🌷',  // Maart
      '🌸',  // April
      '🌼',  // Mei
      '☀️',  // Juni
      '🏖️',  // Juli
      '🌻',  // Augustus
      '🍂',  // September
      '🎃',  // Oktober
      '🍁',  // November
      '🎄'   // December
    ];

    // Sort months in chronological order (January to December)
    const monthOrder = [
      'januari', 'februari', 'maart', 'april', 'mei', 'juni',
      'juli', 'augustus', 'september', 'oktober', 'november', 'december'
    ];

    const sortedMonths = Object.keys(grouped).sort((a, b) => {
      return monthOrder.indexOf(a.toLowerCase()) - monthOrder.indexOf(b.toLowerCase());
    });

    // Get current date
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed
    const currentDay = now.getDate();

    // Create fields for each month
    for (const month of sortedMonths) {
      const bds = grouped[month];
      bds.sort((a, b) => a.day - b.day);
      
      let monthContent = '';
      let upcomingBirthdays = [];
      
      // Get month number from the first birthday in this month group
      const monthNumber = bds[0].month;
      
      bds.forEach(bd => {
        const userMention = `• <@${bd.user_id}>`;
        const dateStr = `**${bd.day} ${month}**`;
        
        // Check if birthday is today
        if (bd.day === currentDay && monthNumber === currentMonth) {
          upcomingBirthdays.push(`🎉 ${dateStr} - ${userMention} (Vandaag!)`);
        } 
        // Check if birthday is in the next 7 days
        else if (isUpcomingBirthday(bd.day, monthNumber, currentDay, currentMonth)) {
          const daysUntil = daysUntilBirthday(bd.day, monthNumber, currentDay, currentMonth);
          upcomingBirthdays.push(`🎈 ${dateStr} - ${userMention} (Over ${daysUntil} dag${daysUntil !== 1 ? 'en' : ''})`);
        } else {
          monthContent += `${dateStr} - ${userMention}\n`;
        }
      });

      // Add upcoming birthdays at the top
      if (upcomingBirthdays.length > 0) {
        monthContent = upcomingBirthdays.join('\n') + '\n\n' + monthContent;
      }

      // Voeg maandveld toe aan de embed
      if (monthContent.trim() !== '') {
        const monthIndex = monthOrder.indexOf(month.toLowerCase());
        const monthEmoji = monthIndex >= 0 ? monthEmojis[monthIndex] : '📅';
        
        embed.addFields({
          name: `${monthEmoji} ${month.charAt(0).toUpperCase() + month.slice(1)}`,
          value: monthContent.trim(),
          inline: true
        });
      }
    }

    // Add total count
    embed.setDescription(`**Totaal:** ${birthdays.length} verjaardagen geregistreerd`);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in handleListBirthdays:', error);
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Fout')
      .setDescription('Er is een fout opgetreden bij het ophalen van de verjaardagen.')
      .setTimestamp();
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

// Helper function to check if a birthday is in the next 7 days
function isUpcomingBirthday(birthDay, birthMonth, currentDay, currentMonth) {
  if (birthMonth !== currentMonth) return false;
  return birthDay > currentDay && birthDay <= currentDay + 7;
}

// Helper function to calculate days until birthday
function daysUntilBirthday(birthDay, birthMonth, currentDay, currentMonth) {
  if (birthMonth !== currentMonth) return 0;
  return birthDay - currentDay;
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
