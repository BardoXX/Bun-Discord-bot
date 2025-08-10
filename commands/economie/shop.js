// commands/economie/shop.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Bekijk en koop items uit de shop'),

    async execute(interaction) {
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        let stmtUser = db.prepare('SELECT balance FROM users WHERE user_id = ? AND guild_id = ?');
        let userData = stmtUser.get(userId, guildId);

        if (!userData) {
            let insertStmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
            insertStmt.run(userId, guildId);
            userData = { balance: 0 };
        }
        
        const userBalance = userData.balance;

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

        const categories = {};
        shopItems.forEach(item => {
            if (!categories[item.category]) {
                categories[item.category] = [];
            }
            categories[item.category].push(item);
        });

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

// Export the handler functions
export async function handleShopInteraction(interaction) {
    // Handle different types of shop interactions
    if (interaction.isStringSelectMenu()) {
        return await handleShopSelectMenu(interaction);
    } else if (interaction.isButton()) {
        return await handleShopButton(interaction);
    }
}

export async function handleShopSelectMenu(interaction) {
    const selectedCategory = interaction.values[0];
    const db = interaction.client.db;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Get user balance
    let stmtUser = db.prepare('SELECT balance FROM users WHERE user_id = ? AND guild_id = ?');
    let userData = stmtUser.get(userId, guildId);

    if (!userData) {
        let insertStmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
        insertStmt.run(userId, guildId);
        userData = { balance: 0 };
    }

    const userBalance = userData.balance;

    // Get items in the selected category
    let stmtItems = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? AND category = ? ORDER BY price');
    let items = stmtItems.all(guildId, selectedCategory);

    if (!items || items.length === 0) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Geen Items')
            .setDescription(`Er zijn geen items in de categorie '${selectedCategory}'.`)
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        return;
    }

    // Create buttons for each item
    const buttons = [];
    const rows = [];
    
    items.forEach((item, index) => {
        const button = new ButtonBuilder()
            .setCustomId(`shop_buy_${item.id}`)
            .setLabel(`${item.name} (€${item.price})`)
            .setStyle('PRIMARY')
            .setDisabled(userBalance < item.price); // Disable if user can't afford
        
        buttons.push(button);
    });

    // Add buttons to action rows (max 5 buttons per row)
    for (let i = 0; i < buttons.length; i += 5) {
        const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
        rows.push(row);
    }

    // Add back button
    const backButton = new ButtonBuilder()
        .setCustomId('shop_back')
        .setLabel('Terug naar categorieën')
        .setStyle('SECONDARY');
    
    const backRow = new ActionRowBuilder().addComponents(backButton);
    rows.push(backRow);

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`🏪 ${selectedCategory} Items`)
        .setDescription(`Je hebt momenteel **€${userBalance.toLocaleString()}** contant. Klik op een item om het te kopen.`)
        .addFields(
            items.map(item => ({
                name: `${item.name} (€${item.price})`,
                value: item.description || 'Geen beschrijving beschikbaar.',
                inline: false
            }))
        )
        .setFooter({ text: `Categorie: ${selectedCategory}` })
        .setTimestamp();

    await interaction.update({ embeds: [embed], components: rows });
}

export async function handleShopButton(interaction) {
    const customId = interaction.customId;
    
    if (customId === 'shop_back') {
        // Go back to category selection
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        let stmtUser = db.prepare('SELECT balance FROM users WHERE user_id = ? AND guild_id = ?');
        let userData = stmtUser.get(userId, guildId);

        if (!userData) {
            let insertStmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
            insertStmt.run(userId, guildId);
            userData = { balance: 0 };
        }
        
        const userBalance = userData.balance;

        let stmtShop = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? ORDER BY category, price');
        let shopItems = stmtShop.all(guildId);

        const categories = {};
        shopItems.forEach(item => {
            if (!categories[item.category]) {
                categories[item.category] = [];
            }
            categories[item.category].push(item);
        });

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

        await interaction.update({ embeds: [embed], components: [row] });
    } else if (customId.startsWith('shop_buy_')) {
        // Handle item purchase
        const itemId = customId.replace('shop_buy_', '');
        await handleItemPurchase(interaction, itemId);
    }
}

async function handleItemPurchase(interaction, itemId) {
    const db = interaction.client.db;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Get the item details
    let stmtItem = db.prepare('SELECT * FROM shop_items WHERE id = ? AND guild_id = ?');
    let item = stmtItem.get(itemId, guildId);

    if (!item) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Item Niet Gevonden')
            .setDescription('Het gevraagde item kon niet worden gevonden.')
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        return;
    }

    // Get user balance
    let stmtUser = db.prepare('SELECT balance FROM users WHERE user_id = ? AND guild_id = ?');
    let userData = stmtUser.get(userId, guildId);

    if (!userData) {
        let insertStmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)');
        insertStmt.run(userId, guildId);
        userData = { balance: 0 };
    }

    // Check if user can afford the item
    if (userData.balance < item.price) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Onvoldoende Saldo')
            .setDescription(`Je hebt niet genoeg geld om ${item.name} te kopen. Het item kost €${item.price}, maar je hebt slechts €${userData.balance}.`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    // Deduct price from user balance
    const newBalance = userData.balance - item.price;
    let updateStmt = db.prepare('UPDATE users SET balance = ? WHERE user_id = ? AND guild_id = ?');
    updateStmt.run(newBalance, userId, guildId);

    // Log the purchase
    let logStmt = db.prepare('INSERT INTO purchase_logs (user_id, guild_id, item_id, item_name, price, timestamp) VALUES (?, ?, ?, ?, ?, ?)');
    logStmt.run(userId, guildId, item.id, item.name, item.price, new Date().toISOString());

    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Aankoop Succesvol')
        .setDescription(`Je hebt succesvol ${item.name} gekocht voor €${item.price}. Je nieuwe saldo is €${newBalance}.`)
        .addFields(
            { name: 'Item', value: item.name, inline: true },
            { name: 'Prijs', value: `€${item.price}`, inline: true },
            { name: 'Nieuw Saldo', value: `€${newBalance}`, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

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