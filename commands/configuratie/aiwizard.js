import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { canEncrypt, encryptString } from '../../modules/ai/secretUtil.js';

function toNumber(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function ensureGuildRow(db, guildId) {
  db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
}

function getAIConfig(db, guildId) {
  ensureGuildRow(db, guildId);
  ensureSecretColumns(db);
  const cfg = db.prepare(
    'SELECT ai_enabled, ai_provider, ai_model, ai_system_prompt, ai_temperature, ai_max_tokens, ai_channels, ai_require_mention, ai_cooldown_seconds, ai_use_guild_secrets, ai_openai_key_enc, ai_openai_base_enc FROM guild_config WHERE guild_id = ?'
  ).get(guildId) || {};
  const channels = (() => {
    try { const arr = cfg.ai_channels ? JSON.parse(cfg.ai_channels) : []; return Array.isArray(arr) ? arr : []; } catch { return []; }
  })();
  return {
    enabled: !!(cfg.ai_enabled),
    provider: cfg.ai_provider || 'local',
    model: cfg.ai_model || 'standaard',
    system_prompt: cfg.ai_system_prompt || '',
    temperature: Number(cfg.ai_temperature ?? 0.7),
    max_tokens: Number(cfg.ai_max_tokens ?? 256),
    channels,
    require_mention: !!(cfg.ai_require_mention),
    cooldown: Number(cfg.ai_cooldown_seconds ?? 15),
    use_guild_secrets: !!(cfg.ai_use_guild_secrets),
    has_key: !!cfg.ai_openai_key_enc,
    has_base: !!cfg.ai_openai_base_enc,
  };
}

function setAIConfig(db, guildId, updates) {
  const keys = Object.keys(updates);
  if (!keys.length) return;
  const cols = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => updates[k]);
  db.prepare(`UPDATE guild_config SET ${cols} WHERE guild_id = ?`).run(...vals, guildId);
}

function ensureSecretColumns(db) {
  try {
    const cols = db.prepare('PRAGMA table_info(guild_config)').all().map(c => c.name);
    const addCol = (name, type = 'TEXT') => { try { db.prepare(`ALTER TABLE guild_config ADD COLUMN ${name} ${type}`).run(); } catch {} };
    if (!cols.includes('ai_use_guild_secrets')) addCol('ai_use_guild_secrets', 'INTEGER');
    if (!cols.includes('ai_openai_key_enc')) addCol('ai_openai_key_enc', 'TEXT');
    if (!cols.includes('ai_openai_base_enc')) addCol('ai_openai_base_enc', 'TEXT');
  } catch (e) { console.warn('[aiwizard] ensureSecretColumns failed:', e?.message); }
}

function buildEmbed(cfg) {
  let channelsText = 'Alle kanalen';
  if (Array.isArray(cfg.channels) && cfg.channels.length > 0) {
    channelsText = cfg.channels.map(id => `<#${id}>`).join(', ');
  }
  const embed = new EmbedBuilder()
    .setColor(cfg.enabled ? '#00cc66' : '#ff9900')
    .setTitle('🤖 AI Auto-Responder Wizard')
    .addFields(
      { name: 'Status', value: cfg.enabled ? 'Aan' : 'Uit', inline: true },
      { name: 'Provider', value: cfg.provider, inline: true },
      { name: 'Model', value: cfg.model, inline: true },
      { name: 'Temperature', value: String(cfg.temperature), inline: true },
      { name: 'Max tokens', value: String(cfg.max_tokens), inline: true },
      { name: 'Vereist mention', value: cfg.require_mention ? 'Ja' : 'Nee', inline: true },
      { name: 'Cooldown (s)', value: String(cfg.cooldown), inline: true },
      { name: 'Sleutel bron', value: cfg.use_guild_secrets ? 'Per-guild (versleuteld)' : 'ENV', inline: true },
      { name: 'Key aanwezig', value: cfg.has_key ? 'Ja' : 'Nee', inline: true },
      { name: 'Base aanwezig', value: cfg.has_base ? 'Ja' : 'Nee', inline: true },
      { name: 'Kanalen', value: channelsText, inline: false },
    )
    .setTimestamp();
  if (cfg.system_prompt) {
    embed.addFields({ name: 'System prompt', value: cfg.system_prompt.slice(0, 256) + (cfg.system_prompt.length > 256 ? '…' : ''), inline: false });
  }
  return embed;
}

function buildComponents(cfg) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_wizard_toggle_enabled').setLabel(cfg.enabled ? 'Status: Aan' : 'Status: Uit').setStyle(cfg.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_wizard_toggle_mention').setLabel(cfg.require_mention ? 'Mention: Ja' : 'Mention: Nee').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_wizard_provider_local').setLabel('Provider: Local').setStyle(cfg.provider === 'local' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_wizard_provider_openai').setLabel('Provider: OpenAI').setStyle(cfg.provider === 'openai' ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_wizard_temp_minus').setLabel('Temp −').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_wizard_temp_plus').setLabel('Temp +').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_wizard_tokens_minus').setLabel('Tokens −').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_wizard_tokens_plus').setLabel('Tokens +').setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_wizard_cd_minus').setLabel('Cooldown −').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_wizard_cd_plus').setLabel('Cooldown +').setStyle(ButtonStyle.Secondary),
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_wizard_edit_model').setLabel('Model wijzigen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ai_wizard_edit_system').setLabel('System prompt').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ai_wizard_toggle_secret_source').setLabel(`Sleutel: ${cfg.use_guild_secrets ? 'Guild' : 'ENV'}`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_wizard_set_key').setLabel('OpenAI Key zetten').setStyle(ButtonStyle.Secondary).setDisabled(!canEncrypt()),
    new ButtonBuilder().setCustomId('ai_wizard_set_base').setLabel('OpenAI Base zetten').setStyle(ButtonStyle.Secondary).setDisabled(!canEncrypt()),
  );
  const row5 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('ai_wizard_add_channel').setPlaceholder('Kanaal toevoegen').addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1),
  );
  return [row1, row2, row3, row4, row5];
}

async function replyWithUI(interaction, db) {
  const cfg = getAIConfig(db, interaction.guild.id);
  const embed = buildEmbed(cfg);
  const components = buildComponents(cfg);
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components });
  } else {
    await interaction.reply({ embeds: [embed], components, ephemeral: true });
  }
}

export async function handleAIWizardComponent(interaction) {
  const db = interaction.client.db;
  const guildId = interaction.guild.id;
  try {
    ensureSecretColumns(db);
    // Toggles
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === 'ai_wizard_toggle_enabled') {
        const cur = getAIConfig(db, guildId).enabled;
        setAIConfig(db, guildId, { ai_enabled: cur ? 0 : 1 });
        await replyWithUI(interaction, db);
        return;
      }
      if (id === 'ai_wizard_toggle_mention') {
        const cur = getAIConfig(db, guildId).require_mention;
        setAIConfig(db, guildId, { ai_require_mention: cur ? 0 : 1 });
        await replyWithUI(interaction, db);
        return;
      }
      if (id === 'ai_wizard_provider_local' || id === 'ai_wizard_provider_openai') {
        const provider = id.endsWith('openai') ? 'openai' : 'local';
        setAIConfig(db, guildId, { ai_provider: provider });
        await replyWithUI(interaction, db);
        return;
      }
      if (id === 'ai_wizard_toggle_secret_source') {
        const cur = getAIConfig(db, guildId).use_guild_secrets;
        setAIConfig(db, guildId, { ai_use_guild_secrets: cur ? 0 : 1 });
        await replyWithUI(interaction, db);
        return;
      }
      if (id === 'ai_wizard_set_key') {
        if (!canEncrypt()) {
          return await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ AI_MASTER_KEY ontbreekt').setDescription('Zet AI_MASTER_KEY in .env (32 bytes, raw/hex/base64) om per-guild geheimen te gebruiken.').setTimestamp()] });
        }
        const modal = new ModalBuilder().setCustomId('ai_wizard_modal_set_key').setTitle('OpenAI API Key');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('API Key').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)));
        await interaction.showModal(modal);
        return;
      }
      if (id === 'ai_wizard_set_base') {
        if (!canEncrypt()) {
          return await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ AI_MASTER_KEY ontbreekt').setDescription('Zet AI_MASTER_KEY in .env (32 bytes, raw/hex/base64) om per-guild geheimen te gebruiken.').setTimestamp()] });
        }
        const modal = new ModalBuilder().setCustomId('ai_wizard_modal_set_base').setTitle('OpenAI Base URL');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('base').setLabel('Base URL (bv https://api.openai.com/v1)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)));
        await interaction.showModal(modal);
        return;
      }
      if (id === 'ai_wizard_temp_minus' || id === 'ai_wizard_temp_plus') {
        const cur = getAIConfig(db, guildId).temperature;
        const next = clamp(cur + (id.endsWith('plus') ? 0.1 : -0.1), 0, 2);
        setAIConfig(db, guildId, { ai_temperature: Number(next.toFixed(2)) });
        await replyWithUI(interaction, db);
        return;
      }
      if (id === 'ai_wizard_tokens_minus' || id === 'ai_wizard_tokens_plus') {
        const cur = getAIConfig(db, guildId).max_tokens;
        const next = clamp(cur + (id.endsWith('plus') ? 64 : -64), 1, 4000);
        setAIConfig(db, guildId, { ai_max_tokens: Math.round(next) });
        await replyWithUI(interaction, db);
        return;
      }
      if (id === 'ai_wizard_cd_minus' || id === 'ai_wizard_cd_plus') {
        const cur = getAIConfig(db, guildId).cooldown;
        const next = clamp(cur + (id.endsWith('plus') ? 5 : -5), 0, 3600);
        setAIConfig(db, guildId, { ai_cooldown_seconds: Math.round(next) });
        await replyWithUI(interaction, db);
        return;
      }
      if (id === 'ai_wizard_edit_model') {
        const modal = new ModalBuilder().setCustomId('ai_wizard_modal_model').setTitle('Model wijzigen');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('model').setLabel('Model').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
          )
        );
        await interaction.showModal(modal);
        return;
      }
      if (id === 'ai_wizard_edit_system') {
        const modal = new ModalBuilder().setCustomId('ai_wizard_modal_system').setTitle('System prompt');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('system').setLabel('System prompt').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
          )
        );
        await interaction.showModal(modal);
        return;
      }
    }
    // Channel add
    if ((interaction.isAnySelectMenu?.() || interaction.isChannelSelectMenu?.()) && interaction.customId === 'ai_wizard_add_channel') {
      const chId = interaction.values?.[0];
      const cfg = getAIConfig(db, guildId);
      const list = Array.from(new Set([...(cfg.channels || []), chId]));
      setAIConfig(db, guildId, { ai_channels: list.length ? JSON.stringify(list) : null });
      await replyWithUI(interaction, db);
      return;
    }
    // Modal submits
    if (interaction.isModalSubmit?.()) {
      if (interaction.customId === 'ai_wizard_modal_model') {
        const model = interaction.fields.getTextInputValue('model')?.trim();
        if (model && model.length <= 80) setAIConfig(db, guildId, { ai_model: model });
        await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#00cc66').setTitle('✅ Model opgeslagen').setTimestamp()] });
        return;
      }
      if (interaction.customId === 'ai_wizard_modal_system') {
        const sys = interaction.fields.getTextInputValue('system')?.trim();
        if (sys) setAIConfig(db, guildId, { ai_system_prompt: sys });
        await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#00cc66').setTitle('✅ System prompt opgeslagen').setTimestamp()] });
        return;
      }
      if (interaction.customId === 'ai_wizard_modal_set_key') {
        try {
          const key = interaction.fields.getTextInputValue('key')?.trim();
          if (key) setAIConfig(db, guildId, { ai_openai_key_enc: encryptString(key) });
          await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#00cc66').setTitle('✅ API key opgeslagen').setTimestamp()] });
        } catch (e) {
          await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Opslaan mislukt').setDescription(e?.message || 'Encryptie fout').setTimestamp()] });
        }
        return;
      }
      if (interaction.customId === 'ai_wizard_modal_set_base') {
        try {
          const base = interaction.fields.getTextInputValue('base')?.trim();
          if (base) setAIConfig(db, guildId, { ai_openai_base_enc: encryptString(base) });
          await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#00cc66').setTitle('✅ Base URL opgeslagen').setTimestamp()] });
        } catch (e) {
          await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Opslaan mislukt').setDescription(e?.message || 'Encryptie fout').setTimestamp()] });
        }
        return;
      }
    }
  } catch (e) {
    console.error('❌ AI Wizard error:', e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('❌ Fout').setDescription('Kon AI-instellingen niet bijwerken.').setTimestamp()] });
    }
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('aiwizard')
    .setDescription('Open de AI configuratie wizard (ephemeral)')
    .setDefaultMemberPermissions(0),
  async execute(interaction) {
    const db = interaction.client.db;
    await replyWithUI(interaction, db);
  }
};
