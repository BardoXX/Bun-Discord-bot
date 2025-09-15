import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { EconomyWizard } from '../configuratie/economyWizard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Probeer geld te stelen van iemand of een bankoverval te plegen')
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Probeer geld te stelen van een gebruiker')
                .addUserOption(option =>
                    option.setName('gebruiker')
                        .setDescription('Wie wil je beroven?')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('bank')
                .setDescription('Pleeg een bankoverval (hoog risico, hoge beloning!)')
        ),

    async execute(interaction) {
        const { ensureFeatureEnabled } = await import('../utils/economyFeatures.js');
        if (!(await ensureFeatureEnabled(interaction, 'rob', 'rob'))) return;
        
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply();
            }
        } catch (e) {
            return;
        }

        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();
        
        try {
            const wizard = new EconomyWizard(db);
            const settings = await wizard.getGuildEcoSettings(guildId);
            
            // Helper to avoid double-acknowledging the interaction
            const respond = async (payload) => {
                try {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply(payload);
                    } else {
                        await interaction.reply(payload);
                    }
                } catch {}
            };

            // Check if rob is enabled
            if (!settings.rob_enabled) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('🚫 Rob is uitgeschakeld')
                    .setDescription('Het /rob commando is momenteel uitgeschakeld. Een beheerder kan dit aanzetten via `/config economie`.')
                    .setTimestamp();
                return await respond({ embeds: [embed] });
            }

            if (subcommand === 'user') {
                await handleRobUser(interaction, db, guildId, settings);
            } else if (subcommand === 'bank' && settings.bank_robbery_enabled) {
                await handleRobBank(interaction, db, guildId, settings);
            } else {
                await respond({ content: '❌ Ongeldig subcommando of bankberoving is uitgeschakeld.', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in rob command:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het uitvoeren van dit commando.')
                .setTimestamp();
            await respond({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};

async function handleRobUser(interaction, db, guildId, settings) {
    const robber = interaction.user;
    const targetUser = interaction.options.getUser('gebruiker');
    const respond = getResponder(interaction);
    const guild = interaction.guild;

    // Basic validations
    if (!targetUser) return await respond({ content: '❌ Ongeldige gebruiker.' });
    if (targetUser.bot) return await respond({ content: '❌ Je kunt geen bots beroven.' });
    if (targetUser.id === robber.id) return await respond({ content: '❌ Je kunt jezelf niet beroven.' });

    // Check if robber has required role if configured
    if (settings.rob_required_role) {
        const member = await guild.members.fetch(robber.id).catch(() => null);
        if (!member || !member.roles.cache.has(settings.rob_required_role)) {
            const requiredRole = guild.roles.cache.get(settings.rob_required_role)?.name || 'Speciale Rol';
            return await respond({
                content: `❌ Je hebt de rol **${requiredRole}** nodig om te kunnen beroven.`,
                ephemeral: true
            });
        }
    }

    // Ensure users exist in the database
    const ensureUser = (userId) => {
        let row = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
        if (!row) {
            db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 0, 0)').run(userId, guildId);
            row = { user_id: userId, guild_id: guildId, balance: 0, bank: 0, last_rob: null };
        }
        return row;
    };

    const robberRow = ensureUser(robber.id);
    const victimRow = ensureUser(targetUser.id);

    // Check cooldown
    const now = new Date();
    const lastRob = robberRow.last_rob ? new Date(robberRow.last_rob) : null;
    const cooldownMs = settings.rob_cooldown * 1000;
    
    if (lastRob && (now - lastRob < cooldownMs)) {
        const remaining = Math.ceil((cooldownMs - (now - lastRob)) / 1000);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        return await respond({ 
            content: `⏳ Je moet nog ${minutes > 0 ? `${minutes}m ` : ''}${seconds}s wachten voordat je opnieuw kunt beroven.` 
        });
    }

    // Check if victim has enough money
    const minAmount = settings.rob_min_amount || 100;
    if (victimRow.balance < minAmount) {
        return await respond({ 
            content: `❌ ${targetUser.username} heeft niet genoeg contant geld om te beroven (minimaal €${minAmount.toLocaleString()} nodig).` 
        });
    }

    // Calculate robbery amount (1% to maxPercent% of victim's balance, but at least minAmount)
    const maxPercent = Math.min(100, Math.max(1, settings.rob_max_percent || 30));
    const maxAmount = Math.min(
        Math.max(minAmount, Math.floor(victimRow.balance * (maxPercent / 100))),
        victimRow.balance
    );
    
    const stolenAmount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
    
    // Calculate base success rate and apply role bonuses
    let successRate = settings.rob_success_rate || 30;
    const member = await guild.members.fetch(robber.id).catch(() => null);
    
    // Apply role bonuses if any
    if (member && settings.rob_bonus_roles && settings.rob_bonus_roles.length > 0) {
        const bonusRoles = Array.isArray(settings.rob_bonus_roles) ? settings.rob_bonus_roles : [];
        const memberRoles = member.roles.cache;
        
        for (const role of bonusRoles) {
            if (memberRoles.has(role.roleId)) {
                successRate += role.bonus || 0;
            }
        }
    }
    
    // Ensure success rate is between 1-95%
    successRate = Math.max(1, Math.min(95, successRate));
    
    const success = Math.random() * 100 < successRate;
    
    if (success) {
        // Successful robbery
        db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?')
            .run(stolenAmount, targetUser.id, guildId);
        db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?')
            .run(stolenAmount, robber.id, guildId);
            
        // Update last rob time
        db.prepare('UPDATE users SET last_rob = ? WHERE user_id = ? AND guild_id = ?')
            .run(now.toISOString(), robber.id, guildId);
            
        const successEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('✅ Beroofd!')
            .setDescription(`Je hebt succesvol **€${stolenAmount.toLocaleString()}** gestolen van ${targetUser.username}!`)
            .addFields(
                { name: 'Kans op succes', value: `${Math.round(successRate)}%`, inline: true },
                { name: 'Volgende poging', value: `Over ${formatCooldown(settings.rob_cooldown)}`, inline: true }
            )
            .setFooter({ text: 'Gefeliciteerd met je succesvolle overval!' })
            .setTimestamp();
            
        await respond({ embeds: [successEmbed] });
        
        // Notify the victim if possible
        try {
            const dmChannel = await targetUser.createDM();
            await dmChannel.send({
                embeds: [new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('💸 Je bent beroofd!')
                    .setDescription(`**${robber.username}** heeft je zojuist beroofd van **€${stolenAmount.toLocaleString()}**!`)
                    .setTimestamp()
                ]
            });
        } catch {}
    } else {
        // Failed robbery - fine the robber
        const finePercent = Math.min(100, Math.max(0, settings.rob_fine_percent || 50));
        const fineAmount = Math.min(robberRow.balance, Math.floor(stolenAmount * (finePercent / 100)));
        
        if (fineAmount > 0) {
            db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?')
                .run(fineAmount, robber.id, guildId);
        }
        
        // Update last rob time
        db.prepare('UPDATE users SET last_rob = ? WHERE user_id = ? AND guild_id = ?')
            .run(now.toISOString(), robber.id, guildId);
            
        const failEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('❌ Betrapt!')
            .setDescription(
                `Je bent betrapt tijdens het beroven van ${targetUser.username}!\n` +
                `Je bent beboet met **€${fineAmount.toLocaleString()}** voor je poging tot diefstal.`
            )
            .addFields(
                { name: 'Kans op succes', value: `${Math.round(successRate)}%`, inline: true },
                { name: 'Volgende poging', value: `Over ${formatCooldown(settings.rob_cooldown)}`, inline: true }
            )
            .setFooter({ text: 'Wees voorzichtiger de volgende keer!' })
            .setTimestamp();
            
        await respond({ embeds: [failEmbed] });
    }
}

async function handleRobBank(interaction, db, guildId, settings) {
    const userId = interaction.user.id;
    const respond = getResponder(interaction);
    
    // Check if bank robbery is enabled
    if (!settings.bank_robbery_enabled) {
        return await respond({ 
            content: '❌ Bankberoving is momenteel uitgeschakeld door de serverbeheerder.',
            ephemeral: true
        });
    }

    // Get user data
    const userData = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId) || {
        user_id: userId,
        guild_id: guildId,
        balance: 0,
        bank: 0,
        last_bank_rob: null
    };

    // Check cooldown
    const now = new Date();
    const lastRob = userData.last_bank_rob ? new Date(userData.last_bank_rob) : null;
    const cooldownMs = settings.bank_robbery_cooldown * 1000; // Convert to milliseconds
    
    if (lastRob && (now - lastRob < cooldownMs)) {
        const remainingHours = Math.ceil((cooldownMs - (now - lastRob)) / 1000 / 3600);
        return await respond({ 
            content: `❌ Je moet nog ${remainingHours} uur wachten voordat je weer een bank kunt beroven.`,
            ephemeral: true
        });
    }

    // Check if user has enough money in the bank
    const minAmount = settings.bank_robbery_min_amount || 1000;
    if (userData.bank < minAmount) {
        return await respond({ 
            content: `❌ Je hebt minimaal €${minAmount.toLocaleString()} op de bank nodig om een bankoverval te plegen.`,
            ephemeral: true
        });
    }

    // Show confirmation embed
    const confirmEmbed = new EmbedBuilder()
        .setColor('#ffcc00')
        .setTitle('🏦 Bankoverval')
        .setDescription(
            'Weet je zeker dat je een bankoverval wilt plegen?\n\n' +
            `**Kans op succes:** ${(settings.bank_robbery_success_rate * 100).toFixed(1)}%\n` +
            `**Minimale inzet:** €${minAmount.toLocaleString()}\n` +
            `**Maximale winst:** €${settings.bank_robbery_max_amount.toLocaleString()}\n` +
            `**Gevangenisstraf bij falen:** ${formatCooldown(settings.bank_robbery_jail_time)}\n\n` +
            'Druk op de knop om de overval te bevestigen.'
        )
        .setFooter({ text: 'Dit is een risicovolle actie!' });

    const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_bank_rob')
        .setLabel('Bevestig Bankoverval')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(confirmButton);

    const response = await respond({ 
        embeds: [confirmEmbed], 
        components: [row],
        fetchReply: true 
    });

    try {
        // Wait for button click
        const confirmation = await response.awaitMessageComponent({ 
            filter: i => i.user.id === userId,
            componentType: ComponentType.Button,
            time: 30000 // 30 seconds
        });

        if (confirmation.customId === 'confirm_bank_rob') {
            // Get fresh user data after confirmation
            const updatedUser = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId) || userData;
            
            // Check if user still has enough money
            if (updatedUser.bank < minAmount) {
                await confirmation.update({ 
                    content: '❌ Je hebt niet genoeg geld meer op de bank voor een overval.',
                    components: [],
                    embeds: []
                });
                return;
            }

            // Calculate potential reward (random amount between min and max)
            const minReward = Math.min(settings.bank_robbery_min_amount, updatedUser.bank);
            const maxReward = Math.min(settings.bank_robbery_max_amount, updatedUser.bank);
            const potentialReward = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;
            
            // Determine success (based on success rate)
            const success = Math.random() < settings.bank_robbery_success_rate;
            
            // Update last bank rob time
            db.prepare('UPDATE users SET last_bank_rob = ? WHERE user_id = ? AND guild_id = ?')
                .run(now.toISOString(), userId, guildId);

            if (success) {
                // Successful robbery - add reward to user's balance
                db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?')
                    .run(potentialReward, userId, guildId);

                const successEmbed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('🏦 Bankoverval Geslaagd!')
                    .setDescription(`Je hebt succesvol **€${potentialReward.toLocaleString()}** gestolen van de bank!`)
                    .addFields(
                        { name: 'Kans op succes', value: `${(settings.bank_robbery_success_rate * 100).toFixed(1)}%`, inline: true },
                        { name: 'Volgende poging', value: `Over ${formatCooldown(settings.bank_robbery_cooldown)}`, inline: true }
                    )
                    .setFooter({ text: 'Gefeliciteerd met je succesvolle bankoverval!' })
                    .setTimestamp();

                await confirmation.update({ 
                    embeds: [successEmbed],
                    components: []
                });
            } else {
                // Failed robbery - jail time!
                const jailTime = settings.bank_robbery_jail_time || 7200; // Default to 2 hours
                const jailEnd = new Date(now.getTime() + (jailTime * 1000));
                
                // Update user's jail status
                db.prepare(`
                    INSERT OR REPLACE INTO user_jail 
                    (user_id, guild_id, reason, issued_by, issued_at, expires_at) 
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                    userId, 
                    guildId, 
                    'Mislukte bankoverval', 
                    interaction.client.user.id, 
                    now.toISOString(), 
                    jailEnd.toISOString()
                );

                const failEmbed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('🚨 Bankoverval Mislukt!')
                    .setDescription('De politie heeft je gepakt tijdens de bankoverval! Je bent naar de gevangenis gestuurd.')
                    .addFields(
                        { name: 'Gevangenisstraf', value: formatCooldown(jailTime), inline: true },
                        { name: 'Vrijlating', value: `<t:${Math.floor(jailEnd.getTime() / 1000)}:R>`, inline: true }
                    )
                    .setFooter({ text: 'Probeer het later nog eens!' })
                    .setTimestamp();

                await confirmation.update({ 
                    embeds: [failEmbed],
                    components: []
                });
            }
        }
    } catch (error) {
        // User didn't click the button in time or there was an error
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            await response.edit({ 
                content: 'Bankoverval geannuleerd wegens inactiviteit.',
                components: []
            });
        } else {
            console.error('Bank robbery error:', error);
            await response.edit({ 
                content: 'Er is een fout opgetreden bij het verwerken van de bankoverval.',
                components: []
            });
        }
    }
}

// Helper function to format cooldown in a human-readable format
function formatCooldown(seconds) {
    if (!seconds) return '0s';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}u`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if ((secs > 0 || parts.length === 0) && days === 0) parts.push(`${secs}s`);
    
    return parts.join(' ') || '0s';
}

// Helper function to get the appropriate responder
function getResponder(interaction) {
    return async function(payload) {
        try {
            if (interaction.deferred || interaction.replied) {
                return await interaction.editReply(payload);
            } else {
                return await interaction.reply(payload);
            }
        } catch (error) {
            console.error('Error responding to interaction:', error);
        }
    };
}
