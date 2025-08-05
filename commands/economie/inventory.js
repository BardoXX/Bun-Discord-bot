// commands/economie/inventory.js - New command to view purchased items
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Bekijk je gekochte items')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Bekijk de inventory van een andere gebruiker')
                .setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const userId = targetUser.id;

        console.log(`🎒 [inventory] Showing inventory for ${targetUser.tag}`);

        // Get user's inventory with item details
        const stmt = db.prepare(`
            SELECT ui.quantity, si.name, si.description, si.price, si.category 
            FROM user_inventory ui 
            JOIN shop_items si ON ui.item_id = si.id 
            WHERE ui.user_id = ? AND ui.guild_id = ? AND ui.quantity > 0
            ORDER BY si.category, si.name
        `);
        
        const inventory = stmt.all(userId, guildId);

        if (!inventory || inventory.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle(`🎒 ${targetUser.displayName}'s Inventory`)
                .setDescription(targetUser.id === interaction.user.id ? 
                    'Je hebt nog geen items gekocht!' : 
                    'Deze gebruiker heeft nog geen items gekocht!')
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Group items by category
        const categories = {};
        let totalItems = 0;
        
        inventory.forEach(item => {
            if (!categories[item.category]) {
                categories[item.category] = [];
            }
            categories[item.category].push(item);
            totalItems += item.quantity;
        });

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`🎒 ${targetUser.displayName}'s Inventory`)
            .setDescription(`Totaal **${totalItems}** items in **${Object.keys(categories).length}** categorieën`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp();

        Object.keys(categories).forEach(category => {
            const categoryItems = categories[category];
            const itemList = categoryItems.map(item => 
                `**${item.name}** x${item.quantity}`
            ).join('\n');
            
            embed.addFields({
                name: `${getCategoryEmoji(category)} ${category}`,
                value: itemList,
                inline: false
            });
        });

        await interaction.reply({ embeds: [embed] });
    },
};

function getCategoryEmoji(category) {
    const emojis = {
        'Jobs': '💼',
        'Ranks': '🏆',
        'Items': '📦',
        'Boosters': '⚡',
        'Cosmetics': '✨',
        'Tools': '🔧',
        'Food': '🍕',
        'Other': '❓'
    };
    return emojis[category] || '📦';
}