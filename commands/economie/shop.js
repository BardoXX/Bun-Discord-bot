// commands/economie/shop.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Bekijk en koop items uit de shop'),

    async execute(interaction) {
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        // Stap 1: Haal de balans van de gebruiker op uit de database
        let stmtUser = db.prepare('SELECT balance FROM users WHERE id = ? AND guild_id = ?');
        let userData = stmtUser.get(userId, guildId);

        // Als de gebruiker nog niet in de DB staat, voeg die dan toe met een balans van 0
        if (!userData) {
            let insertStmt = db.prepare('INSERT INTO users (id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
            insertStmt.run(userId, guildId);
            userData = { balance: 0 };
        }
        
        const userBalance = userData.balance;

        // Haal shop items op (rest van je bestaande code)
        let stmtShop = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? ORDER BY category, price');
        let shopItems = stmtShop.all(guildId);

        if (!shopItems || shopItems.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('🏪 Shop Leeg')
                .setDescription('Er zijn nog geen items in de shop! Een administrator kan items toevoegen via `/config shop add`.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // Groepeer items per categorie
        const categories = {};
        shopItems.forEach(item => {
            if (!categories[item.category]) {
                categories[item.category] = [];
            }
            categories[item.category].push(item);
        });

        // Maak de categorie select menu
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

        // Maak de embed voor de shop
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🏪 Server Shop')
            // Stap 2: Voeg de balans toe aan de beschrijving van de embed
            .setDescription(`Welkom bij de shop! Je hebt momenteel **€${userBalance.toLocaleString()}** contant. Kies een categorie om de items te bekijken en te kopen.`)
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