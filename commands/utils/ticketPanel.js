// commands/utils/ticketPanel.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createTicketPanel, getTicketPanelsForGuild, deleteTicketPanel, postTicketPanel } from '../../modules/tickets/ticketPanelManager.js';
import { addPanelButton, removePanelButton, getButtonsForPanel } from '../../modules/tickets/ticketConfig.js';
import { clearButtonCache, clearPanelCache } from '../../modules/tickets/ticketButtonHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticket-panel')
        .setDescription('Beheer ticket panelen')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Maak een nieuw ticket panel')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Naam van het panel')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kanaal waar het panel geplaatst wordt')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Titel van de embed')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Beschrijving van de embed')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('Kleur van de embed (hex code)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Toon alle ticket panelen voor deze server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Verwijder een ticket panel')
                .addIntegerOption(option =>
                    option.setName('panel_id')
                        .setDescription('ID van het panel om te verwijderen')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('button')
                .setDescription('Beheer knoppen voor een panel'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('button-add')
                .setDescription('Voeg een knop toe aan een panel')
                .addIntegerOption(option =>
                    option.setName('panel_id')
                        .setDescription('ID van het panel')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('label')
                        .setDescription('Tekst op de knop')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('ticket_type')
                        .setDescription('Type ticket dat wordt aangemaakt')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('style')
                        .setDescription('Stijl van de knop (PRIMARY, SECONDARY, SUCCESS, DANGER)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'PRIMARY', value: 'PRIMARY' },
                            { name: 'SECONDARY', value: 'SECONDARY' },
                            { name: 'SUCCESS', value: 'SUCCESS' },
                            { name: 'DANGER', value: 'DANGER' }))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('Emoji op de knop')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('use_form')
                        .setDescription('Gebruik een formulier bij het aanmaken')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('role_requirement')
                        .setDescription('Rol vereist voor dit ticket type')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('button-remove')
                .setDescription('Verwijder een knop van een panel')
                .addIntegerOption(option =>
                    option.setName('button_id')
                        .setDescription('ID van de knop om te verwijderen')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('button-list')
                .setDescription('Toon alle knoppen voor een panel')
                .addIntegerOption(option =>
                    option.setName('panel_id')
                        .setDescription('ID van het panel')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('post')
                .setDescription('Plaats een panel in het ingestelde kanaal')
                .addIntegerOption(option =>
                    option.setName('panel_id')
                        .setDescription('ID van het panel om te plaatsen')
                        .setRequired(true))),

    async execute(interaction) {
        const db = interaction.client.db;
        const subcommand = interaction.options.getSubcommand();
        
        try {
            switch (subcommand) {
                case 'create':
                    await handleCreatePanel(interaction, db);
                    break;
                case 'list':
                    await handleListPanels(interaction, db);
                    break;
                case 'delete':
                    await handleDeletePanel(interaction, db);
                    break;
                case 'button':
                    await handleButtonManagement(interaction, db);
                    break;
                case 'button-add':
                    await handleAddButton(interaction, db);
                    break;
                case 'button-remove':
                    await handleRemoveButton(interaction, db);
                    break;
                case 'button-list':
                    await handleListButtons(interaction, db);
                    break;
                case 'post':
                    await handlePostPanel(interaction, db);
                    break;
                default:
                    const embed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Ongeldig Subcommando')
                        .setDescription('Dit subcommando is niet herkend.')
                        .setTimestamp();
                    await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in ticket-panel command:', error);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription(`Er is een fout opgetreden: ${error.message}`)
                .setTimestamp();
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                } else {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    },
};

async function handleCreatePanel(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const name = interaction.options.getString('name');
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title') || '🎫 Ticket Systeem';
    const description = interaction.options.getString('description') || 'Klik op een knop hieronder om een ticket aan te maken.';
    const color = interaction.options.getString('color') || '#0099ff';
    
    // Validate color
    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Ongeldige Kleur')
            .setDescription('Gebruik een geldige hex kleurcode (bijv. #ff0000)')
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    try {
        const panel = await createTicketPanel(db, interaction.guild.id, name, channel.id, {
            title,
            description,
            color
        });
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('✅ Panel Aangemaakt')
            .setDescription(`Ticket panel '${name}' is aangemaakt met ID ${panel.id}`)
            .addFields(
                { name: 'Kanaal', value: `<#${channel.id}>`, inline: true },
                { name: 'ID', value: panel.id.toString(), inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        throw new Error(`Failed to create panel: ${error.message}`);
    }
}

async function handleListPanels(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const panels = getTicketPanelsForGuild(db, interaction.guild.id);
    
    if (panels.length === 0) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('📋 Geen Panelen')
            .setDescription('Er zijn nog geen ticket panelen aangemaakt voor deze server.')
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📋 Ticket Panelen')
        .setDescription(`Er zijn ${panels.length} ticket panelen voor deze server:`)
        .setTimestamp();
    
    for (const panel of panels) {
        embed.addFields({
            name: `${panel.panel_name} (ID: ${panel.id})`,
            value: `Kanaal: <#${panel.channel_id}>\nTitel: ${panel.embed_title}\nBeschrijving: ${panel.embed_description?.substring(0, 100)}${panel.embed_description?.length > 100 ? '...' : ''}`,
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleDeletePanel(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const panelId = interaction.options.getInteger('panel_id');
    
    try {
        const panel = db.prepare('SELECT * FROM ticket_panels WHERE id = ? AND guild_id = ?').get(panelId, interaction.guild.id);
        
        if (!panel) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Panel Niet Gevonden')
                .setDescription(`Er is geen panel met ID ${panelId} gevonden voor deze server.`)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        deleteTicketPanel(db, panelId);
        clearPanelCache();
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Panel Verwijderd')
            .setDescription(`Ticket panel '${panel.panel_name}' (ID: ${panelId}) is verwijderd.`)
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        throw new Error(`Failed to delete panel: ${error.message}`);
    }
}

async function handleButtonManagement(interaction, db) {
    const buttonSubcommand = interaction.options.getSubcommand();
    
    switch (buttonSubcommand) {
        case 'add':
            await handleAddButton(interaction, db);
            break;
        case 'remove':
            await handleRemoveButton(interaction, db);
            break;
        case 'list':
            await handleListButtons(interaction, db);
            break;
    }
}

async function handleAddButton(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const panelId = interaction.options.getInteger('panel_id');
    const label = interaction.options.getString('label');
    const style = interaction.options.getString('style') || 'PRIMARY';
    const emoji = interaction.options.getString('emoji');
    const ticketType = interaction.options.getString('ticket_type');
    const useForm = interaction.options.getBoolean('use_form') || false;
    const roleRequirement = interaction.options.getRole('role_requirement');
    
    try {
        // Check if panel exists
        const panel = db.prepare('SELECT * FROM ticket_panels WHERE id = ? AND guild_id = ?').get(panelId, interaction.guild.id);
        
        if (!panel) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Panel Niet Gevonden')
                .setDescription(`Er is geen panel met ID ${panelId} gevonden voor deze server.`)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        // Add button
        const buttonData = {
            label,
            style,
            emoji,
            ticket_type: ticketType,
            use_form: useForm,
            form_fields: null, // For future implementation
            role_requirement: roleRequirement?.id
        };
        
        const button = addPanelButton(db, panelId, buttonData);
        clearButtonCache();
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Knop Toegevoegd')
            .setDescription(`Knop '${label}' is toegevoegd aan panel '${panel.panel_name}' (ID: ${panelId})`)
            .addFields(
                { name: 'Type', value: ticketType, inline: true },
                { name: 'ID', value: button.id.toString(), inline: true },
                { name: 'Stijl', value: style, inline: true }
            )
            .setTimestamp();
        
        if (emoji) {
            embed.addFields({ name: 'Emoji', value: emoji, inline: true });
        }
        
        if (roleRequirement) {
            embed.addFields({ name: 'Rol Vereist', value: `<@&${roleRequirement.id}>`, inline: true });
        }
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        throw new Error(`Failed to add button: ${error.message}`);
    }
}

async function handleRemoveButton(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const buttonId = interaction.options.getInteger('button_id');
    
    try {
        // Check if button exists and belongs to this guild
        const button = db.prepare(`
            SELECT tb.*, tp.guild_id 
            FROM ticket_buttons tb 
            JOIN ticket_panels tp ON tb.panel_id = tp.id 
            WHERE tb.id = ?
        `).get(buttonId);
        
        if (!button || button.guild_id !== interaction.guild.id) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Knop Niet Gevonden')
                .setDescription(`Er is geen knop met ID ${buttonId} gevonden voor deze server.`)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        removePanelButton(db, buttonId);
        clearButtonCache();
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Knop Verwijderd')
            .setDescription(`Knop met ID ${buttonId} is verwijderd.`)
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        throw new Error(`Failed to remove button: ${error.message}`);
    }
}

async function handleListButtons(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const panelId = interaction.options.getInteger('panel_id');
    
    try {
        // Check if panel exists
        const panel = db.prepare('SELECT * FROM ticket_panels WHERE id = ? AND guild_id = ?').get(panelId, interaction.guild.id);
        
        if (!panel) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Panel Niet Gevonden')
                .setDescription(`Er is geen panel met ID ${panelId} gevonden voor deze server.`)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        const buttons = getButtonsForPanel(db, panelId);
        
        if (buttons.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('🔘 Geen Knoppen')
                .setDescription(`Er zijn nog geen knoppen toegevoegd aan panel '${panel.panel_name}' (ID: ${panelId}).`)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`🔘 Knoppen voor ${panel.panel_name}`)
            .setDescription(`Er zijn ${buttons.length} knoppen voor dit panel:`)
            .setTimestamp();
        
        for (const button of buttons) {
            let value = `Type: ${button.ticket_type}\nStijl: ${button.style}`;
            
            if (button.emoji) {
                value += `\nEmoji: ${button.emoji}`;
            }
            
            if (button.role_requirement) {
                value += `\nRol: <@&${button.role_requirement}>`;
            }
            
            if (button.use_form) {
                value += `\nFormulier: Ja`;
            }
            
            embed.addFields({
                name: `${button.label} (ID: ${button.id})`,
                value: value,
                inline: false
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        throw new Error(`Failed to list buttons: ${error.message}`);
    }
}

async function handlePostPanel(interaction, db) {
    await interaction.deferReply({ ephemeral: true });
    
    const panelId = interaction.options.getInteger('panel_id');
    
    try {
        // Check if panel exists
        const panel = db.prepare('SELECT * FROM ticket_panels WHERE id = ? AND guild_id = ?').get(panelId, interaction.guild.id);
        
        if (!panel) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Panel Niet Gevonden')
                .setDescription(`Er is geen panel met ID ${panelId} gevonden voor deze server.`)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        const message = await postTicketPanel(db, interaction.client, panelId);
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Panel Geplaatst')
            .setDescription(`Ticket panel '${panel.panel_name}' is geplaatst in <#${panel.channel_id}>`)
            .addFields(
                { name: 'Bericht', value: `[Link naar bericht](${message.url})`, inline: true },
                { name: 'ID', value: panelId.toString(), inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        throw new Error(`Failed to post panel: ${error.message}`);
    }
}
