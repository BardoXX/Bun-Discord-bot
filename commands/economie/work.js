import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const fallbackJobs = [
    // Used only to seed eco_jobs if empty
    { name: 'Tuinman', min: 80, max: 160, level: 1, premium: 0, required_role_id: null },
    { name: 'Kassamedewerker', min: 120, max: 240, level: 2, premium: 0, required_role_id: null },
    { name: 'Beveiliging', min: 200, max: 350, level: 3, premium: 1, required_role_id: null },
];

function ensureEcoJobsSeeded(db, guildId) {
    try {
        const count = db.prepare('SELECT COUNT(*) as c FROM eco_jobs WHERE guild_id = ?').get(guildId)?.c || 0;
        if (count === 0) {
            const insert = db.prepare(`
                INSERT INTO eco_jobs (guild_id, name, min_payout, max_payout, min_level, premium, required_role_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            for (const j of fallbackJobs) {
                insert.run(guildId, j.name, j.min, j.max, j.level, j.premium ? 1 : 0, j.required_role_id);
            }
        }
    } catch {}
}

function loadGuildJobs(db, guildId) {
    ensureEcoJobsSeeded(db, guildId);
    const rows = db.prepare('SELECT name, min_payout, max_payout, min_level, premium, required_role_id FROM eco_jobs WHERE guild_id = ?').all(guildId) || [];
    return rows.map(r => ({
        name: r.name,
        min: r.min_payout,
        max: r.max_payout,
        level: r.min_level ?? 1,
        premium: !!r.premium,
        required_role_id: r.required_role_id || null,
    }));
}

function passesGating(job, userLevel, member, gateMode) {
    const hasLevel = (job.level ?? 0) <= userLevel;
    const hasRole = !job.required_role_id || (member?.roles?.cache?.has?.(job.required_role_id));
    switch ((gateMode || 'level').toLowerCase()) {
        case 'role': return hasRole;
        case 'both': return hasLevel && hasRole;
        case 'level':
        default: return hasLevel;
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Werk om geld te verdienen (cooldown ingesteld door server)')
        .addStringOption(option =>
            option.setName('job')
                .setDescription('Kies welke job je wilt doen')
                .setRequired(false)),

    async execute(interaction) {
        const db = interaction.client.db;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const requestedJob = interaction.options.getString('job');

        try {
            // Check user data
            let stmt = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?');
            let userData = stmt.get(userId, guildId);

            if (!userData) {
                stmt = db.prepare('INSERT INTO users (user_id, guild_id, balance, bank) VALUES (?, ?, 1000, 0)');
                stmt.run(userId, guildId);
                userData = { balance: 1000, bank: 0, last_work: null };
            }

            // Guild config
            let cfg = {};
            try {
                cfg = db.prepare('SELECT eco_work_cooldown_minutes, eco_work_gate_mode, eco_work_allow_multipliers FROM guild_config WHERE guild_id = ?').get(guildId) || {};
            } catch {}

            // Check cooldown (configurable minutes, default 60)
            const now = new Date();
            const lastWork = userData.last_work ? new Date(userData.last_work) : null;
            const cooldownMinutes = Number(cfg.eco_work_cooldown_minutes ?? 60);
            const cooldownTime = Math.max(1, cooldownMinutes) * 60 * 1000;

            if (lastWork && (now - lastWork) < cooldownTime) {
                const timeLeft = cooldownTime - (now - lastWork);
                const minutesLeft = Math.ceil(timeLeft / (60 * 1000));

                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('⏰ Cooldown Actief')
                    .setDescription(`Je moet nog **${minutesLeft} minuten** wachten voordat je weer kunt werken!`)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                return;
            }

            // Load jobs from eco_jobs (seed defaults if empty)
            const inventoryJobs = [];
            try {
                // Optional: include owned job items from shop as additional jobs
                const inventoryStmt = db.prepare(`
                    SELECT s.name AS item_name, s.item_data AS item_data, s.type AS item_type
                    FROM user_inventory u
                    JOIN shop_items s ON u.item_id = s.id
                    WHERE u.user_id = ? AND u.guild_id = ? AND s.type = 'job'
                `);
                const ownedJobs = inventoryStmt.all(userId, guildId);
                ownedJobs.forEach(job => {
                    if (job.item_data) {
                        try {
                            const jobData = JSON.parse(job.item_data);
                            inventoryJobs.push({ name: job.item_name, min: jobData.min || 100, max: jobData.max || 300, level: jobData.level || 1, required_role_id: null });
                        } catch {
                            inventoryJobs.push({ name: job.item_name, min: 100, max: 300, level: 1, required_role_id: null });
                        }
                    }
                });
            } catch {}

            const guildJobs = loadGuildJobs(db, guildId);
            const unlockedJobs = [...guildJobs, ...inventoryJobs];

            // Determine user level to gate jobs
            let userLevel = 1;
            try {
                const levelRow = db.prepare('SELECT level FROM user_levels WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
                if (levelRow && levelRow.level !== undefined && levelRow.level !== null) {
                    const lvl = Number(levelRow.level);
                    if (Number.isFinite(lvl)) userLevel = Math.max(0, lvl);
                }
            } catch {}

            const gateMode = (cfg.eco_work_gate_mode || 'level');
            const availableJobs = unlockedJobs.filter(j => passesGating(j, userLevel, interaction.member, gateMode));
            const lockedJobs = unlockedJobs.filter(j => !passesGating(j, userLevel, interaction.member, gateMode));

            // Job selectie
            let selectedJob;
            if (requestedJob) {
                selectedJob = availableJobs.find(job => job.name.toLowerCase().includes(requestedJob.toLowerCase()));

                if (!selectedJob) {
                    const embed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Job Niet Beschikbaar')
                        .setDescription('De opgegeven job is niet beschikbaar op jouw level of bestaat niet.')
                        .addFields(
                            { name: 'Beschikbare jobs', value: availableJobs.map(j => `• ${j.name} (€${j.min}-${j.max})`).join('\n') || 'Geen', inline: false },
                            lockedJobs.length ? { name: 'Vergrendelde jobs', value: lockedJobs.map(j => `• ${j.name} (vereist level ${j.level})`).join('\n'), inline: false } : null,
                        ).setTimestamp();
                    // Filter out null field if no locked jobs
                    embed.data.fields = (embed.data.fields || []).filter(Boolean);

                    await interaction.reply({ embeds: [embed] });
                    return;
                }
            } else {
                // Show a select menu to choose a job based on gating
                if (availableJobs.length === 0) {
                    const embed = new EmbedBuilder()
                        .setColor('#ffcc00')
                        .setTitle('🔒 Geen beschikbare jobs')
                        .setDescription('Er zijn momenteel geen jobs beschikbaar voor jouw level/rol instellingen.')
                        .addFields(
                            lockedJobs.length ? { name: 'Vergrendelde jobs', value: lockedJobs.map(j => `• ${j.name}${j.level ? ` (level ${j.level})` : ''}${j.required_role_id ? ' (rol vereist)' : ''}`).join('\n') || 'Geen', inline: false } : null,
                        )
                        .setFooter({ text: 'Tip: verhoog je level of pas gating-instellingen aan in de configuratie.' })
                        .setTimestamp();
                    embed.data.fields = (embed.data.fields || []).filter(Boolean);
                    await interaction.reply({ embeds: [embed] });
                    return;
                }
                const select = new StringSelectMenuBuilder()
                    .setCustomId('work_select')
                    .setPlaceholder('Kies een job…')
                    .setMinValues(1)
                    .setMaxValues(1);

                availableJobs.slice(0, 25).forEach(j => {
                    select.addOptions({
                        label: j.name,
                        value: j.name,
                        description: `€${j.min}-${j.max}${j.level ? ` • level ${j.level}` : ''}${j.required_role_id ? ' • rol vereist' : ''}`
                    });
                });

                const row = new ActionRowBuilder().addComponents(select);
                const embed = new EmbedBuilder()
                    .setColor('#00b5ff')
                    .setTitle('💼 Kies je job')
                    .setDescription(`Jouw level: **${userLevel}**. Kies hieronder een job om te werken.`)
                    .addFields(
                        { name: 'Beschikbaar', value: availableJobs.map(j => `• ${j.name} (€${j.min}-${j.max})`).join('\n') || 'Geen', inline: false },
                        lockedJobs.length ? { name: 'Vergrendeld', value: lockedJobs.map(j => `• ${j.name}${j.level ? ` (level ${j.level})` : ''}${j.required_role_id ? ' (rol vereist)' : ''}`).join('\n') || 'Geen', inline: false } : null,
                    )
                    .setFooter({ text: 'Je kunt later nieuwe jobs kopen of vrijspelen.' })
                    .setTimestamp();
                embed.data.fields = (embed.data.fields || []).filter(Boolean);

                await interaction.reply({ embeds: [embed], components: [row] });
                return;
            }

            // Calculate earnings with multipliers (respect guild flag)
            let baseEarnings = Math.floor(Math.random() * (selectedJob.max - selectedJob.min + 1)) + selectedJob.min;
            let totalMultiplier = 1;
            const allowMultipliers = !!(cfg && (cfg.eco_work_allow_multipliers === 1 || cfg.eco_work_allow_multipliers === true));
            if (allowMultipliers) {
                try {
                    const multiplierStmt = db.prepare(`
                        SELECT item_data FROM user_inventory ui
                        JOIN shop_items si ON ui.item_id = si.id
                        WHERE ui.user_id = ? AND ui.guild_id = ? AND si.type = 'multiplier'
                    `);
                    const multipliers = multiplierStmt.all(userId, guildId);
                    multipliers.forEach(mult => {
                        if (mult.item_data) {
                            try {
                                const multiplierData = JSON.parse(mult.item_data);
                                totalMultiplier += (multiplierData.value || 0);
                            } catch {
                                totalMultiplier += parseFloat(mult.item_data) || 0;
                            }
                        }
                    });
                } catch {}
            }

            const finalEarnings = Math.floor(baseEarnings * totalMultiplier);

            // Update balance and last_work time with proper type handling
            stmt = db.prepare('UPDATE users SET balance = balance + ?, last_work = ? WHERE user_id = ? AND guild_id = ?');
            stmt.run(Number(finalEarnings), now.toISOString(), userId, guildId);

            // LOG JOB HISTORY - This is the new part!
            try {
                const historyStmt = db.prepare(`
                    INSERT INTO job_history (user_id, guild_id, job_name, base_earnings, multiplier, final_earnings, job_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                historyStmt.run(
                    userId, 
                    guildId, 
                    selectedJob.name, 
                    baseEarnings, 
                    totalMultiplier, 
                    finalEarnings, 
                    selectedJob.level > 0 ? 'premium' : 'default'
                );
                console.log(`📝 [work] Logged job history: ${interaction.user.tag} worked as ${selectedJob.name} for €${finalEarnings}`);
            } catch (historyError) {
                console.error('❌ Failed to log job history:', historyError);
                // Don't fail the command if history logging fails
            }

            // Get total work count for user
            let workCount = 0;
            try {
                const countStmt = db.prepare('SELECT COUNT(*) as count FROM job_history WHERE user_id = ? AND guild_id = ?');
                const countResult = countStmt.get(userId, guildId);
                workCount = countResult.count || 0;
            } catch (error) {
                console.log('⚠️ Could not fetch work count');
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('💼 Werk Voltooid!')
                .setDescription(`Je hebt gewerkt als **${selectedJob.name}** en verdiende **€${finalEarnings.toLocaleString()}**!`)
                .addFields(
                    { name: '💰 Basis Verdiensten', value: `€${baseEarnings}`, inline: true },
                    { name: '⚡ Multiplier', value: `${totalMultiplier}x`, inline: true },
                    { name: '💵 Totaal Verdiend', value: `€${finalEarnings.toLocaleString()}`, inline: true },
                    (() => { const nextUnix = Math.floor((Date.now() + cooldownTime) / 1000); return { name: '⏰ Volgende werk', value: `<t:${nextUnix}:R> (om <t:${nextUnix}:T>)`, inline: true }; })(),
                    { name: '📊 Werk Teller', value: `${workCount} keer gewerkt`, inline: true },
                    { name: '🏷️ Job Type', value: selectedJob.level > 0 ? 'Premium Job' : 'Standaard Job', inline: true }
                )
                .setFooter({ text: `${interaction.user.username} • Bekijk je job geschiedenis met /jobstats` })
                .setTimestamp();

            const premiumJobs = unlockedJobs.filter(job => job.level > 0);
            if (selectedJob.level === 0 && premiumJobs.length > 0) {
                embed.addFields({
                    name: '🔓 Je Premium Jobs',
                    value: premiumJobs.map(job => `• ${job.name} (€${job.min}-${job.max})`).join('\n') || 'Geen',
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('❌ Error in work command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het verwerken van het werk commando.')
                .setTimestamp();

            try {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
    },
};

// Handle job selection from the select menu
export async function handleWorkSelectMenu(interaction) {
    if (!interaction.isStringSelectMenu?.() || interaction.customId !== 'work_select') return;

    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const chosen = interaction.values[0];

    // Load guild config and apply cooldown check
    let cfg = {};
    try {
        cfg = db.prepare('SELECT eco_work_cooldown_minutes, eco_work_gate_mode, eco_work_allow_multipliers FROM guild_config WHERE guild_id = ?').get(guildId) || {};
    } catch {}
    const cooldownMinutes = Number(cfg.eco_work_cooldown_minutes ?? 60);
    const cooldownTime = Math.max(1, cooldownMinutes) * 60 * 1000;
    try {
        const userRow = db.prepare('SELECT last_work FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
        const lastWork = userRow?.last_work ? new Date(userRow.last_work) : null;
        const now = new Date();
        if (lastWork && (now - lastWork) < cooldownTime) {
            const nextWork = new Date(lastWork.getTime() + cooldownTime);
            const nextUnix = Math.floor(nextWork.getTime() / 1000);
            const elapsed = now - lastWork;
            const progress = Math.max(0, Math.min(1, elapsed / cooldownTime));
            const blocks = 20;
            const filled = Math.round(progress * blocks);
            const bar = `${'█'.repeat(filled)}${'░'.repeat(blocks - filled)}`;

            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('⏰ Cooldown Actief')
                .setDescription(`Je kan weer werken <t:${nextUnix}:R> (om <t:${nextUnix}:T>).`)
                .addFields(
                    { name: 'Voortgang', value: `${bar} ${(progress * 100).toFixed(0)}%`, inline: false }
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`work_cd_refresh:${nextUnix}`).setLabel('🔄 Vernieuwen').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('work_cd_close').setLabel('✖ Sluiten').setStyle(ButtonStyle.Secondary)
            );

            await interaction.update({ embeds: [embed], components: [row] });
            return;
        }
    } catch {}

    // Load jobs from DB + inventory
    const inventoryJobs = [];
    try {
        const inventoryStmt = db.prepare(`
            SELECT s.name AS item_name, s.item_data AS item_data, s.type AS item_type
            FROM user_inventory u
            JOIN shop_items s ON u.item_id = s.id
            WHERE u.user_id = ? AND u.guild_id = ? AND s.type = 'job'
        `);
        const ownedJobs = inventoryStmt.all(userId, guildId);
        ownedJobs.forEach(job => {
            if (job.item_data) {
                try {
                    const jobData = JSON.parse(job.item_data);
                    inventoryJobs.push({ name: job.item_name, min: jobData.min || 100, max: jobData.max || 300, level: jobData.level || 1, required_role_id: null });
                } catch {
                    inventoryJobs.push({ name: job.item_name, min: 100, max: 300, level: 1, required_role_id: null });
                }
            }
        });
    } catch {}
    const guildJobs = loadGuildJobs(db, guildId);
    const unlockedJobs = [...guildJobs, ...inventoryJobs];

    // Determine user level
    let userLevel = 1;
    try {
        const levelRow = db.prepare('SELECT level FROM user_levels WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
        if (levelRow && levelRow.level !== undefined && levelRow.level !== null) {
            const lvl = Number(levelRow.level);
            if (Number.isFinite(lvl)) userLevel = Math.max(0, lvl);
        }
    } catch {}

    // Gating and multipliers
    const gateMode = (cfg.eco_work_gate_mode || 'level');
    const allowMultipliers = !!(cfg && (cfg.eco_work_allow_multipliers === 1 || cfg.eco_work_allow_multipliers === true));

    const availableJobs = unlockedJobs.filter(j => passesGating(j, userLevel, interaction.member, gateMode));
    const selectedJob = availableJobs.find(j => j.name === chosen);
    if (!selectedJob) {
        await interaction.update({ content: '❌ Deze job is niet (meer) beschikbaar.', components: [], embeds: [] });
        return;
    }

    // Calculate earnings with multipliers
    const now = new Date();
    // Coerce values to Number to avoid BigInt mixing
    const minPayout = Number(selectedJob.min ?? selectedJob.min_payout ?? 0);
    const maxPayout = Number(selectedJob.max ?? selectedJob.max_payout ?? 0);
    const safeMin = Number.isFinite(minPayout) ? minPayout : 0;
    const safeMax = Number.isFinite(maxPayout) ? maxPayout : 0;
    const low = Math.min(safeMin, safeMax);
    const high = Math.max(safeMin, safeMax);
    let baseEarnings = Math.floor(Math.random() * (high - low + 1)) + low;
    let totalMultiplier = 1;
    if (allowMultipliers) {
        try {
            const multiplierStmt = db.prepare(`
                SELECT item_data FROM user_inventory ui
                JOIN shop_items si ON ui.item_id = si.id
                WHERE ui.user_id = ? AND ui.guild_id = ? AND si.type = 'multiplier'
            `);
            const multipliers = multiplierStmt.all(userId, guildId);
            multipliers.forEach(mult => {
                if (mult.item_data) {
                    try {
                        const multiplierData = JSON.parse(mult.item_data);
                        totalMultiplier += (multiplierData.value || 0);
                    } catch {
                        totalMultiplier += parseFloat(mult.item_data) || 0;
                    }
                }
            });
        } catch {}
    }
    const finalEarnings = Math.floor(baseEarnings * totalMultiplier);

    // Update balance and last_work; also log history
    try {
        let stmt = db.prepare('UPDATE users SET balance = balance + ?, last_work = ? WHERE user_id = ? AND guild_id = ?');
        stmt.run(Number(finalEarnings), now.toISOString(), userId, guildId);
        const historyStmt = db.prepare(`
            INSERT INTO job_history (user_id, guild_id, job_name, base_earnings, multiplier, final_earnings, job_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        historyStmt.run(userId, guildId, selectedJob.name, baseEarnings, totalMultiplier, finalEarnings, selectedJob.level > 0 ? 'premium' : 'default');
    } catch {}

    const nextUnix = Math.floor((Date.now() + cooldownTime) / 1000);
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('💼 Werk Voltooid!')
        .setDescription(`Je hebt gewerkt als **${selectedJob.name}** en verdiende **€${finalEarnings.toLocaleString()}**!`)
        .addFields(
            { name: '💰 Basis Verdiensten', value: `€${baseEarnings}`, inline: true },
            { name: '⚡ Multiplier', value: `${totalMultiplier}x`, inline: true },
            { name: '💵 Totaal Verdiend', value: `€${finalEarnings.toLocaleString()}`, inline: true },
            { name: '⏰ Volgende werk', value: `<t:${nextUnix}:R> (om <t:${nextUnix}:T>)`, inline: true },
        )
        .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });
}

// Handle cooldown panel interactions (refresh/close)
export async function handleWorkCooldownInteraction(interaction) {
    if (!interaction.isButton?.()) return;
    const { customId } = interaction;
    if (!(customId.startsWith('work_cd_refresh') || customId === 'work_cd_close')) return;

    const db = interaction.client.db;
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Close button
    if (customId === 'work_cd_close') {
        const embed = interaction.message.embeds?.[0] || null;
        return interaction.update({ embeds: embed ? [embed] : [], components: [] });
    }

    // Refresh button: recompute progress/timing
    try {
        const cfg = db.prepare('SELECT eco_work_cooldown_minutes FROM guild_config WHERE guild_id = ?').get(guildId) || {};
        const cooldownMinutes = Number(cfg.eco_work_cooldown_minutes ?? 60);
        const cooldownTime = Math.max(1, cooldownMinutes) * 60 * 1000;
        const userRow = db.prepare('SELECT last_work FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
        const lastWork = userRow?.last_work ? new Date(userRow.last_work) : null;
        const now = new Date();

        if (!lastWork) {
            // Nothing to cool down from
            return interaction.update({ content: 'Je hebt nog niet gewerkt. Gebruik /work om te beginnen.', embeds: [], components: [] });
        }

        const nextWorkDate = new Date(lastWork.getTime() + cooldownTime);
        if (now >= nextWorkDate) {
            // Cooldown finished
            const doneEmbed = new EmbedBuilder()
                .setColor('#00cc66')
                .setTitle('✅ Cooldown Voorbij')
                .setDescription('Je kan nu weer werken met /work!')
                .setTimestamp();
            return interaction.update({ embeds: [doneEmbed], components: [] });
        }

        const nextUnix = Math.floor(nextWorkDate.getTime() / 1000);
        const elapsed = now - lastWork;
        const progress = Math.max(0, Math.min(1, elapsed / cooldownTime));
        const blocks = 20;
        const filled = Math.round(progress * blocks);
        const bar = `${'█'.repeat(filled)}${'░'.repeat(blocks - filled)}`;

        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('⏰ Cooldown Actief')
            .setDescription(`Je kan weer werken <t:${nextUnix}:R> (om <t:${nextUnix}:T>).`)
            .addFields({ name: 'Voortgang', value: `${bar} ${(progress * 100).toFixed(0)}%`, inline: false })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`work_cd_refresh:${nextUnix}`).setLabel('🔄 Vernieuwen').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('work_cd_close').setLabel('✖ Sluiten').setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({ embeds: [embed], components: [row] });
    } catch (e) {
        console.error('❌ Work cooldown refresh error:', e);
        if (!interaction.replied && !interaction.deferred) {
            try { await interaction.reply({ content: 'Er ging iets mis bij het vernieuwen van de cooldown.', ephemeral: true }); } catch {}
        }
    }
}
