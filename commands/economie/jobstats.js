// commands/economie/jobstats.js - View job history and statistics
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('jobstats')
        .setDescription('Bekijk je werk statistieken en geschiedenis')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Bekijk de job stats van een andere gebruiker')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('period')
                .setDescription('Tijdsperiode voor statistieken')
                .addChoices(
                    { name: '📅 Vandaag', value: 'today' },
                    { name: '📆 Deze week', value: 'week' },
                    { name: '🗓️ Deze maand', value: 'month' },
                    { name: '📊 Alle tijd', value: 'all' }
                )
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply(); 

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const period = interaction.options.getString('period') || 'all';
        const db = interaction.client.db;
        const guildId = interaction.guild.id;
        const userId = targetUser.id;

        console.log(`📊 [jobstats] Showing job stats for ${targetUser.tag} (period: ${period})`);

        try {
            let dateFilter = '';
            let dateParams = [];
            const now = new Date();

            switch (period) {
                case 'today':
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    dateFilter = 'AND work_date >= ?';
                    dateParams = [today.toISOString()];
                    break;
                case 'week':
                    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    dateFilter = 'AND work_date >= ?';
                    dateParams = [weekStart.toISOString()];
                    break;
                case 'month':
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    dateFilter = 'AND work_date >= ?';
                    dateParams = [monthStart.toISOString()];
                    break;
                case 'all':
                default:
                    break;
            }

            const statsStmt = db.prepare(`
                SELECT 
                    COUNT(*) as total_jobs,
                    SUM(final_earnings) as total_earned,
                    AVG(final_earnings) as avg_earnings,
                    MAX(final_earnings) as best_earning,
                    MIN(final_earnings) as worst_earning,
                    AVG(multiplier) as avg_multiplier,
                    MAX(work_date) as last_work
                FROM job_history 
                WHERE user_id = ? AND guild_id = ? ${dateFilter}
            `);
            
            const stats = statsStmt.get(userId, guildId, ...dateParams);

            if (!stats || Number(stats.total_jobs) === 0) { // Fix: Convert total_jobs to a number
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle(`📊 ${targetUser.displayName}'s Job Statistieken`)
                    .setDescription(
                        targetUser.id === interaction.user.id ? 
                        `Je hebt nog niet gewerkt in de geselecteerde periode (${getPeriodName(period)})!` :
                        `Deze gebruiker heeft nog niet gewerkt in de geselecteerde periode (${getPeriodName(period)})!`
                    )
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setFooter({ text: 'Gebruik /work om te beginnen met werken!' })
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const jobBreakdownStmt = db.prepare(`
                SELECT 
                    job_name,
                    COUNT(*) as times_worked,
                    SUM(final_earnings) as total_earned_job,
                    AVG(final_earnings) as avg_earnings_job,
                    job_type
                FROM job_history 
                WHERE user_id = ? AND guild_id = ? ${dateFilter}
                GROUP BY job_name 
                ORDER BY times_worked DESC, total_earned_job DESC
                LIMIT 10
            `);
            
            const jobBreakdown = jobBreakdownStmt.all(userId, guildId, ...dateParams);

            const recentJobsStmt = db.prepare(`
                SELECT job_name, final_earnings, work_date, multiplier
                FROM job_history 
                WHERE user_id = ? AND guild_id = ? ${dateFilter}
                ORDER BY work_date DESC 
                LIMIT 5
            `);
            
            const recentJobs = recentJobsStmt.all(userId, guildId, ...dateParams);

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`📊 ${targetUser.displayName}'s Job Statistieken`)
                .setDescription(`Werk statistieken voor **${getPeriodName(period)}**`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            // Overall statistics
            embed.addFields({
                name: '📈 Algemene Statistieken',
                value: [
                    `💼 **${Number(stats.total_jobs)}** keer gewerkt`, // Fix: Convert total_jobs
                    `💰 **€${Math.round(Number(stats.total_earned)).toLocaleString()}** totaal verdiend`, // Fix: Convert total_earned
                    `📊 **€${Math.round(Number(stats.avg_earnings)).toLocaleString()}** gemiddeld per job`, // Fix: Convert avg_earnings
                    `🏆 **€${Math.round(Number(stats.best_earning)).toLocaleString()}** beste verdienste`, // Fix: Convert best_earning
                    `⚡ **${stats.avg_multiplier ? Number(stats.avg_multiplier).toFixed(1) : '0.0'}x** gemiddelde multiplier` // Fix: Convert avg_multiplier
                ].join('\n'),
                inline: false
            });

            // Job breakdown
            if (jobBreakdown.length > 0) {
                const jobList = jobBreakdown.slice(0, 5).map((job, index) => {
                    const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📋';
                    const typeEmoji = job.job_type === 'premium' ? '⭐' : '🔧';
                    return `${emoji} **${job.job_name}** ${typeEmoji}\n   └ ${Number(job.times_worked)}x gewerkt • €${Math.round(Number(job.total_earned_job)).toLocaleString()} verdiend`; // Fix: Convert values
                }).join('\n\n');

                embed.addFields({
                    name: '🏅 Meest Gebruikte Jobs',
                    value: jobList,
                    inline: false
                });
            }

            // Recent activity
            if (recentJobs.length > 0) {
                const recentList = recentJobs.map(job => {
                    const date = new Date(job.work_date);
                    const timeAgo = getTimeAgo(date);
                    const multiplierText = Number(job.multiplier) > 1 ? ` (${Number(job.multiplier).toFixed(1)}x)` : ''; // Fix: Convert multiplier
                    return `• **${job.job_name}** - €${Number(job.final_earnings).toLocaleString()}${multiplierText} *${timeAgo}*`; // Fix: Convert final_earnings
                }).join('\n');

                embed.addFields({
                    name: '🕒 Recente Activiteit',
                    value: recentList,
                    inline: false
                });
            }

            // Performance insights
            if (Number(stats.total_jobs) >= 5) { // Fix: Convert total_jobs
                let insights = [];
                
                if (Number(stats.avg_multiplier) > 1.5) { // Fix: Convert avg_multiplier
                    insights.push('🚀 Uitstekende multiplier gebruik!');
                }
                if (Number(stats.total_jobs) >= 50) { // Fix: Convert total_jobs
                    insights.push('💪 Hardwerkende gebruiker!');
                }
                if (Number(stats.best_earning) >= 500) { // Fix: Convert best_earning
                    insights.push('💎 Top verdienste behaald!');
                }

                const premiumJobs = jobBreakdown.filter(job => job.job_type === 'premium').length;
                const defaultJobs = jobBreakdown.filter(job => job.job_type === 'default').length;
                
                if (premiumJobs > defaultJobs) {
                    insights.push('⭐ Premium job specialist!');
                }

                if (insights.length > 0) {
                    embed.addFields({
                        name: '🎯 Prestatie Inzichten',
                        value: insights.join('\n'),
                        inline: false
                    });
                }
            }

            // Footer with additional info
            const footerTexts = [];
            if (stats.last_work) {
                const lastWork = new Date(stats.last_work);
                footerTexts.push(`Laatst gewerkt: ${getTimeAgo(lastWork)}`);
            }
            footerTexts.push(`Periode: ${getPeriodName(period)}`);
            
            embed.setFooter({ text: footerTexts.join(' • ') });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('❌ Error in jobstats command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het ophalen van job statistieken.')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};

function getPeriodName(period) {
    const names = {
        'today': 'Vandaag',
        'week': 'Deze Week',
        'month': 'Deze Maand',
        'all': 'Alle Tijd'
    };
    return names[period] || 'Alle Tijd';
}

function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} dag${days > 1 ? 'en' : ''} geleden`;
    } else if (hours > 0) {
        return `${hours} uur geleden`;
    } else if (minutes > 0) {
        return `${minutes} min geleden`;
    } else {
        return 'zojuist';
    }
}