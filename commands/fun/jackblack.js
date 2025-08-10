// commands/fun/jackblack.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const CARD_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 10, 'Q': 10, 'K': 10, 'A': 11
};

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const gameStates = new Map();

export async function handleBlackjackInteraction(interaction) {
    const customId = interaction.customId;
    const gameId = customId.split('_')[2]; // Extract gameId from customId
    
    // Check if game still exists
    if (!gameStates.has(gameId)) {
        try {
            if (!interaction.replied && !interaction.deferred) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Spel verlopen')
                    .setDescription('Het Blackjack spel is verlopen of is al afgerond.')
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], components: [], ephemeral: true });
            } else if (interaction.replied || interaction.deferred) {
                // If already replied, we can't send another response
                console.log(`⚠️ Blackjack interaction for expired game ${gameId} already acknowledged`);
            }
        } catch (error) {
            console.error(`❌ Error handling expired Blackjack game ${gameId}:`, error.message);
        }
        return;
    }
    
    const game = gameStates.get(gameId);
    const userId = interaction.user.id;
    
    // Verify the interaction is from the correct user
    if (game.userId !== userId) {
        try {
            if (!interaction.replied && !interaction.deferred) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Niet jouw spel')
                    .setDescription('Je kunt niet interageren met iemand anders zijn spel.')
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else if (interaction.replied || interaction.deferred) {
                // If already replied, we can't send another response
                console.log(`⚠️ Blackjack interaction from wrong user for game ${gameId} already acknowledged`);
            }
        } catch (error) {
            console.error(`❌ Error handling unauthorized Blackjack interaction for game ${gameId}:`, error.message);
        }
        return;
    }
    
    const db = interaction.client.db;
    let stmt;
    
    try {
        if (customId.startsWith('blackjack_hit')) {
            // Check if interaction is already acknowledged
            if (interaction.replied || interaction.deferred) {
                console.log(`⚠️ Blackjack hit interaction for game ${gameId} already acknowledged`);
                return;
            }
            
            // Defer the update to prevent timeout
            await interaction.deferUpdate();
            
            const playerValue = game.hit();
            
            if (game.result === 'bust') {
                // Player busts - update database
                stmt = db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?');
                stmt.run(game.bet, game.userId, game.guildId);
                
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('💥 Bust!')
                    .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${game.calculateHandValue(game.dealerHand)})
\nJe bent gebust en verliest €${game.bet.toLocaleString()}`)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed], components: [] });
                gameStates.delete(gameId);
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🃏 Blackjack')
                    .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString(true)}
\nWat wil je doen?`)
                    .setFooter({ text: `Inzet: €${game.bet.toLocaleString()}` })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
            }
        } else if (customId.startsWith('blackjack_stand')) {
            // Check if interaction is already acknowledged
            if (interaction.replied || interaction.deferred) {
                console.log(`⚠️ Blackjack stand interaction for game ${gameId} already acknowledged`);
                return;
            }
            
            // Defer the update to prevent timeout
            await interaction.deferUpdate();
            
            const { playerValue, dealerValue } = game.stand();
            
            let embed;
            let color;
            let winnings = 0;
            
            if (game.result === 'dealer_bust') {
                // Dealer busts - player wins
                winnings = game.bet;
                stmt = db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?');
                stmt.run(winnings, game.userId, game.guildId);
                
                color = '#00ff00';
                embed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle('🎉 Gewonnen!')
                    .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${dealerValue})
\nDe dealer is gebust! Je wint €${winnings.toLocaleString()}`)
                    .setTimestamp();
            } else if (game.result === 'win') {
                // Player wins
                winnings = game.bet;
                stmt = db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?');
                stmt.run(winnings, game.userId, game.guildId);
                
                color = '#00ff00';
                embed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle('🎉 Gewonnen!')
                    .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${dealerValue})
\nJe wint €${winnings.toLocaleString()}`)
                    .setTimestamp();
            } else if (game.result === 'lose') {
                // Player loses
                winnings = game.bet;
                stmt = db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?');
                stmt.run(winnings, game.userId, game.guildId);
                
                color = '#ff0000';
                embed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle('😔 Verloren')
                    .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${dealerValue})
\nDe dealer wint. Je verliest €${game.bet.toLocaleString()}`)
                    .setTimestamp();
            } else {
                // Push (tie)
                color = '#ffff00';
                embed = new EmbedBuilder()
                    .setColor(color)
                    .setTitle('🤝 Gelijkspel')
                    .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${dealerValue})
\nGelijkspel! Je krijgt je inzet terug.`)
                    .setTimestamp();
            }
            
            await interaction.editReply({ embeds: [embed], components: [] });
            gameStates.delete(gameId);
        }
    } catch (error) {
        console.error(`❌ Error handling Blackjack interaction for game ${gameId}:`, error.message);
        
        // Try to send error message if not already replied
        if (!interaction.replied && !interaction.deferred) {
            try {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Blackjack Fout')
                    .setDescription('Er is een fout opgetreden bij het verwerken van je Blackjack spel.')
                    .setTimestamp();
                
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            } catch (replyError) {
                console.error('❌ Failed to send Blackjack error message:', replyError.message);
            }
        }
    }
}

class BlackjackGame {
    constructor(userId, guildId, bet) {
        this.userId = userId;
        this.guildId = guildId;
        this.bet = bet;
        this.playerHand = [];
        this.dealerHand = [];
        this.deck = this.createDeck();
        this.shuffleDeck();
        this.gameOver = false;
        this.result = null;
    }

    createDeck() {
        const deck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ suit, rank });
            }
        }
        return deck;
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    dealCard() {
        return this.deck.pop();
    }

    dealInitialCards() {
        // Deal 2 cards to player and 2 to dealer
        this.playerHand.push(this.dealCard());
        this.dealerHand.push(this.dealCard());
        this.playerHand.push(this.dealCard());
        this.dealerHand.push(this.dealCard());
    }

    calculateHandValue(hand) {
        let value = 0;
        let aces = 0;

        for (const card of hand) {
            if (card.rank === 'A') {
                aces++;
                value += 11;
            } else {
                value += CARD_VALUES[card.rank];
            }
        }

        // Adjust for aces if value is over 21
        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }

        return value;
    }

    getPlayerHandString() {
        return this.playerHand.map(card => `${card.rank}${card.suit}`).join(' ');
    }

    getDealerHandString(hidden = false) {
        if (hidden) {
            return `${this.dealerHand[0].rank}${this.dealerHand[0].suit} ??`;
        }
        return this.dealerHand.map(card => `${card.rank}${card.suit}`).join(' ');
    }

    hit() {
        this.playerHand.push(this.dealCard());
        const playerValue = this.calculateHandValue(this.playerHand);
        
        if (playerValue > 21) {
            this.gameOver = true;
            this.result = 'bust';
        }
        
        return playerValue;
    }

    stand() {
        this.gameOver = true;
        let dealerValue = this.calculateHandValue(this.dealerHand);
        
        while (dealerValue < 17) {
            this.dealerHand.push(this.dealCard());
            dealerValue = this.calculateHandValue(this.dealerHand);
        }
        
        const playerValue = this.calculateHandValue(this.playerHand);
        
        if (dealerValue > 21) {
            this.result = 'dealer_bust';
        } else if (playerValue > dealerValue) {
            this.result = 'win';
        } else if (playerValue < dealerValue) {
            this.result = 'lose';
        } else {
            this.result = 'push';
        }
        
        return { playerValue, dealerValue };
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('jackblack')
        .setDescription('Speel een spelletje Blackjack')
        .addIntegerOption(option =>
            option.setName('inzet')
                .setDescription('Het bedrag dat je wilt inzetten')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        await interaction.deferReply();
        
        const db = interaction.client.db;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const bet = interaction.options.getInteger('inzet');
        
        let stmt = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?');
        let user = stmt.get(userId, guildId);
        
        if (!user) {
            stmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 1000, 0)');
            stmt.run(userId, guildId);
            user = { balance: 1000, bank: 0 };
        }
        
        if (user.balance < bet) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Onvoldoende saldo')
                .setDescription(`Je hebt niet genoeg geld! Je huidige saldo is €${user.balance.toLocaleString()}`)
                .setTimestamp();
            
            return await interaction.editReply({ embeds: [embed] });
        }
        
        const game = new BlackjackGame(userId, guildId, bet);
        game.dealInitialCards();
        
        const gameId = `${userId}-${guildId}`;
        gameStates.set(gameId, game);
        
        const playerValue = game.calculateHandValue(game.playerHand);
        if (playerValue === 21) {
            game.gameOver = true;
            game.result = 'blackjack';
            
            const winnings = Math.floor(bet * 1.5);
            stmt = db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?');
            stmt.run(winnings, userId, guildId);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎉 Blackjack!')
                .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (21)
**Dealer hand:** ${game.getDealerHandString()} (${game.calculateHandValue(game.dealerHand)})
\nJe wint €${winnings.toLocaleString()} met een natuurlijke Blackjack!`)
                .setTimestamp();
            
            gameStates.delete(gameId);
            return await interaction.editReply({ embeds: [embed] });
        }
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🃏 Blackjack')
            .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString(true)}
\nWat wil je doen?`)
            .addFields(
                { name: 'Hit', value: 'Neem een extra kaart', inline: true },
                { name: 'Stand', value: 'Stop met kaarten nemen', inline: true }
            )
            .setFooter({ text: `Inzet: €${bet.toLocaleString()}` })
            .setTimestamp();
        
        const response = await interaction.editReply({ 
            embeds: [embed],
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 1,
                            label: 'Hit',
                            custom_id: `blackjack_hit_${gameId}`
                        },
                        {
                            type: 2,
                            style: 2,
                            label: 'Stand',
                            custom_id: `blackjack_stand_${gameId}`
                        }
                    ]
                }
            ]
        });
        
        const filter = i => i.user.id === userId;
        const collector = response.createMessageComponentCollector({ filter, time: 60000 });
        
        collector.on('collect', async i => {
            if (!gameStates.has(gameId)) {
                await i.update({ components: [] });
                return;
            }
            
            const game = gameStates.get(gameId);
            
            if (i.customId.startsWith('blackjack_hit')) {
                const playerValue = game.hit();
                
                if (game.result === 'bust') {
                    stmt = db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?');
                    stmt.run(bet, userId, guildId);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('💥 Bust!')
                        .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${game.calculateHandValue(game.dealerHand)})
\nJe bent gebust en verliest €${bet.toLocaleString()}`)
                        .setTimestamp();
                    
                    await i.update({ embeds: [embed], components: [] });
                    gameStates.delete(gameId);
                } else {
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('🃏 Blackjack')
                        .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString(true)}
\nWat wil je doen?`)
                        .setFooter({ text: `Inzet: €${bet.toLocaleString()}` })
                        .setTimestamp();
                    
                    await i.update({ embeds: [embed] });
                }
            } else if (i.customId.startsWith('blackjack_stand')) {
                const { playerValue, dealerValue } = game.stand();
                
                let embed;
                let color;
                let winnings = 0;
                
                if (game.result === 'dealer_bust') {
                    winnings = bet;
                    stmt = db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?');
                    stmt.run(winnings, userId, guildId);
                    
                    color = '#00ff00';
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle('🎉 Gewonnen!')
                        .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${dealerValue})
\nDe dealer is gebust! Je wint €${winnings.toLocaleString()}`)
                        .setTimestamp();
                } else if (game.result === 'win') { 
                    winnings = bet;
                    stmt = db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?');
                    stmt.run(winnings, userId, guildId);
                    
                    color = '#00ff00';
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle('🎉 Gewonnen!')
                        .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${dealerValue})
\nJe wint €${winnings.toLocaleString()}`)
                        .setTimestamp();
                } else if (game.result === 'lose') {
                    winnings = -bet;
                    stmt = db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?');
                    stmt.run(winnings, userId, guildId);
                    
                    color = '#ff0000';
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle('😔 Verloren')
                        .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${dealerValue})
\nDe dealer wint. Je verliest €${bet.toLocaleString()}`)
                        .setTimestamp();
                } else {
                    // Push (tie)
                    color = '#ffff00';
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle('🤝 Gelijkspel')
                        .setDescription(`**Jouw hand:** ${game.getPlayerHandString()} (${playerValue})
**Dealer hand:** ${game.getDealerHandString()} (${dealerValue})
\nGelijkspel! Je krijgt je inzet terug.`)
                        .setTimestamp();
                }
                
                await i.update({ embeds: [embed], components: [] });
                gameStates.delete(gameId);
            }
        });
        
        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && gameStates.has(gameId)) {
                const game = gameStates.get(gameId);
                
                // Player loses due to timeout
                stmt = db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?');
                stmt.run(bet, userId, guildId);
                
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('⏰ Tijd verstreken')
                    .setDescription(`Je hebt te lang gedaan over je keuze. Je verliest €${bet.toLocaleString()}`)
                    .setTimestamp();
                
                try {
                    await interaction.editReply({ embeds: [embed], components: [] });
                } catch (error) {
                    console.error('Error updating message:', error);
                }
                
                gameStates.delete(gameId);
            }
        });
    },
};