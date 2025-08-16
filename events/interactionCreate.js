// events/interactionCreate.js
import { Events, EmbedBuilder } from 'discord.js';
import { createTicket, claimTicket, closeTicket } from '../commands/utils/ticketSystem.js';
import { handleShopInteraction, handleShopSelectMenu, handleShopButton } from '../commands/economie/shop.js';
import { handleTicketButtonInteraction } from '../modules/tickets/ticketButtonHandler.js';

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
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
                            .setTitle('❌ Command Fout')
                            .setDescription('Er is een fout opgetreden bij het uitvoeren van dit commando.')
                            .setTimestamp();

                        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    } catch (replyError) {
                        // Suppress noisy logs for already-acknowledged/unknown interaction
                        if (!(replyError && (replyError.code === 40060 || replyError.code === 10062))) {
                            console.error('❌ Failed to send command error message:', replyError.message);
                        }
                    }
                }
            }
        }
        
        // Handle select menu and button interactions for shop
        else if (interaction.isStringSelectMenu() || interaction.isButton()) {
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
                return;
            }

            // Handle other button interactions (tickets, blackjack, etc.)
            if (interaction.isButton()) {
                const customId = interaction.customId;
                console.log(`🎛️ Processing button interaction: ${customId}`);

                try {
                    // Handle ticket panel buttons (dynamic)
                    if (customId.startsWith('ticket_btn_')) {
                        await handleTicketButtonInteraction(interaction);
                    }
                    // Handle Blackjack interactions
                    else if (customId.startsWith('blackjack_hit_') || customId.startsWith('blackjack_stand_')) {
                        // Import and handle Blackjack interactions
                        const { handleBlackjackInteraction } = await import('../commands/fun/jackblack.js');
                        await handleBlackjackInteraction(interaction);
                    } else {
                        // Handle other button interactions
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
                    }
                    console.log(`✅ Button interaction ${customId} processed successfully`);
                } catch (error) {
                    console.error(`❌ Error in button interaction ${customId}:`, error.message);
                    
                    // Handle DiscordAPIError specifically for unknown interactions
                    if (error.code === 10062) {
                        console.log('⚠️ Interaction expired or unknown - this is normal for timed out interactions');
                    } else {
                        // Try to send error message if not already replied
                        if (!interaction.replied && !interaction.deferred) {
                            try {
                                const errorEmbed = new EmbedBuilder()
                                    .setColor('#ff0000')
                                    .setTitle('❌ Interactie Fout')
                                    .setDescription('Er is een fout opgetreden bij het verwerken van deze interactie.')
                                    .setTimestamp();
                                
                                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                            } catch (replyError) {
                                console.error('❌ Failed to send interaction error message:', replyError.message);
                            }
                        }
                    }
                }
            }
        }
    },
};