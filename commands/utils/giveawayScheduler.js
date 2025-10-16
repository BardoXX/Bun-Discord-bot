// commands/utils/giveawayScheduler.js
import { EmbedBuilder } from 'discord.js';
import cron from 'node-cron';
import { safeDbOperation } from '../utils/database.js';
import { checkExpiredGiveaways } from '../fun/giveaway.js';

// Singleton instance to prevent multiple schedulers
let schedulerInstance = null;

class GiveawayScheduler {
    constructor(client, db) {
        // Prevent multiple instances
        if (schedulerInstance) {
            console.log('⚠️ [GiveawayScheduler] Instance already exists, returning existing instance');
            return schedulerInstance;
        }

        this.client = client;
        this.db = db;
        this.isRunning = false;

        console.log('🎉 [GiveawayScheduler] Initializing with database:', this.db ? 'Connected' : 'NOT CONNECTED');

        schedulerInstance = this;
    }

    start() {
        if (this.isRunning) {
            console.log('⚠️ [GiveawayScheduler] Already running, ignoring start request');
            return;
        }

        // Controleer of database beschikbaar is
        if (!this.db) {
            console.error('❌ [GiveawayScheduler] Cannot start - database not available');
            return;
        }

        console.log('🎉 [GiveawayScheduler] Starting giveaway scheduler...');

        // Run every minute to check for expired giveaways
        this.job = cron.schedule('* * * * *', () => {
            this.checkExpiredGiveaways();
        }, {
            scheduled: true,
            timezone: "Europe/Brussels"
        });

        // Also run once on startup
        setTimeout(() => {
            console.log('🚀 [GiveawayScheduler] Running initial startup check...');
            this.checkExpiredGiveaways();
        }, 10000); // Wait 10 seconds after startup

        this.isRunning = true;
        console.log('✅ [GiveawayScheduler] Giveaway scheduler started successfully');
    }

    stop() {
        if (this.job) {
            this.job.destroy();
            this.job = null;
        }
        this.isRunning = false;
        schedulerInstance = null; // Clear singleton
        console.log('ℹ️ [GiveawayScheduler] Giveaway scheduler stopped');
    }

    async checkExpiredGiveaways() {
        console.log('🎉 [GiveawayScheduler] Checking for expired giveaways...');

        try {
            // Extra database check
            if (!this.db) {
                console.error('❌ [GiveawayScheduler] Database not available for giveaway check');
                return;
            }

            await checkExpiredGiveaways(this.client, this.db);
            console.log('✅ [GiveawayScheduler] Expired giveaway check completed');

        } catch (error) {
            console.error('❌ [GiveawayScheduler] Error checking expired giveaways:', error);
        }
    }

    // Health check method
    isHealthy() {
        return {
            running: this.isRunning,
            database: !!this.db,
            job: !!this.job,
            isSingleton: schedulerInstance === this
        };
    }

    // Get scheduler stats
    getStats() {
        return {
            isRunning: this.isRunning,
            hasDatabase: !!this.db,
            hasJob: !!this.job,
            timezone: 'Europe/Brussels',
            schedule: '* * * * * (Every minute)'
        };
    }
}

export default GiveawayScheduler;
