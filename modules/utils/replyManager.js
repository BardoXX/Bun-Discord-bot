import { EmbedBuilder } from 'discord.js';

class ReplyManager {
    constructor(interaction) {
        this.interaction = interaction;
        this.pendingReply = null;
        this.hasReplied = false;
        this.hasDeferred = false;
        this.isHandled = false;
        this.interactionTimeout = 3000; // 3 seconds to respond to interaction
    }

    async send(options) {
        // If interaction is already handled, skip
        if (this.isHandled) {
            console.warn('Interaction already handled, skipping send');
            return null;
        }

        // If we already have a pending reply, wait for it to complete
        if (this.pendingReply) {
            try {
                await this.pendingReply;
            } catch (error) {
                if (error.code !== 10062) { // Ignore unknown interaction errors
                    console.error('Error in pending operation:', error);
                }
                return null;
            }
        }

        // Check if interaction is already handled by Discord
        if (this.interaction.replied || this.interaction.deferred) {
            this.isHandled = true;
            console.warn('Interaction already handled by Discord, skipping send');
            return null;
        }

        try {
            // Set a timeout for the interaction
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(
                    () => reject(new Error('Interaction timed out')), 
                    this.interactionTimeout
                )
            );

            // Send the reply with a race against the timeout
            this.pendingReply = Promise.race([
                this.interaction.reply({
                    ...options,
                    withResponse: true
                }),
                timeoutPromise
            ]);

            this.hasReplied = true;
            this.isHandled = true;
            await this.pendingReply;
            return null;
        } catch (error) {
            this.isHandled = true;
            
            // Handle specific Discord API errors
            if (error.code === 10062) { // Unknown interaction
                console.log('Interaction already expired or unknown');
                return null;
            }
            
            if (error.code === 40060) { // Already acknowledged
                console.log('Interaction already acknowledged');
                return null;
            }
            
            console.error('Error in replyManager.send:', error);
            throw error;
        } finally {
            this.pendingReply = null;
        }
    }

    async defer(ephemeral = false) {
        if (this.isHandled || this.interaction.deferred || this.interaction.replied) {
            return;
        }

        try {
            // Set a timeout for the defer
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Defer timed out')), this.interactionTimeout)
            );

            this.pendingReply = Promise.race([
                this.interaction.deferReply({ ephemeral }),
                timeoutPromise
            ]);
            
            this.hasDeferred = true;
            this.isHandled = true;
            await this.pendingReply;
        } catch (error) {
            this.isHandled = true;
            if (error.code !== 10062 && error.code !== 40060) {
                console.error('Error in defer:', error);
                throw error;
            }
        } finally {
            this.pendingReply = null;
        }
    }

    async edit(options) {
        if (!this.interaction.replied && !this.interaction.deferred) {
            return this.send(options);
        }

        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Edit timed out')), this.interactionTimeout)
            );

            return await Promise.race([
                this.interaction.editReply(options),
                timeoutPromise
            ]);
        } catch (error) {
            if (error.code !== 10062 && error.code !== 40060) {
                console.error('Error editing reply:', error);
                throw error;
            }
            return null;
        }
    }

    async followUp(options) {
        if (!this.interaction.replied && !this.interaction.deferred) {
            return this.send(options);
        }
        
        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Follow-up timed out')), this.interactionTimeout)
            );

            return await Promise.race([
                this.interaction.followUp(options),
                timeoutPromise
            ]);
        } catch (error) {
            if (error.code !== 10062 && error.code !== 40060) {
                console.error('Error in followUp:', error);
                throw error;
            }
            return null;
        }
    }

    error(message, title = '❌ Error') {
        return this.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle(title)
                    .setDescription(message)
                    .setTimestamp()
            ],
            ephemeral: true
        });
    }

    success(message, title = '✅ Success') {
        return this.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(title)
                    .setDescription(message)
                    .setTimestamp()
            ],
            ephemeral: true
        });
    }
}

export default ReplyManager;
