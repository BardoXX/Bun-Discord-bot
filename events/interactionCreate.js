// events/interactionCreate.js
import { EmbedBuilder } from 'discord.js';
import { createTicket, claimTicket, closeTicket } from '../commands/utils/ticketSystem.js';
import { handleShopInteraction } from './shopInteraction.js';

export default {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                console.log(`🔧 Executing command: ${interaction.commandName}`);
                const command = interaction.client.commands.get(interaction.commandName);

                if (!command) {
                    console.error(`❌ No command matching ${interaction.commandName} was found.`);
                    return;
                }

                try {
                    await command.execute(interaction);
                    console.log(`✅ Command ${interaction.commandName} executed successfully`);
                } catch (error) {
                    console.error(`❌ Error executing command ${interaction.commandName}:`, error);
                    
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Fout')
                        .setDescription('Er is een fout opgetreden bij het uitvoeren van dit commando.')
                        .setTimestamp();

                    try {
                        if (interaction.replied || interaction.deferred) {
                            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }); 
                        } else {
                            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                        }
                    } catch (replyError) {
                        console.error('❌ Failed to send command error message:', replyError.message);
                    }
                }
                return; // Exit early after handling command
            }

            // Handle select menu and button interactions for shop
            if (interaction.isStringSelectMenu() || interaction.isButton()) {
                // Check if it's a shop interaction - DON'T defer here, let shopInteraction handle it
                if (interaction.customId && interaction.customId.startsWith('shop_')) {
                    console.log(`🛒 Processing shop interaction: ${interaction.customId}`);
                    try {
                        await handleShopInteraction(interaction);
                        console.log(`✅ Shop interaction ${interaction.customId} processed successfully`);
                    } catch (error) {
                        console.error(`❌ Error in shop interaction ${interaction.customId}:`, error.message);
                        
                        // Only try to respond if we haven't already
                        if (!interaction.replied && !interaction.deferred) {
                            try {
                                const errorEmbed = new EmbedBuilder()
                                    .setColor('#ff0000')
                                    .setTitle('❌ Shop Fout')
                                    .setDescription('Er is een fout opgetreden bij het verwerken van de shop interactie.')
                                    .setTimestamp();
                                
                                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                            } catch (replyError) {
                                console.error('❌ Failed to send shop error message:', replyError.message);
                            }
                        }
                    }
                    return; // Exit early after handling shop interaction
                }

                // Handle other button interactions (tickets, etc.)
                if (interaction.isButton()) {
                    const customId = interaction.customId;
                    console.log(`🎛️ Processing button interaction: ${customId}`);

                    try {
                        switch (customId) {
                            case 'create_ticket':
                                await createTicket(interaction);
                                break;
                            case 'claim_ticket':
                                await claimTicket(interaction);
                                break;
                            case 'close_ticket':
                                await closeTicket(interaction);
                                break;
                            default:
                                console.log(`⚠️ Unknown button interaction: ${customId}`);
                                
                                if (!interaction.replied && !interaction.deferred) {
                                    const unknownEmbed = new EmbedBuilder()
                                        .setColor('#ff0000')
                                        .setTitle('❌ Fout')
                                        .setDescription('Onbekende knop-interactie.')
                                        .setTimestamp();
                                    
                                    await interaction.reply({ embeds: [unknownEmbed], ephemeral: true });
                                }
                                break;
                        }
                        console.log(`✅ Button interaction ${customId} processed successfully`);
                    } catch (error) {
                        console.error(`❌ Error in button interaction ${customId}:`, error.message);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Critical error in interactionCreate handler:', {
                error: error.message,
                customId: interaction.customId,
                type: interaction.type,
                user: interaction.user?.tag,
                guild: interaction.guild?.name
            });
            
            // Only try to respond if we haven't already and it's not an "Unknown interaction" error
            if (!interaction.replied && !interaction.deferred && error.code !== 10062) {
                try {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Kritieke Fout')
                        .setDescription('Er is een onverwachte fout opgetreden.')
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                } catch (replyError) {
                    console.error('❌ Failed to send critical error message:', replyError.message);
                }
            }
        }
    },
};