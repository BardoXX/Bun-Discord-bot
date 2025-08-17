import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Probeer geld te stelen van iemand (cooldown: 1 uur)')
        .addUserOption(option =>
            option.setName('gebruiker')
                .setDescription('Wie wil je beroven?')
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply();
            }
        } catch (e) {
            // If the interaction is unknown or already acknowledged, bail out silently
            return;
        }

        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const robber = interaction.user;
        const targetUser = interaction.options.getUser('gebruiker');

        try {
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

            // Ensure guild_config table and rob_enabled column exist to avoid 'no such table/column' errors
            db.prepare('CREATE TABLE IF NOT EXISTS guild_config (guild_id TEXT PRIMARY KEY)').run();
            const guildCols = db.prepare('PRAGMA table_info(guild_config)').all().map(c => c.name);
            if (!guildCols.includes('rob_enabled')) {
                db.prepare('ALTER TABLE guild_config ADD COLUMN rob_enabled INTEGER').run();
            }

            // Toggle check via guild_config.rob_enabled (default = UIT totdat /config economy is gebruikt)
            let cfg = db.prepare('SELECT rob_enabled FROM guild_config WHERE guild_id = ?').get(guildId);
            if (!cfg) {
                db.prepare('INSERT INTO guild_config (guild_id, rob_enabled) VALUES (?, 0)').run(guildId);
                cfg = { rob_enabled: 0 };
            }
            if (cfg.rob_enabled === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('🚫 Rob is uitgeschakeld')
                    .setDescription('Het /rob commando is momenteel uitgeschakeld. Een beheerder kan dit aanzetten via `/config economy`.')
                    .setTimestamp();
                await respond({ embeds: [embed] });
                return;
            }

            // Self/bot checks
            if (!targetUser) {
                await respond({ content: '❌ Ongeldige gebruiker.' });
                return;
            }
            if (targetUser.bot) {
                await respond({ content: '❌ Je kunt geen bots beroven.' });
                return;
            }
            if (targetUser.id === robber.id) {
                await respond({ content: '❌ Je kunt jezelf niet beroven.' });
                return;
            }

            // Ensure last_rob column exists on users
            const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
            if (!userCols.includes('last_rob')) {
                db.prepare('ALTER TABLE users ADD COLUMN last_rob DATETIME').run();
            }

            // Ensure both users exist
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

            // Cooldown 1 uur
            const now = new Date();
            const lastRob = robberRow.last_rob ? new Date(robberRow.last_rob) : null;
            const cooldownMs = 60 * 60 * 1000;
            if (lastRob && (now - lastRob) < cooldownMs) {
                const left = cooldownMs - (now - lastRob);
                const minutes = Math.ceil(left / (60 * 1000));
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⏰ Cooldown actief')
                    .setDescription(`Je moet nog **${minutes} minuten** wachten voordat je weer kunt roven.`)
                    .setTimestamp();
                await respond({ embeds: [embed] });
                return;
            }

            // Victim must have at least €200 cash
            const victimBalance = Number(victimRow.balance || 0);
            if (victimBalance < 200) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('💼 Geen buit')
                    .setDescription(`${targetUser} heeft niet genoeg contant geld om te beroven (minimaal €200).`)
                    .setTimestamp();
                await respond({ embeds: [embed] });
                return;
            }

            const success = Math.random() < 0.5; // 50%
            let embed;

            if (success) {
                // 10–30% van slachtoffer, clamp €50–€1.500 en niet meer dan saldo
                const pct = 0.10 + Math.random() * 0.20;
                let amount = Math.floor(victimBalance * pct);
                amount = Math.max(50, Math.min(1500, amount, victimBalance));

                // Transfer victim -> robber
                db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?')
                    .run(amount, targetUser.id, guildId);
                db.prepare('UPDATE users SET balance = balance + ?, last_rob = ? WHERE user_id = ? AND guild_id = ?')
                    .run(amount, now.toISOString(), robber.id, guildId);

                const newRobber = db.prepare('SELECT balance FROM users WHERE user_id = ? AND guild_id = ?').get(robber.id, guildId);
                const newVictim = db.prepare('SELECT balance FROM users WHERE user_id = ? AND guild_id = ?').get(targetUser.id, guildId);

                embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('🕵️‍♂️ Overval geslaagd!')
                    .setDescription(`${robber} heeft succesvol **€${amount.toLocaleString()}** gestolen van ${targetUser}!`)
                    .addFields(
                        { name: '💰 Jouw nieuw contant saldo', value: `€${Number(newRobber.balance).toLocaleString()}`, inline: true },
                        { name: '💸 Slachtoffer nieuw contant saldo', value: `€${Number(newVictim.balance).toLocaleString()}`, inline: true },
                        { name: '⏰ Volgende poging', value: 'Over 1 uur', inline: false }
                    )
                    .setTimestamp();
            } else {
                // Fine 10–20% van robber, naar victim
                const robberBalance = Number(robberRow.balance || 0);
                db.prepare('UPDATE users SET last_rob = ? WHERE user_id = ? AND guild_id = ?')
                    .run(now.toISOString(), robber.id, guildId);

                if (robberBalance <= 0) {
                    embed = new EmbedBuilder()
                        .setColor('#ff9900')
                        .setTitle('🚔 Gepakt… maar je had niks')
                        .setDescription(`Je poging is mislukt, maar je had geen geld om boete te betalen. Volgende keer beter!`)
                        .addFields({ name: '⏰ Volgende poging', value: 'Over 1 uur', inline: false })
                        .setTimestamp();
                } else {
                    const pct = 0.10 + Math.random() * 0.10; // 10–20%
                    let fine = Math.floor(robberBalance * pct);
                    fine = Math.max(1, fine); // min €1 als je geld had

                    db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ? AND guild_id = ?')
                        .run(fine, robber.id, guildId);
                    db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ? AND guild_id = ?')
                        .run(fine, targetUser.id, guildId);

                    const newRobber = db.prepare('SELECT balance FROM users WHERE user_id = ? AND guild_id = ?').get(robber.id, guildId);
                    const newVictim = db.prepare('SELECT balance FROM users WHERE user_id = ? AND guild_id = ?').get(targetUser.id, guildId);

                    embed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('🚔 Overval mislukt!')
                        .setDescription(`${robber} is gepakt tijdens het roven van ${targetUser} en moest **€${fine.toLocaleString()}** boete betalen!`)
                        .addFields(
                            { name: '💵 Jouw nieuw contant saldo', value: `€${Number(newRobber.balance).toLocaleString()}`, inline: true },
                            { name: '💸 Slachtoffer nieuw contant saldo', value: `€${Number(newVictim.balance).toLocaleString()}`, inline: true },
                            { name: '⏰ Volgende poging', value: 'Over 1 uur', inline: false }
                        )
                        .setTimestamp();
                }
            }

            await respond({ embeds: [embed] });

        } catch (error) {
            console.error('❌ Error in rob command:', error);
            try {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Fout')
                    .setDescription('Er ging iets mis bij het uitvoeren van /rob.')
                    .setTimestamp();
                if (interaction && (interaction.deferred || interaction.replied)) {
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } catch {}
        }
    },
};