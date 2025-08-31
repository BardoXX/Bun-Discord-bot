// commands/economie/inventory.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ensureFeatureEnabled } from '../utils/economyFeatures.js';

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Bekijk je gekochte items en job statistieken')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Bekijk de inventory van een andere gebruiker')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Filter items op categorie')
                .addChoices(
                    { name: '💼 Jobs', value: 'job' },
                    { name: '⚡ Boosters', value: 'multiplier' },
                    { name: '🏆 Ranks', value: 'rank' },
                    { name: '📦 Items', value: 'item' },
                    { name: '🔧 Tools', value: 'tool' },
                    { name: '✨ Cosmetics', value: 'cosmetic' }
                )
                .setRequired(false)),

    async execute(interaction) {
        if (!(await ensureFeatureEnabled(interaction, 'inventory', 'inventory'))) return;
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const filter = interaction.options.getString('filter');
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const userId = targetUser.id;

        console.log(`🎒 [inventory] Showing inventory for ${targetUser.tag}${filter ? ` (filter: ${filter})` : ''}`);

        try {
            // Get user's inventory with item details
            let query = `
                SELECT ui.quantity, ui.acquired_at, ui.item_data as user_item_data,
                       si.name, si.description, si.price, si.category, si.type, si.item_data
                FROM user_inventory ui 
                JOIN shop_items si ON ui.item_id = si.id 
                WHERE ui.user_id = ? AND ui.guild_id = ? AND ui.quantity > 0
            `;
            
            const params = [userId, guildId];
            
            if (filter) {
                query += ` AND si.type = ?`;
                params.push(filter);
            }
            
            query += ` ORDER BY ui.acquired_at DESC, si.category, si.name`;
            
            const stmt = db.prepare(query);
            const inventory = stmt.all(...params);

            // Get job usage statistics
            const jobStatsStmt = db.prepare(`
                SELECT COUNT(*) as work_count, MAX(last_work) as last_work_time
                FROM users 
                WHERE user_id = ? AND guild_id = ? AND last_work IS NOT NULL
            `);
            const jobStats = jobStatsStmt.get(userId, guildId) || { work_count: 0, last_work_time: null };

            if (!inventory || inventory.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle(`🎒 ${targetUser.displayName}'s Inventory`)
                    .setDescription(
                        targetUser.id === interaction.user.id ? 
                        (filter ? `Je hebt geen **${getFilterName(filter)}** items!` : 'Je hebt nog geen items gekocht!') :
                        (filter ? `Deze gebruiker heeft geen **${getFilterName(filter)}** items!` : 'Deze gebruiker heeft nog geen items gekocht!')
                    )
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setFooter({ text: `Gebruik /shop om items te kopen • Gewerkt ${jobStats.work_count} keer` })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                return;
            }

            // Group items by category and type
            const categories = {};
            let totalItems = 0;
            let totalValue = 0;
            
            inventory.forEach(item => {
                const categoryKey = `${item.category} (${item.type})`;
                if (!categories[categoryKey]) {
                    categories[categoryKey] = {
                        items: [],
                        emoji: getCategoryEmoji(item.type),
                        type: item.type
                    };
                }
                categories[categoryKey].items.push(item);
                totalItems += item.quantity;
                totalValue += item.price * item.quantity;
            });

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🎒 ${targetUser.displayName}'s Inventory${filter ? ` - ${getFilterName(filter)}` : ''}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            // Add summary field
            let summaryText = `📦 **${totalItems}** items\n💰 **€${totalValue.toLocaleString()}** waarde\n📂 **${Object.keys(categories).length}** categorieën`;
            
            if (jobStats.work_count > 0) {
                summaryText += `\n💼 **${jobStats.work_count}** keer gewerkt`;
                if (jobStats.last_work_time) {
                    const lastWork = new Date(jobStats.last_work_time);
                    const timeSince = Math.floor((Date.now() - lastWork.getTime()) / (1000 * 60));
                    if (timeSince < 60) {
                        summaryText += `\n🕐 Laatst gewerkt: ${timeSince} min geleden`;
                    } else if (timeSince < 1440) {
                        summaryText += `\n🕐 Laatst gewerkt: ${Math.floor(timeSince / 60)} uur geleden`;
                    } else {
                        summaryText += `\n🕐 Laatst gewerkt: ${Math.floor(timeSince / 1440)} dagen geleden`;
                    }
                }
            }

            embed.setDescription(summaryText);

            // Add category fields
            Object.keys(categories).forEach(categoryKey => {
                const category = categories[categoryKey];
                let itemList = category.items.map(item => {
                    let itemText = `**${item.name}** x${item.quantity}`;
                    
                    // Add special info for different item types
                    if (item.type === 'job' && item.item_data) {
                        try {
                            const jobData = JSON.parse(item.item_data);
                            itemText += ` (€${jobData.min}-${jobData.max})`;
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    } else if (item.type === 'multiplier' && item.item_data) {
                        try {
                            const multiplierData = JSON.parse(item.item_data);
                            itemText += ` (${multiplierData.value}x boost)`;
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    }

                    // Add acquisition date for recent items
                    if (item.acquired_at) {
                        const acquired = new Date(item.acquired_at);
                        const daysAgo = Math.floor((Date.now() - acquired.getTime()) / (1000 * 60 * 60 * 24));
                        if (daysAgo === 0) {
                            itemText += ` *🆕 vandaag*`;
                        } else if (daysAgo === 1) {
                            itemText += ` *🕐 gisteren*`;
                        } else if (daysAgo < 7) {
                            itemText += ` *🕐 ${daysAgo}d geleden*`;
                        }
                    }
                    
                    return itemText;
                }).join('\n');
                
                // Truncate if too long
                if (itemList.length > 1024) {
                    const items = category.items;
                    const truncatedList = items.slice(0, 10).map(item => 
                        `**${item.name}** x${item.quantity}`
                    ).join('\n');
                    itemList = truncatedList + `\n*... en ${items.length - 10} meer*`;
                }
                
                embed.addFields({
                    name: `${category.emoji} ${categoryKey}`,
                    value: itemList || 'Geen items',
                    inline: false
                });
            });

            // Add quick stats for jobs if user has any
            const jobItems = inventory.filter(item => item.type === 'job');
            if (jobItems.length > 0) {
                let jobEarningsRange = { min: 0, max: 0 };
                jobItems.forEach(job => {
                    if (job.item_data) {
                        try {
                            const jobData = JSON.parse(job.item_data);
                            jobEarningsRange.min += (jobData.min || 0) * job.quantity;
                            jobEarningsRange.max += (jobData.max || 0) * job.quantity;
                        } catch (e) {
                            // Default values if parsing fails
                            jobEarningsRange.min += 100 * job.quantity;
                            jobEarningsRange.max += 300 * job.quantity;
                        }
                    }
                });

                embed.addFields({
                    name: '💰 Job Verdiensten Bereik',
                    value: `€${jobEarningsRange.min.toLocaleString()} - €${jobEarningsRange.max.toLocaleString()} per werk sessie`,
                    inline: true
                });
            }

            // Add multiplier info
            const multipliers = inventory.filter(item => item.type === 'multiplier');
            if (multipliers.length > 0) {
                let totalMultiplier = 1;
                multipliers.forEach(mult => {
                    if (mult.item_data) {
                        try {
                            const multiplierData = JSON.parse(mult.item_data);
                            totalMultiplier += (multiplierData.value || 0) * mult.quantity;
                        } catch (e) {
                            totalMultiplier += 0.1 * mult.quantity; // Default boost
                        }
                    }
                });

                embed.addFields({
                    name: '⚡ Actieve Multiplier',
                    value: `${totalMultiplier.toFixed(1)}x verdiensten boost`,
                    inline: true
                });
            }

            // Set footer with helpful info
            const footerTexts = [
                `💼 Gewerkt ${jobStats.work_count} keer`,
                filter ? 'Gebruik /inventory zonder filter voor alle items' : 'Gebruik /shop om meer items te kopen'
            ];
            embed.setFooter({ text: footerTexts.join(' • ') });

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('❌ Error in inventory command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het ophalen van de inventory.')
                .setTimestamp();

            try {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
    },
};

function getCategoryEmoji(type) {
    const emojis = {
        'job': '💼',
        'multiplier': '⚡',
        'rank': '🏆',
        'item': '📦',
        'tool': '🔧',
        'cosmetic': '✨',
        'food': '����',
        'boost': '🚀',
        'other': '❓'
    };
    return emojis[type] || '📦';
}

function getFilterName(filter) {
    const names = {
        'job': 'Job Items',
        'multiplier': 'Booster Items',
        'rank': 'Rank Items',
        'item': 'Regular Items',
        'tool': 'Tool Items',
        'cosmetic': 'Cosmetic Items'
    };
    return names[filter] || 'Items';
}
