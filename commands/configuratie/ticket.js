import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { editTicketSetup } from './ticketWizard.js';

const data = new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage ticket systems')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('edit')
            .setDescription('Edit an existing ticket system')
    );

async function execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: '❌ You need administrator permissions to use this command.',
            ephemeral: true
        });
    }

    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'edit') {
        await editTicketSetup(interaction);
    }
}

// Export as default object
export default {
    data,
    execute
};
