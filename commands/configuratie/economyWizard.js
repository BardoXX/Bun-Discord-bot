import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

class EconomyWizard {
  constructor(db) {
    this.db = db;
    this.userSessions = new Map(); // Track user navigation state
  }

  // Get user's current session or create new one
  getUserSession(userId) {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, {
        currentPage: 'welcome',
        breadcrumb: [],
        lastInteraction: Date.now()
      });
    }
    return this.userSessions.get(userId);
  }

  // Clean up old sessions (call periodically)
  cleanupSessions() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes
    
    for (const [userId, session] of this.userSessions.entries()) {
      if (now - session.lastInteraction > timeout) {
        this.userSessions.delete(userId);
      }
    }
  }

  // Main handler for /config economie
  async handleEconomyConfig(interaction) {
    const session = this.getUserSession(interaction.user.id);
    session.lastInteraction = Date.now();
    
    const { embed, components } = this.buildWelcomeScreen();
    
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed], components, ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
  }

  // Handle all button/select menu interactions
  async handleWizardInteraction(interaction) {
    const session = this.getUserSession(interaction.user.id);
    session.lastInteraction = Date.now();
    
    const customId = interaction.customId;
    const guildId = interaction.guild.id;
    const settings = this.getGuildEcoSettings(guildId);

    try {
      // Parse the action from customId
      const [prefix, action, ...params] = customId.split('_');
      
      if (prefix !== 'eco' && prefix !== 'economy') return;

      switch (action) {
        case 'start':
          return this.navigateToPage(interaction, 'main', settings);
          
        case 'cancel':
        case 'close':
          return this.closePage(interaction);
          
        case 'page':
          const page = params[0];
          return this.navigateToPage(interaction, page, settings);
          
        case 'back':
          return this.navigateBack(interaction, settings);
          
        case 'toggle':
          return this.handleToggle(interaction, params[0], settings);
          
        case 'set':
          return this.handleSetValue(interaction, params[0], settings);
          
        case 'quick':
          return this.handleQuickAction(interaction, params, settings);
          
        default:
          console.log(`Unhandled wizard action: ${action}`);
      }
    } catch (error) {
      console.error('Error in handleWizardInteraction:', error);
      await this.sendError(interaction, 'Er is een fout opgetreden.');
    }
  }

  // Handle component interactions for the economy wizard
  async handleEconomyWizardComponent(interaction) {
    try {
      // Defer the reply to prevent interaction timeout
      await interaction.deferUpdate();
      
      const { customId } = interaction;
      const session = this.getUserSession(interaction.user.id);
      
      // Handle button interactions
      if (interaction.isButton()) {
        if (customId === 'back') {
          return await this.navigateBack(interaction, session.settings);
        } else if (customId === 'home') {
          return await this.navigateToPage(interaction, 'main', session.settings);
        } else if (customId === 'close') {
          return await this.closePage(interaction);
        } else if (customId.startsWith('toggle_')) {
          const setting = customId.replace('toggle_', '');
          return await this.handleToggle(interaction, setting, session.settings);
        } else if (customId.startsWith('quick_')) {
          const action = customId.replace('quick_', '');
          return await this.handleQuickAction(interaction, action, session.settings);
        }
      }
      
      // Handle select menu interactions
      if (interaction.isStringSelectMenu()) {
        const [action, ...params] = customId.split('_');
        const value = interaction.values[0];
        
        if (action === 'select') {
          if (params[0] === 'page') {
            return await this.navigateToPage(interaction, value, session.settings);
          }
        }
      }
      
      // Handle modal submissions
      if (interaction.isModalSubmit()) {
        if (customId === 'rob_settings_modal') {
          return await this.handleRobSettingsModal(interaction);
        } else if (customId === 'quick_setup_modal') {
          return await this.handleQuickSetupModal(interaction);
        }
      }
      
      // If we get here, the interaction wasn't handled
      console.log(`Unhandled interaction: ${customId}`);
      
    } catch (error) {
      console.error('Error in handleEconomyWizardComponent:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('❌ Fout')
        .setDescription('Er is een fout opgetreden bij het verwerken van deze actie.')
        .setFooter({ text: 'Probeer het later opnieuw' })
        .setTimestamp();
      
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed], components: [], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }

  // Handle the main economy wizard interaction
  async handleEconomyWizard(interaction, page = 0) {
    const session = this.getUserSession(interaction.user.id);
    session.lastInteraction = Date.now();

    // Define all economy categories in pages
    const economyPages = [
      // Page 1: Core Economy
      [
        { id: 'eco_work_menu', label: '🛠️ Werk & Banen', description: 'Beheer banen en werk instellingen', emoji: '🛠️' },
        { id: 'eco_currency_menu', label: '💰 Valuta & Prijzen', description: 'Stel valuta en prijzen in', emoji: '💰' },
        { id: 'eco_bank_menu', label: '🏦 Bank & Winkel', description: 'Configureer de bank en winkel', emoji: '🏦' },
        { id: 'eco_shop_menu', label: '🛍️ Winkel Items', description: 'Beheer verkoopbare items', emoji: '🛒' },
        { id: 'eco_robbery_menu', label: '🏴‍☠️ Overvallen', description: 'Stel overval instellingen in', emoji: '🏴‍☠️' },
      ],
      // Page 2: Advanced Economy
      [
        { id: 'eco_roles_menu', label: '👑 Speciale Rollen', description: 'Rollen met economische voordelen', emoji: '👑' },
        { id: 'eco_events_menu', label: '🎉 Evenementen', description: 'Tijdelijke economische evenementen', emoji: '🎉' },
        { id: 'eco_leaderboard_menu', label: '🏆 Scorebord', description: 'Configureer het scorebord', emoji: '🏆' },
        { id: 'eco_shop_roles_menu', label: '🛍️ Rol Winkel', description: 'Rollen te koop in de winkel', emoji: '🛍️' },
        { id: 'eco_shop_items_menu', label: '🎁 Item Winkel', description: 'Items te koop in de winkel', emoji: '🎁' },
      ],
      // Add more pages as needed
    ];

    const currentPage = economyPages[page];
    const totalPages = economyPages.length;

    // Create category select menu
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId('eco_category_select')
      .setPlaceholder('Selecteer een categorie...')
      .addOptions(
        currentPage.map(category => ({
          label: category.label,
          description: category.description,
          value: category.id,
          emoji: category.emoji,
        }))
      );

    // Create pagination buttons
    const paginationButtons = [];
    
    if (page > 0) {
      paginationButtons.push(
        new ButtonBuilder()
          .setCustomId(`eco_page_${page - 1}`)
          .setLabel('Vorige')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );
    }
    
    if (page < totalPages - 1) {
      paginationButtons.push(
        new ButtonBuilder()
          .setCustomId(`eco_page_${page + 1}`)
          .setLabel('Volgende')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('➡️')
      );
    }

    const row1 = new ActionRowBuilder().addComponents(categorySelect);
    const row2 = new ActionRowBuilder().addComponents(paginationButtons);

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('⚙️ Economy Instellingen')
      .setDescription('Selecteer een categorie uit het menu hieronder om te bewerken.')
      .setFooter({ text: `Pagina ${page + 1} van ${totalPages}` });

    const components = [row1];
    if (paginationButtons.length > 0) components.push(row2);

    const replyOptions = { embeds: [embed], components, ephemeral: true };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  }

  // Navigate to a specific page
  async navigateToPage(interaction, page, settings) {
    const session = this.getUserSession(interaction.user.id);
    
    // Add current page to breadcrumb if not going back
    if (session.currentPage !== 'welcome') {
      session.breadcrumb.push(session.currentPage);
    }
    
    session.currentPage = page;
    
    const { embed, components } = await this.buildPage(page, settings, interaction.guild.id);
    
    await interaction.editReply({ embeds: [embed], components });
  }

  // Navigate back using breadcrumb
  async navigateBack(interaction, settings) {
    const session = this.getUserSession(interaction.user.id);
    
    const previousPage = session.breadcrumb.pop() || 'main';
    session.currentPage = previousPage;
    
    const { embed, components } = await this.buildPage(previousPage, settings, interaction.guild.id);
    
    await interaction.editReply({ embeds: [embed], components });
  }

  // Build the welcome screen
  buildWelcomeScreen() {
    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🎮 Economy Configuratie Wizard')
      .setDescription(
        '**Welkom bij de Economy Setup!**\n\n' +
        '✨ **Wat kan je hier doen?**\n' +
        '• Alle economie-instellingen beheren\n' +
        '• Commands in/uitschakelen\n' +
        '• Jobs en beloningen instellen\n' +
        '• Gok-instellingen aanpassen\n\n' +
        '🚀 **Gebruikstips:**\n' +
        '• Gebruik de breadcrumb navigatie\n' +
        '• Wijzigingen worden direct opgeslagen\n' +
        '• Klik op "Quick Setup" voor snelle configuratie'
      )
      .addFields(
        { name: '⚡ Quick Setup', value: 'Configureer alles in één keer', inline: true },
        { name: '🔧 Advanced', value: 'Gedetailleerde instellingen', inline: true },
        { name: '📊 Overview', value: 'Bekijk huidige status', inline: true }
      )
      .setFooter({ text: 'Kies een optie om te beginnen' });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_quick_setup')
        .setLabel('⚡ Quick Setup')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('eco_page_main')
        .setLabel('🔧 Advanced Setup')
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_page_overview')
        .setLabel('📊 Current Overview')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('eco_cancel')
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger)
    );

    return { embed, components: [row1, row2] };
  }

  // Build different pages based on the page parameter
  async buildPage(page, settings, guildId) {
    const session = this.getUserSession();
    
    switch (page) {
      case 'main':
        return this.buildMainPage(settings, guildId);
      case 'overview':
        return this.buildOverviewPage(settings, guildId);
      case 'work':
        return this.buildWorkPage(settings);
      case 'rob':
        return this.buildRobPage(settings);
      case 'gambling':
        return this.buildGamblingPage(settings);
      case 'inventory':
        return this.buildInventoryPage(settings);
      case 'counting':
        return this.buildCountingPage(settings);
      case 'jobs':
        return this.buildJobsPage(settings, guildId);
      default:
        return this.buildMainPage(settings, guildId);
    }
  }

  // Build main navigation page
  async buildMainPage(settings, guildId) {
    const jobsCount = await this.getJobsCount(guildId);
    
    const embed = new EmbedBuilder()
      .setColor('#00b894')
      .setTitle('🎛️ Economy Control Panel')
      .setDescription('**Selecteer een categorie om in te stellen:**')
      .addFields(
        {
          name: '💼 Work & Jobs', 
          value: `Cooldown, gating, jobs (${jobsCount} configured)\n*Click to manage work settings*`, 
          inline: false 
        },
        {
          name: '🕵️ Rob & Crime', 
          value: `Status: ${settings.robEnabled ? '✅' : '❌'} | Bank: ${settings.robBankEnabled ? '✅' : '❌'}\n*Configure robbery settings*`, 
          inline: false 
        },
        {
          name: '🎲 Gambling', 
          value: `Games: ${this.countEnabledGames(settings)} enabled\n*Setup casino games*`, 
          inline: false 
        },
        {
          name: '📦 Inventory & Shop', 
          value: `Status: ${settings.inventoryEnabled ? '✅' : '❌'}\n*Manage items and shop*`, 
          inline: false 
        },
        {
          name: '🔢 Counting', 
          value: `Rewards: ${settings.countingRewardEnabled ? '✅' : '❌'}\n*Configure counting rewards*`, 
          inline: false 
        }
      )
      .setFooter({ text: 'Use the buttons below to navigate' });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_page_work')
        .setLabel('💼 Work & Jobs')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('eco_page_rob')
        .setLabel('🕵️ Rob & Crime')
        .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_page_gambling')
        .setLabel('🎲 Gambling')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('eco_page_inventory')
        .setLabel('📦 Inventory & Shop')
        .setStyle(ButtonStyle.Primary)
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_page_counting')
        .setLabel('🔢 Counting')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('eco_page_overview')
        .setLabel('📊 Overview')
        .setStyle(ButtonStyle.Info)
    );

    // Add back button row (without home button on main page)
    const backRow = this.buildBackRow(false);
    
    return { 
      embed, 
      components: [row1, row2, row3, backRow] 
    };
  }

  // Build overview page showing all current settings
  async buildOverviewPage(settings, guildId) {
    const jobsCount = await this.getJobsCount(guildId);
    const enabledGames = this.countEnabledGames(settings);
    
    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('📊 Current Economy Settings')
      .setDescription('Hier is een overzicht van alle huidige economie-instellingen.')
      .addFields(
        {
          name: '💼 Work & Jobs',
          value: `• Cooldown: ${settings.cooldownMinutes} minuten\n` +
                 `• Multipliers: ${settings.allowMultipliers ? '✅' : '❌'}\n` +
                 `• Aantal banen: ${jobsCount}`,
          inline: true
        },
        {
          name: '🕵️ Rob & Crime',
          value: `• Rob: ${settings.robEnabled ? '✅' : '❌'}\n` +
                 `• Bankroof: ${settings.robBankEnabled ? '✅' : '❌'}\n` +
                 `• Cooldown: ${settings.robCooldownSeconds ? formatDuration(settings.robCooldownSeconds) : 'Niet ingesteld'}`,
          inline: true
        },
        {
          name: '🎲 Gambling',
          value: `• Ingeschakelde spellen: ${enabledGames}\n` +
                 `• Min. inzet: €${settings.minBet || 0}\n` +
                 `• Max. inzet: €${settings.maxBet || 'Geen limiet'}`,
          inline: true
        },
        {
          name: '📦 Inventory & Shop',
          value: `• Inventory: ${settings.inventoryEnabled ? '✅' : '❌'}\n` +
                 `• Shop: ${settings.shopEnabled ? '✅' : '❌'}\n` +
                 `• Aantal items: ${settings.shopItems?.length || 0}`,
          inline: true
        },
        {
          name: '🔢 Counting',
          value: `• Beloningen: ${settings.countingRewardEnabled ? '✅' : '❌'}\n` +
                 `• Beloning: €${settings.countingRewardAmount || 0}\n` +
                 `• Fout boete: €${settings.countingPenaltyAmount || 0}`,
          inline: true
        }
      )
      .setFooter({ text: 'Gebruik de knoppen hieronder om instellingen aan te passen' });

    // Add back button row with consistent styling
    const backRow = this.buildBackRow();
    
    return { 
      embed, 
      components: [backRow] 
    };
  }

  // Build work settings page with improved UX
  buildWorkPage(settings) {
    const embed = new EmbedBuilder()
      .setColor('#0984e3')
      .setTitle('💼 Work & Jobs Configuration')
      .setDescription('Configure work command settings and job management.')
      .addFields(
        {
          name: '⏰ Current Settings',
          value: `**Cooldown:** ${settings.cooldownMinutes} minutes\n**Gating:** ${settings.gateMode}\n**Multipliers:** ${settings.allowMultipliers ? 'Enabled' : 'Disabled'}`,
          inline: false
        },
        {
          name: '🎯 Quick Presets',
          value: 'Click preset buttons for instant configuration',
          inline: false
        }
      );

    const presetsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_quick_preset_casual')
        .setLabel('🌱 Casual (60min)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('eco_quick_preset_active')
        .setLabel('⚡ Active (30min)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('eco_quick_preset_hardcore')
        .setLabel('🔥 Hardcore (15min)')
        .setStyle(ButtonStyle.Danger)
    );

    const settingsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_set_cooldown')
        .setLabel(`⏰ Cooldown (${settings.cooldownMinutes}m)`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('eco_toggle_multipliers')
        .setLabel(`🎯 Multipliers: ${settings.allowMultipliers ? 'ON' : 'OFF'}`)
        .setStyle(settings.allowMultipliers ? ButtonStyle.Success : ButtonStyle.Danger)
    );

    const jobsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_page_jobs')
        .setLabel('🧰 Manage Jobs')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('eco_set_panel_channel')
        .setLabel('📋 Set Panel Channel')
        .setStyle(ButtonStyle.Secondary)
    );

    // Add back button row with consistent styling
    const backRow = this.buildBackRow();

    return { 
      embed, 
      components: [presetsRow, settingsRow, jobsRow, backRow] 
    };
  }

  // Build standardized back navigation
  buildBackRow(showHome = true) {
    const components = [
      new ButtonBuilder()
        .setCustomId('eco_back')
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary)
    ];

    if (showHome) {
      components.push(
        new ButtonBuilder()
          .setCustomId('eco_page_main')
          .setLabel('🏠 Main Menu')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    components.push(
      new ButtonBuilder()
        .setCustomId('eco_close')
        .setLabel('✖️ Close')
        .setStyle(ButtonStyle.Danger)
    );

    return new ActionRowBuilder().addComponents(...components);
  }

  // Add this method to create a back button row
  getBackButtonRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_back_to_main')
        .setLabel('🔙 Terug naar Hoofdmenu')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  // Update showWorkMenu to include back button
  async showWorkMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#4CAF50')
      .setTitle('🛠️ Werk & Banen Instellingen')
      .setDescription('Beheer de instellingen voor werken en banen in de economie.')
      .addFields(
        { name: 'Cooldown', value: 'Stel de wachttijd tussen werkopdrachten in', inline: true },
        { name: 'Banen', value: 'Beheer beschikbare banen en hun beloningen', inline: true },
        { name: 'Niveaus', value: 'Stel niveauvereisten in voor banen', inline: true }
      );

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_work_cooldown')
        .setLabel('Cooldown Instellen')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('eco_manage_jobs')
        .setLabel('Banen Beheren')
        .setStyle(ButtonStyle.Secondary)
    );

    const backButton = this.getBackButtonRow();
    await interaction.update({ embeds: [embed], components: [row1, backButton] });
  }

  // Update showCurrencyMenu to include back button
  async showCurrencyMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#FFC107')
      .setTitle('💰 Valuta & Prijzen')
      .setDescription('Beheer de valuta en prijzen in de economie.')
      .addFields(
        { name: 'Valuta Naam', value: 'Verander de naam van de valuta', inline: true },
        { name: 'Startbedrag', value: 'Stel het startbedrag in voor nieuwe leden', inline: true },
        { name: 'Prijzen', value: 'Beheer prijzen van items', inline: true }
      );

    const backButton = this.getBackButtonRow();
    await interaction.update({ embeds: [embed], components: [backButton] });
  }

  // Update showBankMenu to include back button
  async showBankMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#2196F3')
      .setTitle('🏦 Bank Instellingen')
      .setDescription('Beheer de bankinstellingen van de server.')
      .addFields(
        { name: 'Rente', value: 'Stel het rentepercentage in', inline: true },
        { name: 'Maximale Storting', value: 'Stel limieten in voor stortingen', inline: true },
        { name: 'Transactiekosten', value: 'Beheer kosten voor overschrijvingen', inline: true }
      );

    const backButton = this.getBackButtonRow();
    await interaction.update({ embeds: [embed], components: [backButton] });
  }

  // Update showShopMenu to include back button
  async showShopMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#9C27B0')
      .setTitle('🛍️ Winkel Beheer')
      .setDescription('Beheer de items in de winkel.')
      .addFields(
        { name: 'Items Toevoegen', value: 'Voeg nieuwe items toe aan de winkel', inline: true },
        { name: 'Items Beheren', value: 'Bewerk of verwijder bestaande items', inline: true },
        { name: 'Categorieën', value: 'Beheer winkelcategorieën', inline: true }
      );

    const backButton = this.getBackButtonRow();
    await interaction.update({ embeds: [embed], components: [backButton] });
  }

  // Update showRobberyMenu to include back button
  async showRobberyMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#F44336')
      .setTitle('🏴‍☠️ Overval Instellingen')
      .setDescription('Beheer de overval-instellingen van de server.')
      .addFields(
        { name: 'Succeskans', value: 'Stel de basiskans in voor een succesvolle overval', inline: true },
        { name: 'Cooldown', value: 'Stel de wachttijd in tussen overvallen', inline: true },
        { name: 'Boetes', value: 'Beheer boetes voor mislukte overvallen', inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_robbery_settings')
        .setLabel('Instellingen')
        .setStyle(ButtonStyle.Danger)
    );

    const backButton = this.getBackButtonRow();
    await interaction.update({ embeds: [embed], components: [row, backButton] });
  }

  // Handle toggle actions
  async handleToggle(interaction, setting, settings) {
    const guildId = interaction.guild.id;
    const updates = {};
    let newValue;

    switch (setting) {
      case 'rob':
        newValue = !settings.robEnabled;
        updates.rob_enabled = newValue ? 1 : 0;
        break;
      case 'robbank':
        newValue = !settings.robBankEnabled;
        updates.rob_bank_enabled = newValue ? 1 : 0;
        break;
      case 'multipliers':
        newValue = !settings.allowMultipliers;
        updates.eco_work_allow_multipliers = newValue ? 1 : 0;
        break;
      // Add more toggle cases...
    }

    if (Object.keys(updates).length > 0) {
      await this.updateGuildSettings(guildId, updates);
      
      // Show success message briefly, then return to current page
      await interaction.reply({ 
        content: `✅ ${setting} is now ${newValue ? 'enabled' : 'disabled'}!`, 
        ephemeral: true 
      });
      
      // Refresh the current page after a brief delay
      setTimeout(() => {
        const session = this.getUserSession(interaction.user.id);
        const newSettings = this.getGuildEcoSettings(guildId);
        this.buildPage(session.currentPage, newSettings, guildId).then(({ embed, components }) => {
          interaction.editReply({ embeds: [embed], components });
        });
      }, 1500);
    }
  }

  // Handle quick actions
  async handleQuickAction(interaction, params, settings) {
    const [action] = params;
    const guildId = interaction.guild.id;

    switch (action) {
      case 'setup':
        return this.showQuickSetupModal(interaction);
      case 'enable':
        if (params[1] === 'all') {
          return this.enableAllFeatures(interaction, guildId);
        }
        break;
      case 'preset':
        return this.applyPreset(interaction, params[1], guildId);
    }
  }

  // Quick setup modal
  async showQuickSetupModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('eco_quick_setup_modal')
      .setTitle('⚡ Quick Economy Setup');

    const cooldownInput = new TextInputBuilder()
      .setCustomId('cooldown')
      .setLabel('Work Cooldown (minutes)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('60')
      .setValue('60')
      .setRequired(true);

    const gamblingInput = new TextInputBuilder()
      .setCustomId('gambling')
      .setLabel('Enable Gambling? (yes/no)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('yes')
      .setValue('yes')
      .setRequired(true);

    const robInput = new TextInputBuilder()
      .setCustomId('rob')
      .setLabel('Enable Rob Commands? (yes/no)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('no')
      .setValue('no')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(cooldownInput),
      new ActionRowBuilder().addComponents(gamblingInput),
      new ActionRowBuilder().addComponents(robInput)
    );

    await interaction.showModal(modal);
  }

  // Handle rob settings modal submission
  async handleRobSettingsModal(interaction) {
    try {
      // Defer the reply first
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ ephemeral: true });
      }

      const guildId = interaction.guild.id;
      const fields = interaction.fields;
      
      // Extract values from the modal
      const robEnabled = fields.getTextInputValue('robEnabled')?.toLowerCase() === 'true';
      const robCooldown = parseInt(fields.getTextInputValue('robCooldown') || '3600');
      const robSuccessRate = parseFloat(fields.getTextInputValue('robSuccessRate') || '0.6');
      const robJailTime = parseInt(fields.getTextInputValue('robJailTime') || '1800');
      const robMinAmount = parseInt(fields.getTextInputValue('robMinAmount') || '100');
      const robMaxAmount = parseInt(fields.getTextInputValue('robMaxAmount') || '1000');
      const bankRobberyEnabled = fields.getTextInputValue('bankRobberyEnabled')?.toLowerCase() === 'true';
      const bankRobberyCooldown = parseInt(fields.getTextInputValue('bankRobberyCooldown') || '86400');
      const bankRobberySuccessRate = parseFloat(fields.getTextInputValue('bankRobberySuccessRate') || '0.3');
      const bankRobberyJailTime = parseInt(fields.getTextInputValue('bankRobberyJailTime') || '7200');
      const bankRobberyMinAmount = parseInt(fields.getTextInputValue('bankRobberyMinAmount') || '1000');
      const bankRobberyMaxAmount = parseInt(fields.getTextInputValue('bankRobberyMaxAmount') || '10000');

      // Validate inputs
      if (isNaN(robCooldown) || isNaN(robSuccessRate) || isNaN(robJailTime) || 
          isNaN(robMinAmount) || isNaN(robMaxAmount) || isNaN(bankRobberyCooldown) || 
          isNaN(bankRobberySuccessRate) || isNaN(bankRobberyJailTime) ||
          isNaN(bankRobberyMinAmount) || isNaN(bankRobberyMaxAmount)) {
        return await interaction.editReply({
          content: '❌ Ongeldige invoer. Zorg ervoor dat je geldige getallen invult.',
          ephemeral: true
        });
      }

      // Update the database
      await this.updateGuildSettings(guildId, {
        rob_enabled: robEnabled ? 1 : 0,
        rob_cooldown_seconds: Math.max(60, Math.min(robCooldown, 604800)), // 1 min to 1 week
        rob_success_rate: Math.max(0.01, Math.min(robSuccessRate, 1)), // 1% to 100%
        rob_jail_time_seconds: Math.max(60, Math.min(robJailTime, 2592000)), // 1 min to 30 days
        rob_min_amount: Math.max(0, robMinAmount),
        rob_max_amount: Math.max(robMinAmount, robMaxAmount),
        bank_robbery_enabled: bankRobberyEnabled ? 1 : 0,
        bank_robbery_cooldown_seconds: Math.max(3600, Math.min(bankRobberyCooldown, 2592000)), // 1 hour to 30 days
        bank_robbery_success_rate: Math.max(0.01, Math.min(bankRobberySuccessRate, 1)), // 1% to 100%
        bank_robbery_jail_time_seconds: Math.max(300, Math.min(bankRobberyJailTime, 2592000)), // 5 min to 30 days
        bank_robbery_min_amount: Math.max(0, bankRobberyMinAmount),
        bank_robbery_max_amount: Math.max(bankRobberyMinAmount, bankRobberyMaxAmount)
      });

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('✅ Rob Instellingen Bijgewerkt')
        .setDescription('De rob-instellingen zijn succesvol bijgewerkt!')
        .addFields(
          { 
            name: '🔫 Normale Berovingen', 
            value: `**Status:** ${robEnabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld'}\n` +
                   `**Cooldown:** ${formatDuration(robCooldown)}\n` +
                   `**Succeskans:** ${(robSuccessRate * 100).toFixed(1)}%\n` +
                   `**Gevangenisstraf:** ${formatDuration(robJailTime)}\n` +
                   `**Min/Max bedrag:** €${robMinAmount.toLocaleString()} - €${robMaxAmount.toLocaleString()}`,
            inline: true
          },
          {
            name: '🏦 Bankovervallen',
            value: `**Status:** ${bankRobberyEnabled ? '✅ Ingeschakeld' : '❌ Uitgeschakeld'}\n` +
                   `**Cooldown:** ${formatDuration(bankRobberyCooldown)}\n` +
                   `**Succeskans:** ${(bankRobberySuccessRate * 100).toFixed(1)}%\n` +
                   `**Gevangenisstraf:** ${formatDuration(bankRobberyJailTime)}\n` +
                   `**Min/Max bedrag:** €${bankRobberyMinAmount.toLocaleString()} - €${bankRobberyMaxAmount.toLocaleString()}`,
            inline: true
          }
        )
        .setFooter({ text: 'Gebruik /config economie om meer instellingen aan te passen' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error handling rob settings modal:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('❌ Fout')
        .setDescription('Er is een fout opgetreden bij het verwerken van de instellingen. Probeer het later opnieuw.')
        .setFooter({ text: 'Neem contact op met een beheerder als dit probleem zich blijft voordoen' })
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }

  // Show work menu
  async showWorkMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#4CAF50')
      .setTitle('🛠️ Werk & Banen Instellingen')
      .setDescription('Beheer de instellingen voor werken en banen in de economie.')
      .addFields(
        { name: 'Cooldown', value: 'Stel de wachttijd tussen werkopdrachten in', inline: true },
        { name: 'Banen', value: 'Beheer beschikbare banen en hun beloningen', inline: true },
        { name: 'Niveaus', value: 'Stel niveauvereisten in voor banen', inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_work_cooldown')
        .setLabel('Cooldown Instellen')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('eco_manage_jobs')
        .setLabel('Banen Beheren')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({ embeds: [embed], components: [row] });
  }

  // Show currency menu
  async showCurrencyMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#FFC107')
      .setTitle('💰 Valuta & Prijzen')
      .setDescription('Beheer de valuta en prijzen in de economie.')
      .addFields(
        { name: 'Valuta Naam', value: 'Verander de naam van de valuta', inline: true },
        { name: 'Startbedrag', value: 'Stel het startbedrag in voor nieuwe leden', inline: true },
        { name: 'Prijzen', value: 'Beheer prijzen van items', inline: true }
      );

    await interaction.update({ embeds: [embed] });
  }

  // Show bank menu
  async showBankMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#2196F3')
      .setTitle('🏦 Bank Instellingen')
      .setDescription('Beheer de bankinstellingen van de server.')
      .addFields(
        { name: 'Rente', value: 'Stel het rentepercentage in', inline: true },
        { name: 'Maximale Storting', value: 'Stel limieten in voor stortingen', inline: true },
        { name: 'Transactiekosten', value: 'Beheer kosten voor overschrijvingen', inline: true }
      );

    await interaction.update({ embeds: [embed] });
  }

  // Show shop menu
  async showShopMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#9C27B0')
      .setTitle('🛍️ Winkel Beheer')
      .setDescription('Beheer de items in de winkel.')
      .addFields(
        { name: 'Items Toevoegen', value: 'Voeg nieuwe items toe aan de winkel', inline: true },
        { name: 'Items Beheren', value: 'Bewerk of verwijder bestaande items', inline: true },
        { name: 'Categorieën', value: 'Beheer winkelcategorieën', inline: true }
      );

    await interaction.update({ embeds: [embed] });
  }

  // Show robbery menu
  async showRobberyMenu(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#F44336')
      .setTitle('🏴‍☠️ Overval Instellingen')
      .setDescription('Beheer de overval-instellingen van de server.')
      .addFields(
        { name: 'Succeskans', value: 'Stel de basiskans in voor een succesvolle overval', inline: true },
        { name: 'Cooldown', value: 'Stel de wachttijd in tussen overvallen', inline: true },
        { name: 'Boetes', value: 'Beheer boetes voor mislukte overvallen', inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eco_robbery_settings')
        .setLabel('Instellingen')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ embeds: [embed], components: [row] });
  }

  // Helper methods
  countEnabledGames(settings) {
    let count = 0;
    if (settings.rouletteEnabled) count++;
    if (settings.slotEnabled) count++;
    if (settings.pokerEnabled) count++;
    if (settings.bjEnabled) count++;
    return count;
  }

  async getJobsCount(guildId) {
    try {
      const row = this.db.prepare('SELECT COUNT(*) AS c FROM jobs WHERE guild_id = ?').get(guildId);
      return row?.c ?? 0;
    } catch (error) {
      console.error('Error getting jobs count:', error);
      return 0;
    }
  }

  async updateGuildSettings(guildId, updates) {
    const columns = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    
    const query = `
      INSERT INTO guild_config (guild_id, ${columns.join(', ')}) 
      VALUES (?, ${values.map(() => '?').join(', ')})
      ON CONFLICT(guild_id) DO UPDATE SET ${setClause}
    `;
    
    this.db.prepare(query).run(guildId, ...values, ...values);
  }

  async sendError(interaction, message) {
    const errorEmbed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('❌ Error')
      .setDescription(message)
      .setFooter({ text: 'Please try again or contact support' });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], components: [], ephemeral: true });
    }
  }

  async closePage(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#95a5a6')
      .setTitle('👋 Economy Wizard Closed')
      .setDescription('Configuration wizard has been closed.\nYou can reopen it anytime with `/config economie`')
      .setFooter({ text: 'All changes have been saved automatically' });

    // Clean up user session
    this.userSessions.delete(interaction.user.id);

    await interaction.editReply({ embeds: [embed], components: [] });
  }

  // Get guild economy settings
  async getGuildEcoSettings(guildId) {
    const db = (await import('../utils/database.js')).default;
  
    try {
      // Get the guild config from the database
      const config = await db.get(
        `SELECT * FROM guild_config WHERE guild_id = ?`,
        [guildId]
      );

      if (!config) {
        // Return default settings if no config exists
        return {
          enabled: true,
          currency: 'coins',
          // Rob settings
          rob_enabled: true,
          rob_cooldown: 3600, // 1 hour in seconds
          rob_success_rate: 0.6, // 60% success rate
          rob_jail_time: 1800, // 30 minutes in seconds
          rob_min_amount: 100,
          rob_max_amount: 1000,
          // Bank robbery settings
          bank_robbery_enabled: true,
          bank_robbery_cooldown: 86400, // 24 hours in seconds
          bank_robbery_success_rate: 0.3, // 30% success rate
          bank_robbery_jail_time: 7200, // 2 hours in seconds
          bank_robbery_min_amount: 1000,
          bank_robbery_max_amount: 10000,
        };
      }

      // Return the config with default values for any missing settings
      return {
        enabled: config.economy_enabled !== 0,
        currency: config.currency || 'coins',
        // Rob settings
        rob_enabled: config.rob_enabled !== 0,
        rob_cooldown: config.rob_cooldown_seconds || 3600,
        rob_success_rate: config.rob_success_rate || 0.6,
        rob_jail_time: config.rob_jail_time_seconds || 1800,
        rob_min_amount: config.rob_min_amount || 100,
        rob_max_amount: config.rob_max_amount || 1000,
        // Bank robbery settings
        bank_robbery_enabled: config.bank_robbery_enabled !== 0,
        bank_robbery_cooldown: config.bank_robbery_cooldown_seconds || 86400,
        bank_robbery_success_rate: config.bank_robbery_success_rate || 0.3,
        bank_robbery_jail_time: config.bank_robbery_jail_time_seconds || 7200,
        bank_robbery_min_amount: config.bank_robbery_min_amount || 1000,
        bank_robbery_max_amount: config.bank_robbery_max_amount || 10000,
      };
    } catch (error) {
      console.error('Error getting guild economy settings:', error);
      // Return default settings on error
      return {
        enabled: true,
        currency: 'coins',
        rob_enabled: true,
        rob_cooldown: 3600,
        rob_success_rate: 0.6,
        rob_jail_time: 1800,
        rob_min_amount: 100,
        rob_max_amount: 1000,
        bank_robbery_enabled: true,
        bank_robbery_cooldown: 86400,
        bank_robbery_success_rate: 0.3,
        bank_robbery_jail_time: 7200,
        bank_robbery_min_amount: 1000,
        bank_robbery_max_amount: 10000,
      };
    }
  }
}

// Helper function to format duration in a human-readable format
function formatDuration(seconds) {
  if (!seconds) return '0 seconden';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}u`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if ((secs > 0 || parts.length === 0) && days === 0) parts.push(`${secs}s`);
  
  return parts.join(' ') || '0s';
}

// Export the class
export { EconomyWizard };

// Export methods as standalone functions
export const handleEconomyWizardComponent = EconomyWizard.prototype.handleEconomyWizardComponent;
export const getGuildEcoSettings = EconomyWizard.prototype.getGuildEcoSettings;
export const handleRobSettingsModal = EconomyWizard.prototype.handleRobSettingsModal;