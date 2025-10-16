import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { formatMessage } from '../helper/formatMessage.js';

function getWelcomeConfig(db, guildId) {
  const row = db.prepare(`SELECT welcome_channel, welcome_role, welcome_title, welcome_message, welcome_color, welcome_image, welcome_footer, welcome_embed_enabled FROM guild_config WHERE guild_id = ?`).get(guildId) || {};
  return {
    channelId: row.welcome_channel || null,
    roleId: row.welcome_role || null,
    title: row.welcome_title || '',
    message: row.welcome_message || '',
    color: row.welcome_color || '#00ff00',
    image: row.welcome_image || '',
    footer: row.welcome_footer || '',
    embedEnabled: !!row.welcome_embed_enabled,
  };
}

function buildWelcomeEmbed(cfg) {
  return new EmbedBuilder()
    .setColor('#00a8ff')
    .setTitle('👋 Welkom Wizard')
    .setDescription('Stel hier eenvoudig het welkomstbericht in met knoppen en selecties.')
    .addFields(
      { name: 'Kanaal', value: cfg.channelId ? `<#${cfg.channelId}>` : 'Niet ingesteld', inline: true },
      { name: 'Rol', value: cfg.roleId ? `<@&${cfg.roleId}>` : 'Geen', inline: true },
      { name: 'Embed', value: cfg.embedEnabled ? 'Aan' : 'Uit', inline: true },
      { name: 'Titel', value: cfg.title || '—', inline: false },
      { name: 'Bericht', value: (cfg.message || '—').slice(0, 200) + ((cfg.message?.length || 0) > 200 ? '…' : ''), inline: false },
      { name: 'Kleur', value: cfg.color || '—', inline: true },
      { name: 'Afbeelding', value: cfg.image || '—', inline: true },
      { name: 'Footer', value: cfg.footer || '—', inline: false },
      {
        name: '💡 Beschikbare Placeholders',
        value: '• **{user}** - Noemt de nieuwe gebruiker\n• **{guild}** - Naam van de server\n• **{member_count}** - Aantal leden\n\n*Deze placeholders werken in titel, bericht en footer!*',
        inline: false
      },
      {
        name: '🎨 Discord Formatting',
        value: '• **\\*\\*tekst\\*\\*** - **Vetgedrukt**\n• *\\*tekst\\** - *Cursief*\n• `\\`tekst\\`` - `Code`\n• ~~\\~\\~tekst\\~\\~~~ - ~~Doorgestreept~~\n• \\_\\_tekst\\_\\_ - __Onderstreept__',
        inline: false
      }
    )
    .setTimestamp();
}

function buildWelcomeComponents(cfg) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('welcome_wizard_toggle_embed').setStyle(cfg.embedEnabled ? ButtonStyle.Success : ButtonStyle.Secondary).setLabel(cfg.embedEnabled ? 'Embed: Aan' : 'Embed: Uit'),
    new ButtonBuilder().setCustomId('welcome_wizard_edit_title').setStyle(ButtonStyle.Primary).setLabel('Titel'),
    new ButtonBuilder().setCustomId('welcome_wizard_edit_message').setStyle(ButtonStyle.Primary).setLabel('Bericht')
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('welcome_wizard_edit_color').setStyle(ButtonStyle.Secondary).setLabel('Kleur'),
    new ButtonBuilder().setCustomId('welcome_wizard_edit_image').setStyle(ButtonStyle.Secondary).setLabel('Afbeelding'),
    new ButtonBuilder().setCustomId('welcome_wizard_edit_footer').setStyle(ButtonStyle.Secondary).setLabel('Footer')
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('welcome_wizard_channel').addChannelTypes(ChannelType.GuildText).setPlaceholder('Kies welkom kanaal').setMinValues(1).setMaxValues(1)
  );
  const row4 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder().setCustomId('welcome_wizard_role').setPlaceholder('Kies (optionele) rol').setMinValues(1).setMaxValues(1)
  );
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('welcome_wizard_preview').setStyle(ButtonStyle.Secondary).setLabel('Voorbeeld sturen'),
    new ButtonBuilder().setCustomId('welcome_wizard_done').setStyle(ButtonStyle.Success).setLabel('Klaar'),
    new ButtonBuilder().setCustomId('welcome_wizard_close').setStyle(ButtonStyle.Danger).setLabel('Sluiten')
  );
  return [row1, row2, row3, row4, row5];
}

async function handleWelcomeWizard(interaction, db) {
  const guildId = interaction.guild.id;
  db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
  const cfg = getWelcomeConfig(db, guildId);
  await interaction.editReply({ embeds: [buildWelcomeEmbed(cfg)], components: buildWelcomeComponents(cfg) });
}

async function handleWelcomeWizardComponent(interaction) {
  const db = interaction.client.db;
  const guildId = interaction.guild.id;
  const cfg = getWelcomeConfig(db, guildId);

  if (interaction.isButton?.() && interaction.customId === 'welcome_wizard_close') {
    try { if (interaction.message?.deletable) return interaction.message.delete(); } catch {}
    return interaction.update({ content: 'Welkom configuratie gesloten.', embeds: [], components: [] });
  }

  if (interaction.isButton?.() && interaction.customId === 'welcome_wizard_toggle_embed') {
    const next = cfg.embedEnabled ? 0 : 1;
    db.prepare('UPDATE guild_config SET welcome_embed_enabled = ? WHERE guild_id = ?').run(next, guildId);
    const ncfg = getWelcomeConfig(db, guildId);
    return interaction.update({ embeds: [buildWelcomeEmbed(ncfg)], components: buildWelcomeComponents(ncfg) });
  }

  if (interaction.isChannelSelectMenu?.() && interaction.customId === 'welcome_wizard_channel') {
    const chId = interaction.values?.[0];
    if (chId) db.prepare('UPDATE guild_config SET welcome_channel = ? WHERE guild_id = ?').run(chId, guildId);
    const ncfg = getWelcomeConfig(db, guildId);
    return interaction.update({ embeds: [buildWelcomeEmbed(ncfg)], components: buildWelcomeComponents(ncfg) });
  }

  if (interaction.isRoleSelectMenu?.() && interaction.customId === 'welcome_wizard_role') {
    const roleId = interaction.values?.[0] || null;
    db.prepare('UPDATE guild_config SET welcome_role = ? WHERE guild_id = ?').run(roleId, guildId);
    const ncfg = getWelcomeConfig(db, guildId);
    return interaction.update({ embeds: [buildWelcomeEmbed(ncfg)], components: buildWelcomeComponents(ncfg) });
  }

  const openModal = async (id, title, label, style, value = '') => {
    const modal = new ModalBuilder().setCustomId(id).setTitle(title);
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel(label).setStyle(style).setRequired(false).setValue(value)));
    return interaction.showModal(modal);
  };

  if (interaction.isButton?.() && interaction.customId === 'welcome_wizard_edit_title') {
    return openModal('welcome_wizard_modal_title', 'Titel aanpassen', 'Titel ({user}, {guild}, {member_count})', TextInputStyle.Short, cfg.title || '**Welkom** bij {guild}!');
  }
  if (interaction.isButton?.() && interaction.customId === 'welcome_wizard_edit_message') {
    return openModal('welcome_wizard_modal_message', 'Bericht aanpassen', 'Bericht (gebruik placeholders)', TextInputStyle.Paragraph, cfg.message || '**Welkom** {user} in *{guild}*! We hebben nu **{member_count}** leden!');
  }
  if (interaction.isButton?.() && interaction.customId === 'welcome_wizard_edit_color') {
    return openModal('welcome_wizard_modal_color', 'Kleur aanpassen', 'Hex kleur (bijv. #00ff00)', TextInputStyle.Short, cfg.color || '#00ff00');
  }
  if (interaction.isButton?.() && interaction.customId === 'welcome_wizard_edit_image') {
    return openModal('welcome_wizard_modal_image', 'Afbeelding aanpassen', 'Afbeelding URL of "user_avatar"', TextInputStyle.Short, cfg.image || '');
  }
  if (interaction.isButton?.() && interaction.customId === 'welcome_wizard_edit_footer') {
    return openModal('welcome_wizard_modal_footer', 'Footer aanpassen', 'Footer ({user}, {guild}, {member_count})', TextInputStyle.Short, cfg.footer || '*Geniet* van je verblijf bij {guild}!');
  }

  if (interaction.isModalSubmit?.()) {
    const id = interaction.customId;
    const val = interaction.fields.getTextInputValue('val')?.trim();
    if (id === 'welcome_wizard_modal_title') {
      db.prepare('UPDATE guild_config SET welcome_title = ? WHERE guild_id = ?').run(val || null, guildId);
    } else if (id === 'welcome_wizard_modal_message') {
      db.prepare('UPDATE guild_config SET welcome_message = ? WHERE guild_id = ?').run(val || null, guildId);
    } else if (id === 'welcome_wizard_modal_color') {
      if (val && !/^#?[0-9A-Fa-f]{6}$/.test(val)) {
        return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Ongeldige kleur').setDescription('Gebruik een geldige hex kleur, bijv. #00ff00').setTimestamp()] });
      }
      const color = val ? (val.startsWith('#') ? val : `#${val}`) : null;
      db.prepare('UPDATE guild_config SET welcome_color = ? WHERE guild_id = ?').run(color, guildId);
    } else if (id === 'welcome_wizard_modal_image') {
      db.prepare('UPDATE guild_config SET welcome_image = ? WHERE guild_id = ?').run(val || null, guildId);
    } else if (id === 'welcome_wizard_modal_footer') {
      db.prepare('UPDATE guild_config SET welcome_footer = ? WHERE guild_id = ?').run(val || null, guildId);
    }
    return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#00cc66').setTitle('✅ Opgeslagen').setTimestamp()] });
  }

  if (interaction.isButton?.() && interaction.customId === 'welcome_wizard_preview') {
    const row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId) || {};
    const chId = row.welcome_channel;
    if (!chId) return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff9900').setTitle('⚠️ Geen kanaal ingesteld').setDescription('Kies eerst een welkom kanaal.').setTimestamp()] });
    const ch = interaction.guild.channels.cache.get(chId);
    if (!ch) return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Kanaal niet gevonden').setTimestamp()] });
    try {
      const ncfg = getWelcomeConfig(db, guildId);
      if (ncfg.embedEnabled) {
        const replacements = {
          user: `<@${interaction.user.id}>`,
          guild: interaction.guild.name,
          member_count: interaction.guild.memberCount
        };

        const e = new EmbedBuilder()
          .setColor(ncfg.color || '#00ff00')
          .setTitle(formatMessage(ncfg.title || '**Welkom** bij {guild}!', replacements))
          .setDescription(formatMessage(ncfg.message || '**Welkom** {user} in *{guild}*!', replacements))
          .setTimestamp();
        if (ncfg.image) {
          if (ncfg.image === 'user_avatar') e.setThumbnail(interaction.user.displayAvatarURL()); else e.setImage(ncfg.image);
        }
        if (ncfg.footer) e.setFooter({ text: formatMessage(ncfg.footer || '*Geniet* van je verblijf bij {guild}!', replacements) });
        await ch.send({ embeds: [e] });
      } else {
        const replacements = {
          user: `<@${interaction.user.id}>`,
          guild: interaction.guild.name,
          member_count: interaction.guild.memberCount
        };
        const text = formatMessage(ncfg.message || '**Welkom** {user} in *{guild}*!', replacements);
        await ch.send(text);
      }
      return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#00cc66').setTitle('✅ Voorbeeld verzonden').setTimestamp()] });
    } catch (e) {
      return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Verzenden mislukt').setDescription(String(e.message || e)).setTimestamp()] });
    }
  }

  if (interaction.isButton?.() && interaction.customId === 'welcome_wizard_done') {
    return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#00cc66').setTitle('✅ Welkom-instellingen opgeslagen').setTimestamp()] });
  }
}

export { handleWelcomeWizard, handleWelcomeWizardComponent };
