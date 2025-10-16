import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType } from 'discord.js';
import { BirthdaySystem } from '../utils/birthdaySystem.js';

function getBirthdayConfig(db, guildId) {
  try {
    const row = db.prepare('SELECT birthday_channel FROM guild_config WHERE guild_id = ?').get(guildId) || {};
    return { channelId: row.birthday_channel || null };
  } catch (error) {
    console.error('❌ [BirthdayWizard] Error getting birthday config:', error);
    return { channelId: null };
  }
}

function buildBirthdayEmbed(cfg) {
  return new EmbedBuilder()
    .setColor('#ff69b4')
    .setTitle('🎂 Verjaardag Wizard')
    .setDescription('Stel het verjaardagskanaal in en test de melding.')
    .addFields({ name: 'Kanaal', value: cfg.channelId ? `<#${cfg.channelId}>` : 'Niet ingesteld', inline: true })
    .setTimestamp();
}

function buildBirthdayComponents(cfg) {
  const row1 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('birthday_wizard_channel').addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1).setPlaceholder('Kies verjaardagskanaal')
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('birthday_wizard_test').setStyle(ButtonStyle.Secondary).setLabel('Stuur test'),
    new ButtonBuilder().setCustomId('birthday_wizard_today').setStyle(ButtonStyle.Secondary).setLabel('Vandaag'),
    new ButtonBuilder().setCustomId('birthday_wizard_close').setStyle(ButtonStyle.Danger).setLabel('Sluiten')
  );
  return [row1, row2];
}

async function handleBirthdayWizard(interaction, db) {
  try {
    const guildId = interaction.guild.id;

    // Ensure guild config exists
    db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);

    // Get current config
    const cfg = getBirthdayConfig(db, guildId);

    // Send the wizard interface
    await interaction.editReply({
      embeds: [buildBirthdayEmbed(cfg)],
      components: buildBirthdayComponents(cfg)
    });
  } catch (error) {
    console.error('❌ [BirthdayWizard] Error in handleBirthdayWizard:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Fout')
      .setDescription('Er is een fout opgetreden bij het openen van de verjaardagswizard.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function handleBirthdayWizardComponent(interaction) {
  try {
    const db = interaction.client.db;
    const guildId = interaction.guild.id;
    const cfg = getBirthdayConfig(db, guildId);
    const birthdaySystem = interaction.client.birthdaySystem || (interaction.client.birthdaySystem = new BirthdaySystem(db, interaction.client));

    // Handle close button
    if (interaction.isButton?.() && interaction.customId === 'birthday_wizard_close') {
      try {
        // Try to delete the message if it exists and is deletable
        if (interaction.message?.deletable && interaction.message.id) {
          await interaction.message.delete();
        } else {
          // Fallback: update the interaction to clear it
          await interaction.update({
            content: 'Verjaardag configuratie gesloten.',
            embeds: [],
            components: []
          });
        }
      } catch (error) {
        // Handle Discord API errors gracefully (e.g., message already deleted)
        if (error.code === 10008) {
          // Message not found - just update the interaction
          try {
            await interaction.update({
              content: 'Verjaardag configuratie gesloten.',
              embeds: [],
              components: []
            });
          } catch (updateError) {
            console.error('❌ [BirthdayWizard] Error updating interaction after message not found:', updateError.message);
          }
        } else {
          // Log other errors but don't crash
          console.error('❌ [BirthdayWizard] Error closing wizard:', error.message);
          try {
            await interaction.update({
              content: 'Verjaardag configuratie gesloten.',
              embeds: [],
              components: []
            });
          } catch (updateError) {
            console.error('❌ [BirthdayWizard] Error updating interaction after unexpected error:', updateError.message);
          }
        }
      }
      return;
    }

    // Handle channel selection
    if (interaction.isChannelSelectMenu?.() && interaction.customId === 'birthday_wizard_channel') {
      const chId = interaction.values?.[0];
      if (chId) {
        db.prepare('UPDATE guild_config SET birthday_channel = ? WHERE guild_id = ?').run(chId, guildId);
      }
      const ncfg = getBirthdayConfig(db, guildId);
      return interaction.update({
        embeds: [buildBirthdayEmbed(ncfg)],
        components: buildBirthdayComponents(ncfg)
      });
    }

    // Handle test button
    if (interaction.isButton?.() && interaction.customId === 'birthday_wizard_test') {
      const chId = cfg.channelId;

      if (!chId) {
        return interaction.reply({
          ephemeral: true,
          embeds: [
            new EmbedBuilder()
              .setColor('#ff9900')
              .setTitle('⚠️ Geen kanaal ingesteld')
              .setDescription('Selecteer eerst een kanaal voor de verjaardagsmeldingen.')
              .setTimestamp()
          ]
        });
      }

      const ch = interaction.guild.channels.cache.get(chId);
      if (!ch) {
        return interaction.reply({
          ephemeral: true,
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setTitle('❌ Kanaal niet gevonden')
              .setDescription('Het geselecteerde kanaal kon niet worden gevonden. Selecteer een ander kanaal.')
              .setTimestamp()
          ]
        });
      }

      // Send test message
      try {
        const testEmbed = new EmbedBuilder()
          .setColor('#ff69b4')
          .setTitle('🎉 Verjaardag Test')
          .setDescription(`Dit is een testbericht voor verjaardagsmeldingen in dit kanaal.`)
          .setFooter({ text: 'Dit bericht is alleen zichtbaar voor jou.' })
          .setTimestamp();

        await ch.send({ embeds: [testEmbed] });

        await interaction.reply({
          ephemeral: true,
          embeds: [
            new EmbedBuilder()
              .setColor('#00cc66')
              .setTitle('✅ Test verzonden')
              .setDescription(`Er is een testbericht verzonden naar <#${chId}>.`)
              .setTimestamp()
          ]
        });
      } catch (error) {
        console.error('❌ [BirthdayWizard] Error sending test message:', error);

        await interaction.reply({
          ephemeral: true,
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setTitle('❌ Fout')
              .setDescription('Kon geen testbericht verzenden. Controleer de botpermissies voor het kanaal.')
              .setTimestamp()
          ]
        });
      }
      return;
    }

    // Handle today's birthdays button
    if (interaction.isButton?.() && interaction.customId === 'birthday_wizard_today') {
      try {
        // Get today's date
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1;

        // Get today's birthdays using the birthday system
        const birthdays = birthdaySystem.getTodaysBirthdays(guildId, day, month);

        if (!birthdays || birthdays.length === 0) {
          return interaction.reply({
            ephemeral: true,
            embeds: [
              new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('ℹ️ Geen verjaardagen vandaag')
                .setDescription('Er zijn vandaag geen verjaardagen in deze server.')
                .setTimestamp()
            ]
          });
        }

        // Create a nice list of today's birthdays
        const birthdayList = birthdays.map(bd => {
          const member = interaction.guild.members.cache.get(bd.user_id);
          const username = member ? member.user.tag : `<@${bd.user_id}>`;
          return `🎂 **${username}**`;
        }).join('\n');

        const embed = new EmbedBuilder()
          .setColor('#ff69b4')
          .setTitle('🎉 Verjaardagen Vandaag')
          .setDescription(birthdayList)
          .setTimestamp();

        return interaction.reply({
          ephemeral: true,
          embeds: [embed]
        });

      } catch (error) {
        console.error('❌ [BirthdayWizard] Error getting today\'s birthdays:', error);

        return interaction.reply({
          ephemeral: true,
          embeds: [
            new EmbedBuilder()
              .setColor('#ff0000')
              .setTitle('❌ Fout')
              .setDescription('Er is een fout opgetreden bij het ophalen van de verjaardagen van vandaag.')
              .setTimestamp()
          ]
        });
      }
    }

  } catch (error) {
    console.error('❌ [BirthdayWizard] Error in handleBirthdayWizardComponent:', error);

    try {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Er is een onverwachte fout opgetreden bij het verwerken van je verzoek.')
            .setTimestamp()
        ]
      });
    } catch (e) {
      // If we can't reply, try to update the interaction
      try {
        await interaction.update({
          content: 'Er is een fout opgetreden.',
          embeds: [],
          components: []
        });
      } catch (e) {
        console.error('❌ [BirthdayWizard] Could not send error message:', e);
      }
    }
  }
}

export { handleBirthdayWizard, handleBirthdayWizardComponent };
