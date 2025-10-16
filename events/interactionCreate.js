// events/interactionCreate.js - Enhanced with better button handling
import { Events, EmbedBuilder, StringSelectMenuBuilder, PermissionFlagsBits, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle } from 'discord.js';
import { handleEconomyWizardComponent } from '../commands/configuratie/config.js';
import { handleAIWizardComponent } from '../commands/configuratie/aiwizard.js';
import { handleBirthdayWizardComponent } from '../commands/configuratie/birthdayWizard.js';
import { handleWelcomeWizardComponent } from '../commands/configuratie/welcomeWizard.js';
import { handleWorkSelectMenu, handleWorkCooldownInteraction } from '../commands/economie/work.js';
import { handleShopInteraction } from '../commands/economie/shop.js';
import { handleButton as handleTicketConfigButton, handleTicketWizardComponent } from '../commands/tickets/index.js';
import { handleTicketButton } from '../commands/tickets/ticketButtonHandler.js';
import { getTicketConfig, buildTicketPanel, createTicketCategory, handleCategoryManagement, createTicketChannel, getTicketControlComponents } from '../commands/tickets/ticketUtils.js';

// Simple deduplication set to avoid processing the same interaction multiple times
const processedInteractions = new Set();

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            // Deduplicate by interaction ID
            if (processedInteractions.has(interaction.id)) {
                return;
            }
            processedInteractions.add(interaction.id);
            // Auto-cleanup to avoid unbounded growth
            setTimeout(() => processedInteractions.delete(interaction.id), 5 * 60 * 1000);

            if (interaction.isChatInputCommand()) {
                await handleChatInputCommand(interaction);
            } else if (interaction.isButton()) {
                await handleButtonInteraction(interaction);
            } else if (interaction.isModalSubmit()) {
                await handleModalSubmission(interaction);
            } else if (interaction.isStringSelectMenu()) {
                await handleStringSelectMenu(interaction);
            } else if (typeof interaction.isChannelSelectMenu === 'function' && interaction.isChannelSelectMenu()) {
                await handleChannelSelectMenu(interaction);
            } else if (typeof interaction.isRoleSelectMenu === 'function' && interaction.isRoleSelectMenu()) {
                await handleRoleSelectMenu(interaction);
            }
        } catch (error) {
            console.error('❌ Error handling interaction:', error);
            await sendGenericError(interaction, 'Er ging iets mis bij het verwerken van deze interactie.');
        }
    }
};

// Helper function to handle chat input commands
async function handleChatInputCommand(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Error executing command ${interaction.commandName}:`, error);

        // If interaction is unknown (10062) or already acknowledged (40060), do not attempt to reply
        if (error && (error.code === 10062 || error.code === 40060)) {
            return;
        }

        // Only try to respond if we haven't already
        if (!interaction.replied && !interaction.deferred) {
            try {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Command Error')
                    .setDescription('There was an error while executing this command!')
                    .setTimestamp();

                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
    }
}

// Helper function to handle button interactions
async function handleButtonInteraction(interaction) {
    const { customId } = interaction;
    console.log(`🎛️ Processing button interaction: ${customId}`);
    
    try {
        // Handle ticket configuration buttons
        if (customId.startsWith('ticket_config_') || customId.startsWith('ticket_category_') || customId.startsWith('ticket_setmax_')) {
            return handleTicketConfigButton(interaction, interaction.client.db);
        }
        
        // Handle ticket creation buttons
        if (customId === 'ticket_create' || customId === 'create_ticket') {
            return handleTicketButton(interaction, interaction.client.db);
        }
        
        // Handle work claim button
        if (customId === 'work_claim') {
            return handleWorkCooldownInteraction(interaction);
        }

        // Handle blackjack game buttons
        if (customId.startsWith('blackjack_hit_') || customId.startsWith('blackjack_stand_')) {
            const { handleBlackjackInteraction } = await import('../commands/fun/jackblack.js');
            return handleBlackjackInteraction(interaction);
        }

        // Handle ticket buttons (from the database.js ticket system)
        if (customId.startsWith('ticket_button_')) {
            return handleTicketButton(interaction, interaction.client.db);
        }

        // Handle ticket control buttons (close, claim, etc.)
        if (customId === 'ticket_close' || customId === 'ticket_claim' || customId === 'ticket_confirm_close' || customId === 'ticket_cancel_close' || customId === 'ticket_transcript') {
            return handleTicketButton(interaction, interaction.client.db);
        }

        // Handle ticket wizard components
        if (customId && customId.startsWith('ticket_wizard_')) {
            return handleTicketWizardComponent(interaction);
        }

        // Handle economy wizard buttons
        if (customId && (customId.startsWith('eco_wizard_') || customId.startsWith('eco_open_') || customId.startsWith('eco_jobs_'))) {
            return handleEconomyWizardComponent(interaction);
        }

        // Handle AI wizard buttons
        if (customId && customId.startsWith('ai_wizard_')) {
            return handleAIWizardComponent(interaction);
        }

        // Handle welcome wizard buttons
        if (customId && customId.startsWith('welcome_wizard_')) {
            return handleWelcomeWizardComponent(interaction);
        }

        // Handle birthday wizard buttons
        if (customId && customId.startsWith('birthday_wizard_')) {
            return handleBirthdayWizardComponent(interaction);
        }

        // Handle giveaway join button
        if (customId === 'giveaway_join') {
            const { handleGiveawayJoin } = await import('../commands/fun/giveaway.js');
            return handleGiveawayJoin(interaction, interaction.client.db);
        }

        // Handle giveaway participants button
        if (customId === 'giveaway_participants') {
            const { handleGiveawayParticipants } = await import('../commands/fun/giveaway.js');
            return handleGiveawayParticipants(interaction, interaction.client.db);
        }

        // Default case for unhandled buttons
        console.log(`⚠️ Unhandled button interaction: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: 'This button does nothing yet!', 
                ephemeral: true 
            });
        }
    } catch (error) {
        console.error(`❌ Error in button interaction ${customId}:`, error.message);
        
        // Handle DiscordAPIError specifically for unknown interactions
        if (error.code === 10062) {
            console.log('⚠️ Interaction expired or unknown - this is normal for timed out interactions');
        } else {
            try {
                await sendGenericError(interaction, 'Er is een fout opgetreden bij het verwerken van deze interactie.');
            } catch (sendError) {
                console.error('❌ Failed to send error response:', sendError);
            }
        }
    }
}

// Helper function to handle modal submissions
async function handleModalSubmission(interaction) {
    const { customId } = interaction;
    
    try {
        // Handle ticket creation modal
        if (customId.startsWith('ticket_create_modal:')) {
            const db = interaction.client.db;
            const categoryId = parseInt(customId.split(':')[1]);
            const category = db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(categoryId);
            if (!category) {
                return interaction.reply({ content: 'Deze ticket categorie bestaat niet meer.', ephemeral: true });
            }

            const subject = interaction.fields.getTextInputValue('ticket_subject');
            const description = interaction.fields.getTextInputValue('ticket_description') || '';

            // Create the channel and DB record
            const { channel: ticketChannel, ticketId } = await createTicketChannel(interaction.guild, category, interaction.user.id, db);

            // Get the current ticket counter for display
            const { getTicketCounter } = await import('../commands/tickets/ticketUtils.js');
            const currentTicketNumber = getTicketCounter(db, interaction.guild.id);

            // Build welcome embed
            const welcome = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🎫 ${subject}`)
                .setDescription(`${description || category.description || 'Een medewerker zal zo snel mogelijk je helpen.'}`)
                .addFields(
                    { name: 'Ticket Nummer', value: `#${currentTicketNumber.toString().padStart(3, '0')}`, inline: true },
                    { name: 'Categorie', value: category.name, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }
                )
                .setFooter({ text: `Ticket aangemaakt op` })
                .setTimestamp();

            const controls = getTicketControlComponents();

            // Get the ticket config to check for global support role
            const config = getTicketConfig(db, interaction.guild.id);
            const staffMentions = [];

            // Add category-specific support roles
            if (category.support_roles) {
                const categoryRoles = JSON.parse(category.support_roles);
                staffMentions.push(...categoryRoles.map(r => `<@&${r}>`));
            }

            // Add global support role if set
            if (config.support_role_id) {
                staffMentions.push(`<@&${config.support_role_id}>`);
            }

            await ticketChannel.send({
                content: `<@${interaction.user.id}> ${staffMentions.join(' ')}`.trim(),
                embeds: [welcome],
                components: controls
            });

            return interaction.reply({ content: `✅ Je ticket is aangemaakt: ${ticketChannel}`, ephemeral: true });
        }

        // Handle set max tickets modal
        if (customId === 'ticket_set_max_modal') {
            const db = interaction.client.db;
            const raw = interaction.fields.getTextInputValue('max_value').trim();
            let value = Number(raw);
            if (!Number.isFinite(value)) {
                return interaction.reply({ content: 'Voer een geldig getal in (of -1 voor onbeperkt).', ephemeral: true });
            }
            if (value < -1) value = -1;
            const { setMaxTicketsPerUser } = await import('../commands/tickets/ticketUtils.js');
            setMaxTicketsPerUser(db, interaction.guild.id, value);
            return interaction.reply({ content: `✅ Instelling opgeslagen: max ${value < 0 ? 'onbeperkt' : value} tickets per gebruiker.`, ephemeral: true });
        }

        // Handle ticket category add modal
        if (customId === 'ticket_category_add') {
            const db = interaction.client.db;
            const name = interaction.fields.getTextInputValue('category_name');
            const description = interaction.fields.getTextInputValue('category_description');
            const emoji = interaction.fields.getTextInputValue('category_emoji') || '📋';

            // Create in DB
            await createTicketCategory(db, interaction.guild.id, name, description, emoji, null, []);

            // Defer the update to refresh the category management view
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            // Refresh the category management view to show the new category
            const { handleCategoryManagement } = await import('../commands/tickets/ticketUtils.js');
            await handleCategoryManagement(interaction, db);

            console.log('✅ Category added successfully');
        }

        // Handle ticket wizard modal
        if (customId === 'ticket_wizard_modal') {
            return handleTicketWizardComponent(interaction);
        }

        // Handle economy wizard modals
        if (customId && customId.startsWith('eco_') && customId.endsWith('_modal')) {
            return handleEconomyWizardComponent(interaction);
        }

        // Handle welcome wizard modals
        if (customId && customId.startsWith('welcome_wizard_modal_')) {
            return handleWelcomeWizardComponent(interaction);
        }
        
    } catch (error) {
        console.error(`❌ Error in modal submission ${customId}:`, error);
        
        // Handle DiscordAPIError specifically for unknown interactions
        if (error.code === 10062) {
            console.log('⚠️ Interaction expired or unknown - this is normal for timed out interactions');
        } else {
            try {
                await sendGenericError(interaction, 'Er is een fout opgetreden bij het verwerken van deze modal.');
            } catch (sendError) {
                console.error('❌ Failed to send error response:', sendError);
            }
        }
    }
}

// Helper function to handle string select menu interactions
async function handleStringSelectMenu(interaction) {
    const { customId } = interaction;

    try {
        // Handle ticket category selection from panel (dropdown)
        if (customId === 'ticket_create') {
            return handleTicketButton(interaction, interaction.client.db);
        }

        // Handle ticket category selection for Discord category assignment
        if (customId === 'ticket_category_select_for_discord_category') {
            const ticketCategoryId = interaction.values[0];
            const db = interaction.client.db;
            const category = db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(ticketCategoryId);

            if (!category) {
                return interaction.reply({
                    content: 'Deze ticket categorie bestaat niet meer.',
                    ephemeral: true
                });
            }

            const channelSelect = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(`ticket_discord_category_select:${ticketCategoryId}`)
                    .setPlaceholder('Kies een Discord categorie…')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addChannelTypes(ChannelType.GuildCategory)
            );

            const backButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_config_categories')
                    .setLabel('Terug')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`📁 Discord Categorie voor ${category.name}`)
                .setDescription('Selecteer een Discord categorie waar tickets van deze categorie moeten worden aangemaakt.');

            await interaction.reply({
                embeds: [embed],
                components: [channelSelect, backButton],
                ephemeral: true
            });
            return;
        }
        // Handle ticket category removal
        if (customId === 'ticket_category_remove') {
            const categoryId = interaction.values[0];
            const db = interaction.client.db;
            
            // Check if the category exists
            const category = db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(categoryId);
            
            if (!category) {
                return interaction.reply({
                    content: 'Deze categorie bestaat niet meer.',
                    ephemeral: true
                });
            }
            
            // Delete the category
            db.prepare('DELETE FROM ticket_categories WHERE id = ?').run(categoryId);
            
            // Update the panel message if it exists
            try {
                const config = getTicketConfig(db, interaction.guild.id);
                const panel = buildTicketPanel(interaction.guild, config);
                
                // Find the panel message and update it
                const messages = await interaction.channel.messages.fetch({ limit: 10 });
                const panelMessage = messages.find(msg => 
                    msg.embeds.length > 0 && 
                    msg.embeds[0].title === '🎫 Ticket Systeem' &&
                    msg.components.length > 0
                );

                if (panelMessage) {
                    await panelMessage.edit(panel);
                }
            } catch (error) {
                console.error('Error updating panel:', error);
            }
            
            return interaction.update({
                content: `✅ De categorie "${category.name}" is succesvol verwijderd.`,
                embeds: [],
                components: []
            });
        }
        
        // Handle economy wizard string select menus
        if (customId && customId.startsWith('eco_') && (customId.includes('_select') || customId.includes('_jobs'))) {
            return handleEconomyWizardComponent(interaction);
        }
        
    } catch (error) {
        console.error(`❌ Error in select menu interaction ${customId}:`, error);
        
        // Handle DiscordAPIError specifically for unknown interactions
        if (error.code === 10062) {
            console.log('⚠️ Interaction expired or unknown - this is normal for timed out interactions');
        } else {
            try {
                await sendGenericError(interaction, 'Er is een fout opgetreden bij het verwerken van dit menu.');
            } catch (sendError) {
                console.error('❌ Failed to send error response:', sendError);
            }
        }
    }
}

// Helper function to handle channel select menu interactions
async function handleChannelSelectMenu(interaction) {
    const { customId } = interaction;
    
    try {
        if (customId === 'ticket_log_select') {
            const db = interaction.client.db;
            const selectedId = interaction.values[0];
            const { setLogChannel } = await import('../commands/tickets/ticketUtils.js');
            setLogChannel(db, interaction.guild.id, selectedId);
            
            // Acknowledge by deferring the component update and refresh the settings view
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }
            
            // Show brief success feedback
            await interaction.editReply({
                content: `✅ Log kanaal ingesteld op <#${selectedId}>`,
                embeds: [],
                components: []
            });
            
            // Note: Settings view will need to be refreshed manually
            console.log('✅ Log channel updated successfully');
        }

        if (customId.startsWith('ticket_discord_category_select:')) {
            const ticketCategoryId = customId.split(':')[1];
            const discordCategoryId = interaction.values[0];

            const { setTicketCategoryDiscordCategory, handleCategoryManagement } = await import('../commands/tickets/ticketUtils.js');
            setTicketCategoryDiscordCategory(interaction.client.db, ticketCategoryId, discordCategoryId);

            // Get the updated category to show which one was updated
            const category = interaction.client.db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(ticketCategoryId);

            // Defer the update to refresh the category management view
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            // Refresh the category management view to show the updated Discord category
            await handleCategoryManagement(interaction, interaction.client.db);

            console.log('✅ Discord category updated successfully');
        }

        if (customId === 'ticket_panel_channel_select') {
            const db = interaction.client.db;
            const channelId = interaction.values[0];

            // Check permissions
            const channel = interaction.guild.channels.cache.get(channelId);
            const me = interaction.guild.members.me;

            if (!channel.permissionsFor(me).has([
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return interaction.reply({
                    content: '❌ Ik heb geen toestemming om berichten te sturen in dat kanaal.',
                    ephemeral: true
                });
            }

            try {
                const { getTicketConfig, buildTicketPanel } = await import('../commands/tickets/ticketUtils.js');
                const config = getTicketConfig(db, interaction.guild.id);
                const panel = buildTicketPanel(interaction.guild, config);

                await channel.send(panel);

                await interaction.reply({
                    content: `✅ Het ticket paneel is succesvol aangemaakt in ${channel}!`,
                    ephemeral: true
                });

                console.log('✅ Ticket panel created successfully');
            } catch (error) {
                console.error('❌ Error creating ticket panel:', error);
                await interaction.reply({
                    content: '❌ Er is een fout opgetreden bij het aanmaken van het ticket paneel.',
                    ephemeral: true
                });
            }
        }

        // Handle economy wizard channel select menus
        if (customId && customId.startsWith('eco_') && customId.includes('_channel')) {
            return handleEconomyWizardComponent(interaction);
        }

        // Handle welcome wizard channel select menus
        if (customId && customId.startsWith('welcome_wizard_') && (customId.includes('_channel') || customId.includes('_role'))) {
            return handleWelcomeWizardComponent(interaction);
        }

        // Handle birthday wizard channel select menus
        if (customId && customId.startsWith('birthday_wizard_') && (customId.includes('_channel') || customId.includes('_role'))) {
            return handleBirthdayWizardComponent(interaction);
        }

        console.log(`⚠️ Unhandled channel select menu interaction: ${customId}`);
    } catch (error) {
        console.error('❌ Error handling channel select:', error);

        // Handle DiscordAPIError specifically for unknown interactions and already acknowledged
        if (error && (error.code === 10062 || error.code === 40060)) {
            console.log('⚠️ Interaction expired or already acknowledged - this is normal for timed out interactions');
            return; // Exit early, don't try to respond
        }

        // Try to send error message only if interaction is still valid
        try {
            if (interaction.isRepliable && !interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'Er ging iets mis bij het verwerken van deze actie.',
                    ephemeral: true
                });
            } else if (interaction.isRepliable) {
                await interaction.editReply({
                    content: 'Er ging iets mis bij het verwerken van deze actie.',
                    embeds: [],
                    components: []
                });
            }
        } catch (replyError) {
            console.error('❌ Failed to send error response:', replyError);
            // Don't try to respond to avoid infinite loops
        }
    }
}

// Helper function to handle role select menu interactions
async function handleRoleSelectMenu(interaction) {
    const { customId } = interaction;
    
    try {
        if (customId === 'ticket_support_role_select') {
            const db = interaction.client.db;
            const selectedId = interaction.values[0];
            const { setSupportRole } = await import('../commands/tickets/ticketUtils.js');
            setSupportRole(db, interaction.guild.id, selectedId);

            // Acknowledge by deferring the component update and refresh the settings view
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }
            
            // Show brief success feedback
            await interaction.editReply({
                content: `✅ Support rol ingesteld op <@&${selectedId}>`,
                embeds: [],
                components: []
            });

            // Update with new settings after brief delay - but don't reuse the interaction
            setTimeout(async () => {
                try {
                    // Create a new interaction-like object for the settings update
                    const { handleButton } = await import('../commands/tickets/index.js');
                    // We can't reuse the interaction, so we'll just log the update
                    console.log('✅ Support role updated successfully');
                } catch (error) {
                    console.error('Error updating settings view:', error);
                }
            }, 1000);
        }

        // Handle welcome wizard role select menus
        if (customId && customId.startsWith('welcome_wizard_') && customId.includes('_role')) {
            return handleWelcomeWizardComponent(interaction);
        }

        console.log(`⚠️ Unhandled role select menu interaction: ${customId}`);
    } catch (error) {
        console.error('❌ Error handling role select:', error);

        // Handle DiscordAPIError specifically for unknown interactions and already acknowledged
        if (error && (error.code === 10062 || error.code === 40060)) {
            console.log('⚠️ Interaction expired or already acknowledged - this is normal for timed out interactions');
            return; // Exit early, don't try to respond
        }

        // Try to send error message only if interaction is still valid
        try {
            if (interaction.isRepliable && !interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'Er ging iets mis bij het verwerken van deze actie.',
                    ephemeral: true
                });
            } else if (interaction.isRepliable) {
                await interaction.editReply({
                    content: 'Er ging iets mis bij het verwerken van deze actie.',
                    embeds: [],
                    components: []
                });
            }
        } catch (replyError) {
            console.error('❌ Failed to send error response:', replyError);
            // Don't try to respond to avoid infinite loops
        }
    }
}

// Helper function to send generic error messages
async function sendGenericError(interaction, message) {
    const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Fout')
        .setDescription(message)
        .setTimestamp();

    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } else if (interaction.isRepliable()) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        }
    } catch (error) {
        console.error('❌ Failed to send error message:', error);
    }
}