// commands/economie/shop.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Bekijk en koop items uit de shop'),

    async execute(interaction) {
        const db = interaction.client.db;
        const guildId = interaction.guild.id;

        // Get shop items for this guild
        let stmt = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? ORDER BY category, price');
        let shopItems = stmt.all(guildId);

        if (!shopItems || shopItems.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('🏪 Shop Leeg')
                .setDescription('Er zijn nog geen items in de shop! Een administrator kan items toevoegen via `/config shop add`.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Group items by category
        const categories = {};
        shopItems.forEach(item => {
            if (!categories[item.category]) {
                categories[item.category] = [];
            }
            categories[item.category].push(item);
        });

        // Create category select menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('shop_category')
            .setPlaceholder('Kies een categorie...');

        Object.keys(categories).forEach(category => {
            selectMenu.addOptions({
                label: category,
                value: category,
                description: `${categories[category].length} items beschikbaar`,
                emoji: getCategoryEmoji(category)
            });
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🏪 Server Shop')
            .setDescription('Welkom bij de shop! Kies een categorie om de beschikbare items te bekijken.')
            .addFields(
                Object.keys(categories).map(category => ({
                    name: `${getCategoryEmoji(category)} ${category}`,
                    value: `${categories[category].length} items`,
                    inline: true
                }))
            )
            .setFooter({ text: 'Selecteer een categorie hieronder' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], components: [row] });
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