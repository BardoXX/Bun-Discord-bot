import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('tellen')
        .setDescription('Tellen gerelateerde commando\'s')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Bekijk de huidige tell status'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset de teller naar 0'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Stel het huidige getal in')
                .addIntegerOption(option =>
                    option.setName('getal')
                        .setDescription('Het getal waar je wilt beginnen')
                        .setRequired(true)
                        .setMinValue(0))),

    async execute(interaction) {
        await interaction.deferReply();
        
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'reset' || subcommand === 'set') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                const noPermsEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Geen Toegang')
                    .setDescription('Je hebt geen permissies om dit commando te gebruiken.')
                    .setTimestamp();
                return interaction.editReply({ embeds: [noPermsEmbed], ephemeral: true });
            }
        }
        const db = interaction.client.db;
        const guildId = interaction.guild.id;

        // Get counting configuration from database
        const configStmt = db.prepare('SELECT counting_channel, counting_number FROM guild_config WHERE guild_id = ?');
        const config = configStmt.get(guildId);

        if (!config || !config.counting_channel) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Tellen Niet Geconfigureerd')
                .setDescription('Het tell systeem is nog niet ingesteld. Gebruik `/config tellen` om een tel kanaal in te stellen.')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const countingChannel = interaction.guild.channels.cache.get(config.counting_channel);
        if (!countingChannel) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Tel Kanaal Niet Gevonden')
                .setDescription('Het geconfigureerde tel kanaal bestaat niet meer. Configureer het opnieuw met `/config tellen`.')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        switch (subcommand) {
            case 'status':
                await handleStatus(interaction, config, countingChannel);
                break;
            case 'reset':
                await handleReset(interaction, db, guildId, countingChannel);
                break;
            case 'set':
                const newNumber = interaction.options.getInteger('getal');
                await handleSet(interaction, db, guildId, countingChannel, newNumber);
                break;
        }
    },
};

async function handleStatus(interaction, config, countingChannel) {
    const currentNumber = config.counting_number || 0;
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🔢 Tellen Status')
        .addFields(
            { name: 'Tel Kanaal', value: `${countingChannel}`, inline: true },
            { name: 'Huidig Getal', value: `${currentNumber}`, inline: true },
            { name: 'Volgend Getal', value: `${currentNumber + 1}`, inline: true }
        )
        .setDescription(`Het tel spel is actief in ${countingChannel}. Het volgende getal dat getypt moet worden is **${currentNumber + 1}**.`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleReset(interaction, db, guildId, countingChannel) {
    try {
        const updateStmt = db.prepare('UPDATE guild_config SET counting_number = 0 WHERE guild_id = ?');
        updateStmt.run(guildId);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🔢 Teller Gereset')
            .setDescription(`De teller is gereset naar **0**. Het volgende getal in ${countingChannel} moet **1** zijn.`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Optionally send a message to the counting channel
        try {
            await countingChannel.send({
                embeds: [new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('🔄 Teller Gereset')
                    .setDescription(`De teller is gereset door ${interaction.user}. Begin opnieuw met **1**!`)
                    .setTimestamp()]
            });
        } catch (error) {
            console.error('Error sending reset message to counting channel:', error);
        }

    } catch (error) {
        console.error('Error resetting counter:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Er is een fout opgetreden bij het resetten van de teller.')
            .setTimestamp();
            
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleSet(interaction, db, guildId, countingChannel, newNumber) {
    try {
        const updateStmt = db.prepare('UPDATE guild_config SET counting_number = ? WHERE guild_id = ?');
        updateStmt.run(newNumber, guildId);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🔢 Teller Ingesteld')
            .setDescription(`De teller is ingesteld op **${newNumber}**. Het volgende getal in ${countingChannel} moet **${newNumber + 1}** zijn.`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Optionally send a message to the counting channel
        try {
            await countingChannel.send({
                embeds: [new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🔢 Teller Aangepast')
                    .setDescription(`De teller is aangepast naar **${newNumber}** door ${interaction.user}. Het volgende getal is **${newNumber + 1}**!`)
                    .setTimestamp()]
            });
        } catch (error) {
            console.error('Error sending set message to counting channel:', error);
        }

    } catch (error) {
        console.error('Error setting counter:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Fout')
            .setDescription('Er is een fout opgetreden bij het instellen van de teller.')
            .setTimestamp();
            
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}