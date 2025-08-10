import { EmbedBuilder } from 'discord.js';
import { safeDbOperation } from '../commands/utils/database.js';

export async function handleCountingMessage(message) {
    // Skip if it's a bot message
    if (message.author.bot) return;
    
    const db = message.client.db;
    const guildId = message.guild.id;
    const channelId = message.channel.id;

    // Get counting configuration using safe database operation
    const config = safeDbOperation(() => {
        const stmt = db.prepare('SELECT counting_channel, counting_number FROM guild_config WHERE guild_id = ?');
        return stmt.get(guildId);
    });

    // Check if this message is in the counting channel
    if (!config || !config.counting_channel || config.counting_channel !== channelId) {
        return; // Not a counting channel
    }

    console.log(`🔢 [counting] Message in counting channel: "${message.content}" by ${message.author.tag}`);
    console.log(`📊 [counting] Current config from database: counting_channel=${config.counting_channel}, counting_number=${config.counting_number}`);

    const currentNumber = Number(config.counting_number || 0);
    const expectedNumber = currentNumber + 1;
    const messageNumber = parseInt(message.content.trim());

    // Check if the message is a valid number
    if (isNaN(messageNumber) || message.content.trim() !== messageNumber.toString()) {
        console.log(`❌ [counting] Invalid number format: "${message.content}"`);
        await handleWrongCount(message, expectedNumber, `Het bericht moet alleen het getal **${expectedNumber}** bevatten!`);
        return;
    }

    // Check if it's the correct number
    if (messageNumber !== expectedNumber) {
        console.log(`❌ [counting] Wrong number: expected ${expectedNumber}, got ${messageNumber}`);
        await handleWrongCount(message, expectedNumber, `Fout! Het juiste getal was **${expectedNumber}**, maar je typte **${messageNumber}**.`);
        return;
    }

    // Correct number! Update the database using safe operation
    try {
        const updateResult = safeDbOperation(() => {
            const stmt = db.prepare('UPDATE guild_config SET counting_number = ? WHERE guild_id = ?');
            return stmt.run(messageNumber, guildId);
        });

        console.log(`✅ [counting] Correct number ${messageNumber} by ${message.author.tag}`);
        console.log(`📊 [counting] Database update result: changes=${updateResult ? updateResult.changes : 'unknown'}`);

        // Add a reaction to show it's correct
        await message.react('✅').catch(err => {
            if (err.code !== 10008) { // Unknown message error
                console.error('[counting] Error reacting to message:', err);
            } else {
                console.warn('[counting] Message already deleted, skipping reaction.');
            }
        });

        // Special milestones
        if (messageNumber % 100 === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ffd700')
                .setTitle('🎉 Mijlpaal Bereikt!')
                .setDescription(`Gefeliciteerd! Jullie hebben **${messageNumber}** bereikt!`)
                .setThumbnail(message.author.displayAvatarURL())
                .addFields(
                    { name: 'Gebruiker', value: `${message.author}`, inline: true },
                    { name: 'Getal', value: `${messageNumber}`, inline: true }
                )
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
        } else if (messageNumber % 50 === 0) {
            await message.react('🎊').catch(err => {
                if (err.code !== 10008) { // Unknown message error
                    console.error('[counting] Error reacting to message:', err);
                } else {
                    console.warn('[counting] Message already deleted, skipping reaction.');
                }
            });
        } else if (messageNumber % 25 === 0) {
            await message.react('🎉').catch(err => {
                if (err.code !== 10008) { // Unknown message error
                    console.error('[counting] Error reacting to message:', err);
                } else {
                    console.warn('[counting] Message already deleted, skipping reaction.');
                }
            });
        }

    } catch (error) {
        console.error('❌ [counting] Error updating counting number:', error);
        await message.react('❌').catch(err => {
            if (err.code !== 10008) { // Unknown message error
                console.error('[counting] Error reacting to message:', err);
            } else {
                console.warn('[counting] Message already deleted, skipping reaction.');
            }
        });
    }
}

async function handleWrongCount(message, expectedNumber, reason) {
    try {
        // Delete the wrong message with proper error handling
        await message.delete().catch(err => {
            if (err.code !== 10008) { // Unknown message error
                console.error('[counting] Error deleting wrong message:', err);
            } else {
                console.warn('[counting] Message already deleted, skipping deletion.');
                // Don't process already deleted messages to prevent infinite loops
                return;
            }
        });

        // Send error message
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle(' Verkeerd Getal!')
            .setDescription(reason)
            .addFields(
                { name: 'Volgend Getal', value: `**${expectedNumber}**`, inline: true },
                { name: 'Gebruiker', value: `${message.author}`, inline: true }
            )
            .setFooter({ text: 'Je bericht is verwijderd. Probeer opnieuw!' })
            .setTimestamp();

        const errorMessage = await message.channel.send({ embeds: [embed] });

        // Delete the error message after 5 seconds to keep the channel clean
        setTimeout(async () => {
            try {
                await errorMessage.delete().catch(err => {
                    if (err.code !== 10008) { // Unknown message error
                        console.error('[counting] Error deleting error message:', err);
                    } else {
                        console.warn('[counting] Error message already deleted, skipping deletion.');
                    }
                });
            } catch (error) {
                console.error('[counting] Unexpected error in error message deletion timeout:', error);
            }
        }, 5000);

        // Don't reset the counter to 0 - just inform users of the correct number
        console.log(`🔄 [counting] Wrong number by ${message.author.tag}, current number is ${expectedNumber - 1}`);

    } catch (error) {
        console.error('❌ [counting] Error handling wrong count:', error);
    }
}