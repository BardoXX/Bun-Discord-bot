import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const name = 'shopInteraction';

export async function handleShopInteraction(interaction) {
    const startTime = Date.now();
    
    try {
        const db = interaction.client.db;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        console.log(`🛒 [${name}] Handling interaction: ${interaction.customId} for user ${interaction.user.tag}`);

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'shop_category') {
                const selectedCategory = interaction.values[0];
                console.log(`📂 [${name}] Category selected: ${selectedCategory}`);
                
                // Check if already deferred, if not defer now
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
                await showCategoryItems(interaction, selectedCategory, db, guildId);
            } else if (interaction.customId === 'shop_item_select') {
                const selectedItemId = interaction.values[0];
                console.log(`📦 [${name}] Item selected: ${selectedItemId}`);
                
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
                await showItemDetails(interaction, selectedItemId, db, guildId, userId);
            }
        } else if (interaction.isButton()) {
            if (interaction.customId.startsWith('shop_buy_')) {
                // First acknowledge the interaction if not already done
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
                
                const itemId = interaction.customId.replace('shop_buy_', '');
                console.log(`💰 [${name}] Purchase attempt for item: ${itemId}`);
                await buyItem(interaction, itemId, db, guildId, userId);
            } else if (interaction.customId === 'shop_back_to_categories') {
                console.log(`🔙 [${name}] Returning to main shop`);
                
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
                await showMainShop(interaction, db, guildId);
            } else if (interaction.customId.startsWith('shop_back_to_category_')) {
                const category = interaction.customId.replace('shop_back_to_category_', '');
                console.log(`🔙 [${name}] Returning to category: ${category}`);
                
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
                await showCategoryItems(interaction, category, db, guildId);
            }
        }

        const processingTime = Date.now() - startTime;
        console.log(`✅ [${name}] Interaction processed successfully in ${processingTime}ms`);

    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`❌ [${name}] Error after ${processingTime}ms:`, {
            error: error.message,
            code: error.code,
            customId: interaction.customId,
            user: interaction.user.tag,
            guild: interaction.guild.name,
            replied: interaction.replied,
            deferred: interaction.deferred
        });
        
        // Only try to respond if we haven't already and it's not a known Discord API error
        if (!interaction.replied && !interaction.deferred && 
            error.code !== 10062 && // Unknown interaction
            error.code !== 40060 && // Interaction has already been acknowledged
            error.code !== 10008) {  // Unknown message
            
            try {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Shop Fout')
                    .setDescription('Er is een fout opgetreden bij het verwerken van de shop interactie.')
                    .setTimestamp();
                
                await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            } catch (replyError) {
                console.error(`❌ [${name}] Failed to send error message:`, replyError.message);
            }
        }
    }
}

async function showMainShop(interaction, db, guildId) {
    console.log(`🏪 [${name}] Showing main shop for guild: ${interaction.guild.name}`);
    
    let stmt = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? ORDER BY category, price');
    let shopItems = stmt.all(guildId);

    if (!shopItems || shopItems.length === 0) {
        console.log(`⚠️ [${name}] No shop items found for guild: ${interaction.guild.name}`);
        
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('🏪 Shop Leeg')
            .setDescription('Er zijn nog geen items in de shop!')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], components: [] });
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

    console.log(`📊 [${name}] Found ${Object.keys(categories).length} categories with ${shopItems.length} total items`);

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

    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function showCategoryItems(interaction, category, db, guildId) {
    let stmt = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? AND category = ? ORDER BY price');
    let items = stmt.all(guildId, category);

    if (!items || items.length === 0) {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle(`🏪 ${category} - Geen Items`)
            .setDescription('Er zijn geen items in deze categorie.')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], components: [] });
        return;
    }

    // Create item select menu
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('shop_item_select')
        .setPlaceholder('Kies een item...');

    items.forEach(item => {
        selectMenu.addOptions({
            label: item.name,
            value: item.id.toString(),
            description: `💰 ${item.price} coins`,
            emoji: '📦'
        });
    });

    // Back button
    const backButton = new ButtonBuilder()
        .setCustomId('shop_back_to_categories')
        .setLabel('🔙 Terug naar categorieën')
        .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(backButton);

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`🏪 ${category}`)
        .setDescription(`Items in de categorie **${category}**:`)
        .addFields(
            items.map(item => ({
                name: `📦 ${item.name}`,
                value: `💰 ${item.price} coins${item.description ? `\n${item.description}` : ''}`,
                inline: true
            }))
        )
        .setFooter({ text: 'Selecteer een item voor meer details' })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

async function showItemDetails(interaction, itemId, db, guildId, userId) {
    let stmt = db.prepare('SELECT * FROM shop_items WHERE id = ? AND guild_id = ?');
    let item = stmt.get(itemId, guildId);

    if (!item) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Item niet gevonden.')
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed], components: [] });
        return;
    }

    // Get user's current balance
    stmt = db.prepare('SELECT balance FROM economy WHERE user_id = ? AND guild_id = ?');
    let economy = stmt.get(userId, guildId);
    const userBalance = economy ? economy.balance : 0;

    // Create buttons
    const buyButton = new ButtonBuilder()
        .setCustomId(`shop_buy_${itemId}`)
        .setLabel(`💰 Koop voor ${item.price} coins`)
        .setStyle(userBalance >= item.price ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(userBalance < item.price);

    const backButton = new ButtonBuilder()
        .setCustomId(`shop_back_to_category_${item.category}`)
        .setLabel('🔙 Terug naar categorie')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(buyButton, backButton);

    const embed = new EmbedBuilder()
        .setColor(userBalance >= item.price ? '#00ff00' : '#ff9900')
        .setTitle(`📦 ${item.name}`)
        .setDescription(item.description || 'Geen beschrijving beschikbaar.')
        .addFields(
            { name: '💰 Prijs', value: `${item.price} coins`, inline: true },
            { name: '📂 Categorie', value: item.category, inline: true },
            { name: '💳 Jouw saldo', value: `${userBalance} coins`, inline: true }
        )
        .setFooter({ 
            text: userBalance >= item.price ? 'Je hebt genoeg coins!' : 'Je hebt niet genoeg coins.' 
        })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function buyItem(interaction, itemId, db, guildId, userId) {
    console.log(`💳 [${name}] Processing purchase for item ${itemId} by user ${interaction.user.tag}`);
    
    // Get item details
    let stmt = db.prepare('SELECT * FROM shop_items WHERE id = ? AND guild_id = ?');
    let item = stmt.get(itemId, guildId);

    if (!item) {
        console.log(`❌ [${name}] Item ${itemId} not found in guild ${interaction.guild.name}`);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Item niet gevonden.')
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed], components: [] });
        return;
    }

    console.log(`📦 [${name}] Found item: ${item.name} (${item.price} coins)`);

    // Get user's current balance
    stmt = db.prepare('SELECT balance FROM economy WHERE user_id = ? AND guild_id = ?');
    let economy = stmt.get(userId, guildId);
    const userBalance = economy ? economy.balance : 0;

    console.log(`💰 [${name}] User balance: ${userBalance} coins, item price: ${item.price} coins`);

    if (userBalance < item.price) {
        console.log(`❌ [${name}] Insufficient funds for user ${interaction.user.tag}`);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Onvoldoende Saldo')
            .setDescription(`Je hebt **${item.price - userBalance}** coins te weinig om dit item te kopen.`)
            .addFields(
                { name: '💰 Prijs', value: `${item.price} coins`, inline: true },
                { name: '💳 Jouw saldo', value: `${userBalance} coins`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed], components: [] });
        return;
    }

    try {
        console.log(`🔄 [${name}] Starting database transaction`);
        
        // Start transaction
        db.exec('BEGIN TRANSACTION');

        // Deduct money from user
        if (economy) {
            stmt = db.prepare('UPDATE economy SET balance = balance - ? WHERE user_id = ? AND guild_id = ?');
            stmt.run(item.price, userId, guildId);
        } else {
            stmt = db.prepare('INSERT INTO economy (user_id, guild_id, balance) VALUES (?, ?, ?)');
            stmt.run(userId, guildId, -item.price);
        }

        // Add item to user's inventory (including boosters)
        stmt = db.prepare('INSERT OR IGNORE INTO user_inventory (user_id, guild_id, item_id, quantity) VALUES (?, ?, ?, 0)');
        stmt.run(userId, guildId, itemId);
        
        stmt = db.prepare('UPDATE user_inventory SET quantity = quantity + 1 WHERE user_id = ? AND guild_id = ? AND item_id = ?');
        stmt.run(userId, guildId, itemId);

        // If it's a booster, add to user's active boosters
        if (item.type === 'multiplier' || item.category === 'Boosters') {
            const multiplierValue = item.data ? parseFloat(item.data) : 1.5; // Default 1.5x multiplier
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
            
            stmt = db.prepare(`
                INSERT INTO user_boosters (user_id, guild_id, type, multiplier, expires_at, active)
                VALUES (?, ?, ?, ?, ?, 1)
            `);
            stmt.run(userId, guildId, 'xp', multiplierValue, expiresAt.toISOString());
        }

        // Commit transaction
        db.exec('COMMIT');
        
        console.log(`✅ [${name}] Purchase completed successfully for ${interaction.user.tag}`);

        const successEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Aankoop Succesvol!')
            .setDescription(`Je hebt succesvol **${item.name}** gekocht voor **${item.price}** coins!`)
            .addFields(
                { name: '📦 Item', value: item.name, inline: true },
                { name: '💰 Betaald', value: `${item.price} coins`, inline: true },
                { name: '💳 Nieuw saldo', value: `${userBalance - item.price} coins`, inline: true }
            )
            .setTimestamp();

        // Add special message for boosters
        if (item.type === 'multiplier' || item.category === 'Boosters') {
            successEmbed.addFields({
                name: '⚡ Booster Geactiveerd!',
                value: `Je XP booster is nu actief voor 24 uur!`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [successEmbed], components: [] });

        // After 3 seconds, return to category view
        setTimeout(async () => {
            try {
                await showCategoryItems(interaction, item.category, db, guildId);
            } catch (error) {
                console.error(`❌ [${name}] Error returning to category view:`, error.message);
            }
        }, 3000);

    } catch (error) {
        // Rollback transaction on error
        try {
            db.exec('ROLLBACK');
        } catch (rollbackError) {
            console.error(`❌ [${name}] Rollback failed:`, rollbackError);
        }
        
        console.error(`❌ [${name}] Database error during purchase:`, error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Er is een fout opgetreden bij het kopen van dit item.')
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
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