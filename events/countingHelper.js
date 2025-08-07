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
        safeDbOperation(() => {
            const stmt = db.prepare('UPDATE guild_config SET counting_number = ? WHERE guild_id = ?');
            stmt.run(messageNumber, guildId);
        });

        console.log(`✅ [counting] Correct number ${messageNumber} by ${message.author.tag}`);

        // Add a reaction to show it's correct
        await message.react('✅');

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
            await message.react('🎊');
        } else if (messageNumber % 25 === 0) {
            await message.react('🎉');
        }

    } catch (error) {
        console.error('❌ [counting] Error updating counting number:', error);
        await message.react('❌');
    }
}

async function handleWrongCount(message, expectedNumber, reason) {
    try {
        // Delete the wrong message
        await message.delete();

        // Send error message
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Verkeerd Getal!')
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
                await errorMessage.delete();
            } catch (deleteError) {
                console.error('Error deleting error message:', deleteError);
            }
        }, 5000);

        // Reset the counter to 0 using safe database operation
        const db = message.client.db;
        safeDbOperation(() => {
            const stmt = db.prepare('UPDATE guild_config SET counting_number = 0 WHERE guild_id = ?');
            stmt.run(message.guild.id);
        });

        console.log(`🔄 [counting] Counter reset due to wrong number by ${message.author.tag}`);

    } catch (error) {
        console.error('❌ [counting] Error handling wrong count:', error);
    }
}