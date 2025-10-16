import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder } from 'discord.js';
import { 
    createTicketTables, 
    getTicketConfig, 
    buildTicketPanel, 
    createTicketCategory, 
    deleteTicketCategory, 
    getTicketCategories,
    showConfigPanel,
    handleCategoryManagement
} from './ticketUtils.js';

// Create the command
const data = new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Beheer het ticketsysteem')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
        subcommand
            .setName('config')
            .setDescription('Configureer het ticketsysteem')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('panel')
            .setDescription('Maak een nieuw ticket paneel aan')
            .addChannelOption(option =>
                option.setName('kanaal')
                    .setDescription('Het kanaal waar het ticket paneel moet komen')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('categorie')
            .setDescription('Beheer ticket categorieën')
            .addStringOption(option =>
                option.setName('actie')
                    .setDescription('Wat wil je doen?')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Toevoegen', value: 'add' },
                        { name: 'Verwijderen', value: 'remove' },
                        { name: 'Lijst', value: 'list' }
                    )
            )
    );

// Handle button interactions
export async function handleButton(interaction, db) {
    const { customId } = interaction;

    // Helper to render settings view
    const renderSettings = () => {
        const cfg = getTicketConfig(db, interaction.guild.id);
        const maxText = cfg.max_tickets_per_user < 0 ? 'Onbeperkt' : String(cfg.max_tickets_per_user);
        const logText = cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : 'Niet ingesteld';
        const supportRoleText = cfg.support_role_id ? `<@&${cfg.support_role_id}>` : 'Niet ingesteld';
        const defaultCategoryText = cfg.category_id ? `<#${cfg.category_id}>` : 'Niet ingesteld';
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Ticket Instellingen')
            .setDescription('Beheer hier algemene instellingen voor tickets.')
            .addFields(
                { name: 'Max. open tickets per gebruiker', value: `Huidig: **${maxText}**`, inline: false },
                { name: 'Log kanaal', value: `Huidig: ${logText}`, inline: false },
                { name: 'Support rol', value: `Huidig: ${supportRoleText}`, inline: false },
                { name: 'Standaard categorie', value: `Huidig: ${defaultCategoryText}`, inline: false }
            )
            .setColor('#5865F2');

        const controls = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_setmax_default').setLabel('Standaard (3)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_setmax_unlimited').setLabel('Onbeperkt').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('ticket_setmax_custom').setLabel('Aangepast…').setStyle(ButtonStyle.Secondary)
        );
        const channelSelect = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('ticket_log_select')
                .setPlaceholder('Kies een log kanaal…')
                .setMinValues(1)
                .setMaxValues(1)
                .addChannelTypes(ChannelType.GuildText)
        );
        const roleSelect = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId('ticket_support_role_select')
                .setPlaceholder('Kies een support rol…')
                .setMinValues(1)
                .setMaxValues(1)
        );
        const categorySelect = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('ticket_default_category_select')
                .setPlaceholder('Kies een standaard categorie…')
                .setMinValues(1)
                .setMaxValues(1)
                .addChannelTypes(ChannelType.GuildCategory)
        );
        const back = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_config_back').setLabel('Terug').setStyle(ButtonStyle.Secondary).setEmoji('⬅️')
        );

        const payload = { embeds: [embed], components: [controls, channelSelect, roleSelect, categorySelect, back] };
        return payload;
    };

    try {
        // Handle immediate responses (no defer needed)
        if (customId === 'ticket_category_add') {
            const modal = new ModalBuilder()
                .setCustomId('ticket_category_add')
                .setTitle('Nieuwe Ticket Categorie');

            const nameInput = new TextInputBuilder()
                .setCustomId('category_name')
                .setLabel('Naam van de categorie')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('category_description')
                .setLabel('Beschrijving')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const emojiInput = new TextInputBuilder()
                .setCustomId('category_emoji')
                .setLabel('Emoji (optioneel)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
            const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
            const thirdActionRow = new ActionRowBuilder().addComponents(emojiInput);

            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
            await interaction.showModal(modal);
            return;
        }

        if (customId === 'ticket_category_set_discord_category') {
            const categories = await getTicketCategories(db, interaction.guild.id);

            if (categories.length === 0) {
                await interaction.reply({
                    content: 'Er zijn geen ticket categorieën om Discord categorieën aan toe te wijzen.',
                    ephemeral: true
                });
                return;
            }

            const options = categories.map(cat => ({
                label: cat.name,
                description: `Stel Discord categorie in voor ${cat.name}`,
                value: cat.id.toString(),
                emoji: cat.emoji || '📌'
            }));

            const selectMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_category_select_for_discord_category')
                    .setPlaceholder('Selecteer een ticket categorie...')
                    .addOptions(options)
            );

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📁 Stel Discord Categorie In')
                .setDescription('Selecteer een ticket categorie waarvoor je een Discord categorie wilt instellen.');

            await interaction.reply({
                embeds: [embed],
                components: [selectMenu],
                ephemeral: true
            });
            return;
        }

        if (customId === 'ticket_category_select_for_discord_category') {
            const ticketCategoryId = interaction.values[0];
            const category = db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(ticketCategoryId);

            if (!category) {
                await interaction.reply({
                    content: 'Deze ticket categorie bestaat niet meer.',
                    ephemeral: true
                });
                return;
            }

            const channelSelect = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(`ticket_discord_category_select:${ticketCategoryId}`)
                    .setPlaceholder('Kies een Discord categorie…')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addChannelTypes(ChannelType.GuildCategory)
            );

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`📁 Discord Categorie voor ${category.name}`)
                .setDescription('Selecteer een Discord categorie waar tickets van deze categorie moeten worden aangemaakt.');

            await interaction.reply({
                embeds: [embed],
                components: [channelSelect],
                ephemeral: true
            });
            return;
        }

        // Defer for remaining operations
        await interaction.deferUpdate();

        if (customId === 'ticket_config_categories') {
            await handleCategoryManagement(interaction, db);
        } else if (customId === 'ticket_config_create_panel') {
            // Show channel selector for placing the ticket panel
            const channelSelect = new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('ticket_panel_channel_select')
                    .setPlaceholder('Selecteer een kanaal voor het ticket paneel...')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addChannelTypes(ChannelType.GuildText)
            );

            const backButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_config_back')
                    .setLabel('Terug')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📍 Plaats Ticket Paneel')
                .setDescription('Selecteer een tekstkanaal waar het ticket paneel geplaatst moet worden.')
                .setFooter({ text: 'Het paneel kan alleen in tekstkanalen geplaatst worden.' });

            await interaction.editReply({
                embeds: [embed],
                components: [channelSelect, backButton]
            });
        } else if (customId === 'ticket_config_settings') {
            const payload = renderSettings(db, interaction.guild.id);
            await interaction.editReply(payload);
        } else if (customId === 'ticket_default_category_select') {
            const { setDefaultCategory } = await import('./ticketUtils.js');
            const categoryId = interaction.values[0];
            setDefaultCategory(db, interaction.guild.id, categoryId);
            await interaction.editReply({
                content: '✅ Standaard categorie ingesteld',
                embeds: [],
                components: []
            });
        } else if (customId === 'ticket_log_select') {
            const { setLogChannel } = await import('./ticketUtils.js');
            const channelId = interaction.values[0];
            setLogChannel(db, interaction.guild.id, channelId);
            await interaction.editReply({
                content: '✅ Log kanaal ingesteld',
                embeds: [],
                components: []
            });
        } else if (customId === 'ticket_support_role_select') {
            const { setSupportRole } = await import('./ticketUtils.js');
            const roleId = interaction.values[0];
            setSupportRole(db, interaction.guild.id, roleId);
            await interaction.editReply({
                content: '✅ Support rol ingesteld',
                embeds: [],
                components: []
            });
        } else if (customId === 'ticket_setmax_custom') {
            const modal = new ModalBuilder().setCustomId('ticket_set_max_modal').setTitle('Max. tickets per gebruiker');
            const input = new TextInputBuilder()
                .setCustomId('max_value')
                .setLabel('Voer een getal in (of -1 voor onbeperkt)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        } else if (customId === 'ticket_set_max_modal') {
            const maxValue = interaction.fields.getTextInputValue('max_value');
            const { setMaxTicketsPerUser } = await import('./ticketUtils.js');
            setMaxTicketsPerUser(db, interaction.guild.id, maxValue);

            await interaction.reply({
                content: `✅ Maximale tickets per gebruiker ingesteld op ${maxValue === '-1' ? 'onbeperkt' : maxValue}`,
                ephemeral: true
            });
        } else if (customId === 'ticket_category_delete') {
            await showDeleteCategoryMenu(interaction, db);
        } else if (customId === 'ticket_reset_counter') {
            const { resetTicketCounter } = await import('./ticketUtils.js');
            resetTicketCounter(db, interaction.guild.id, 0);

            await interaction.reply({
                content: '✅ Ticket teller gereset naar #001',
                ephemeral: true
            });
        } else if (customId === 'ticket_config_back') {
            await showConfigPanel(interaction, db);
            return;
        }
    } catch (error) {
        console.error('Error handling button interaction:', error);

        // Handle DiscordAPIError specifically for unknown interactions and already acknowledged
        if (error && (error.code === 10062 || error.code === 40060)) {
            console.log('⚠️ Interaction expired or already acknowledged - this is normal for timed out interactions');
            return; // Exit early, don't try to respond
        }

        // Try to respond with an error message if possible
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'Er is een fout opgetreden bij het verwerken van je verzoek.',
                    ephemeral: true
                });
            } else if (interaction.isRepliable()) {
                await interaction.editReply({
                    content: 'Er is een fout opgetreden bij het verwerken van je verzoek.',
                    embeds: [],
                    components: []
                });
            }
        } catch (replyError) {
            console.error('Failed to send error response:', replyError);
            // Don't try to respond to the reply error to avoid infinite loops
        }
    }
}

// Settings display function
function renderSettings(db, guildId) {
    const { getTicketConfig, getTicketCounter } = require('./ticketUtils.js');
    const config = getTicketConfig(db, guildId);
    const currentTicketNumber = getTicketCounter(db, guildId);

    const embed = new EmbedBuilder()
        .setTitle('⚙️ Ticket Instellingen')
        .setDescription('Beheer hier alle instellingen voor het ticketsysteem.')
        .setColor(Colors.Blue);

    // Add current settings fields
    embed.addFields([
        {
            name: '📊 Maximale Tickets per Gebruiker',
            value: config.max_tickets_per_user === -1 ? 'Onbeperkt' : config.max_tickets_per_user.toString(),
            inline: true
        },
        {
            name: '📝 Log Kanaal',
            value: config.log_channel_id ? `<#${config.log_channel_id}>` : 'Niet ingesteld',
            inline: true
        },
        {
            name: '👥 Support Rol',
            value: config.support_role_id ? `<@&${config.support_role_id}>` : 'Niet ingesteld',
            inline: true
        },
        {
            name: '📁 Standaard Categorie',
            value: config.category_id ? `<#${config.category_id}>` : 'Niet ingesteld',
            inline: true
        },
        {
            name: '🎫 Huidige Ticket Nummer',
            value: `#${currentTicketNumber.toString().padStart(3, '0')}`,
            inline: true
        },
        {
            name: '📋 Ticket Categorieën',
            value: config.categories.length > 0 ? `${config.categories.length} categorieën ingesteld` : 'Geen categorieën',
            inline: true
        }
    ]);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_default_category_select')
            .setLabel('Standaard Categorie')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📁'),
        new ButtonBuilder()
            .setCustomId('ticket_log_select')
            .setLabel('Log Kanaal')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
        new ButtonBuilder()
            .setCustomId('ticket_support_role_select')
            .setLabel('Support Rol')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👥')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_setmax_custom')
            .setLabel('Max Tickets')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📊'),
        new ButtonBuilder()
            .setCustomId('ticket_reset_counter')
            .setLabel('Reset Ticket Nummer')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔄')
    );

    return {
        embeds: [embed],
        components: [row1, row2]
    };
}
async function showAddCategoryModal(interaction, db) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_category_add')
        .setTitle('Nieuwe Ticket Categorie');

    const nameInput = new TextInputBuilder()
        .setCustomId('category_name')
        .setLabel('Naam van de categorie')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const descriptionInput = new TextInputBuilder()
        .setCustomId('category_description')
        .setLabel('Beschrijving')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    const emojiInput = new TextInputBuilder()
        .setCustomId('category_emoji')
        .setLabel('Emoji (optioneel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
    const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(emojiInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
    await interaction.showModal(modal);
}

// Show delete category menu
async function showDeleteCategoryMenu(interaction, db) {
    const categories = getTicketCategories(db, interaction.guild.id);

    if (categories.length === 0) {
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({
                content: 'Er zijn geen ticket categorieën om te verwijderen.',
                embeds: [],
                components: []
            });
        } else {
            return interaction.reply({
                content: 'Er zijn geen ticket categorieën om te verwijderen.',
                ephemeral: true
            });
        }
    }

    const options = categories.map(cat => ({
        label: cat.name,
        description: `Verwijder deze categorie`,
        value: cat.id.toString(),
        emoji: cat.emoji || '❓'
    }));

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket_category_remove')
            .setPlaceholder('Selecteer een categorie om te verwijderen')
            .addOptions(options)
    );

    const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_config_categories')
            .setLabel('Terug')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );

    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Verwijder Ticket Categorie')
        .setDescription('Selecteer een categorie om te verwijderen. Dit kan niet ongedaan worden gemaakt!');

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
            embeds: [embed],
            components: [selectMenu, backButton]
        });
    } else {
        await interaction.reply({
            embeds: [embed],
            components: [selectMenu, backButton],
            ephemeral: true
        });
    }
}

// Main command handler
async function execute(interaction) {
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ ephemeral: true });
    }

    const { options, guild } = interaction;
    const db = interaction.client.db;
    
    // Ensure tables exist
    createTicketTables(db);

    const subcommand = options.getSubcommand();

    try {
        switch (subcommand) {
            case 'config':
                await showConfigPanel(interaction, db);
                break;
            case 'panel':
                await handlePanel(interaction, db);
                break;
            case 'categorie':
                const action = options.getString('actie');
                await handleCategory(interaction, db, action);
                break;
            default:
                await interaction.editReply({
                    content: 'Ongeldig subcommando.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error in tickets command:', error);
        await interaction.editReply({
            content: 'Er is een fout opgetreden bij het uitvoeren van dit commando.',
            ephemeral: true
        });
    }
}

// Handle ticket wizard
let ticketWizardState = new Map();

export const handleTicketWizard = async (interaction, db) => {
    // Defer the interaction
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ ephemeral: true });
    }

    // Reset wizard state
    ticketWizardState.set(interaction.user.id, {
        step: 'name',
        data: {}
    });

    // Show modal for category name
    const modal = new ModalBuilder()
        .setCustomId('ticket_wizard_modal')
        .setTitle('Nieuwe Ticket Categorie')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('name')
                    .setLabel('Naam van de categorie')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50)
            )
        );

    await interaction.showModal(modal);
};

// Handle ticket wizard components
export const handleTicketWizardComponent = async (interaction) => {
    const { customId, user, guild } = interaction;
    const db = interaction.client.db;
    
    // Check if this is a ticket button
    if (customId.startsWith('ticket_')) {
        return handleTicketButton(interaction, db);
    }

    // Handle wizard steps
    const state = ticketWizardState.get(user.id);
    if (!state) return;

    // Defer the interaction
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
    }

    try {
        if (interaction.isModalSubmit() && state.step === 'name') {
            const name = interaction.fields.getTextInputValue('name');
            state.data.name = name;
            state.step = 'description';
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎫 Nieuwe Ticket Categorie')
                .setDescription('Wat is de beschrijving voor deze categorie? Dit wordt getoond in het ticket paneel.');
            
            const modal = new ModalBuilder()
                .setCustomId('ticket_wizard_modal')
                .setTitle('Beschrijving')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('description')
                            .setLabel('Beschrijving')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(1000)
                    )
                );
            
            await interaction.showModal(modal);
        } else if (interaction.isModalSubmit() && state.step === 'description') {
            const description = interaction.fields.getTextInputValue('description');
            state.data.description = description;
            state.step = 'emoji';
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎫 Nieuwe Ticket Categorie')
                .setDescription('Welk emoji moet er voor deze categorie worden getoond? (optioneel)');
            
            const modal = new ModalBuilder()
                .setCustomId('ticket_wizard_modal')
                .setTitle('Emoji')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('emoji')
                            .setLabel('Emoji')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setMaxLength(10)
                    )
                );
            
            await interaction.showModal(modal);
        } else if (interaction.isModalSubmit() && state.step === 'emoji') {
            const emoji = interaction.fields.getTextInputValue('emoji') || '🎫';
            state.data.emoji = emoji;
            
            // Save the category to database
            const { name, description, emoji: categoryEmoji } = state.data;
            
            db.prepare(
                'INSERT INTO ticket_categories (guild_id, name, description, emoji) VALUES (?, ?, ?, ?)'
            ).run(interaction.guild.id, name, description, categoryEmoji);
            
            // Clean up
            ticketWizardState.delete(user.id);
            
            // Defer the update to refresh the category management view
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            // Refresh the category management view to show the new category
            const { handleCategoryManagement } = await import('./ticketUtils.js');
            await handleCategoryManagement(interaction, db);

            console.log('✅ Category added via wizard successfully');
        }
    } catch (error) {
        console.error('Error in ticket wizard:', error);
        await interaction.followUp({
            content: 'Er is een fout opgetreden in de wizard. Probeer het opnieuw.',
            ephemeral: true
        });
    }
};

// Handle setup subcommand
async function handleSetup(interaction, db) {
    const { guild } = interaction;
    
    // Create the ticket category
    let category;
    try {
        category = await guild.channels.create({
            name: 'tickets',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
            ],
        });
    } catch (error) {
        console.error('Error creating ticket category:', error);
        return interaction.editReply({
            content: 'Er is een fout opgetreden bij het aanmaken van de ticket categorie.',
            ephemeral: true
        });
    }
    
    // Create the ticket panel channel
    let panelChannel;
    try {
        panelChannel = await guild.channels.create({
            name: 'meld-je',
            type: ChannelType.GuildText,
            topic: 'Maak hier een ticket aan door op de knop hieronder te klikken.',
            parent: category,
        });
    } catch (error) {
        console.error('Error creating panel channel:', error);
        return interaction.editReply({
            content: 'Er is een fout opgetreden bij het aanmaken van het ticket paneel kanaal.',
            ephemeral: true
        });
    }
    
    // Send the ticket panel
    try {
        const config = getTicketConfig(db, guild.id);
        const panel = buildTicketPanel(guild, config);
        
        await panelChannel.send(panel);
        
        await interaction.editReply({
            content: `✅ Het ticketsysteem is succesvol ingesteld! Het ticket paneel is aangemaakt in ${panelChannel}.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error sending panel:', error);
        await interaction.editReply({
            content: 'Er is een fout opgetreden bij het instellen van het ticket paneel.',
            ephemeral: true
        });
    }
}

// Handle panel subcommand
async function handlePanel(interaction, db) {
    const channel = interaction.options.getChannel('kanaal');
    
    if (channel.type !== ChannelType.GuildText) {
        return interaction.editReply({
            content: 'Je moet een tekstkanaal selecteren.',
            ephemeral: true
        });
    }
    
    // Check permissions
    const me = interaction.guild.members.me;
    if (!channel.permissionsFor(me).has([
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.EmbedLinks
    ])) {
        return interaction.editReply({
            content: 'Ik heb geen toestemming om berichten te sturen in dat kanaal.',
            ephemeral: true
        });
    }
    
    try {
        const config = getTicketConfig(db, interaction.guild.id);
        const panel = buildTicketPanel(interaction.guild, config);
        
        await channel.send(panel);
        
        await interaction.editReply({
            content: `✅ Het ticket paneel is succesvol aangemaakt in ${channel}.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error creating panel:', error);
        await interaction.editReply({
            content: 'Er is een fout opgetreden bij het aanmaken van het ticket paneel.',
            ephemeral: true
        });
    }
}

// Handle category subcommand
async function handleCategory(interaction, db, action) {
    if (action === 'add') {
        // Start the wizard
        return handleTicketWizard(interaction, db);
    } else if (action === 'remove') {
        // List categories for removal
        const categories = db.prepare('SELECT id, name, emoji FROM ticket_categories WHERE guild_id = ?').all(interaction.guild.id);
        
        if (categories.length === 0) {
            return interaction.editReply({
                content: 'Er zijn geen ticket categorieën om te verwijderen.',
                ephemeral: true
            });
        }
        
        const options = categories.map(cat => ({
            label: cat.name,
            description: `Verwijder deze categorie`,
            value: cat.id.toString(),
            emoji: cat.emoji || '❓'
        }));
        
        const selectMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_category_remove')
                .setPlaceholder('Selecteer een categorie om te verwijderen')
                .addOptions(options)
        );
        
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Verwijder Ticket Categorie')
            .setDescription('Selecteer een categorie om te verwijderen. Dit kan niet ongedaan worden gemaakt!');
        
        await interaction.editReply({
            embeds: [embed],
            components: [selectMenu],
            ephemeral: true
        });
    } else if (action === 'list') {
        // List all categories
        const categories = db.prepare('SELECT * FROM ticket_categories WHERE guild_id = ?').all(interaction.guild.id);
        
        if (categories.length === 0) {
            return interaction.editReply({
                content: 'Er zijn nog geen ticket categorieën aangemaakt.',
                ephemeral: true
            });
        }
        
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📋 Ticket Categorieën')
            .setDescription('Hier zijn alle beschikbare ticket categorieën:');
        
        for (const cat of categories) {
            const supportRoles = cat.support_roles ? JSON.parse(cat.support_roles).map(id => `<@&${id}>`).join(', ') : 'Geen';
            embed.addFields({
                name: `${cat.emoji || '📌'} ${cat.name}`,
                value: `${cat.description}\n• Ondersteuning: ${supportRoles}\n• Categorie: ${cat.category_id ? `<#${cat.category_id}>` : 'Geen'}`,
                inline: false
            });
        }
        
        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
    }
}

export default {
    data,
    execute
};
