import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from '../modules/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '../data');

async function setupDatabase() {
    try {
        // Create data directory if it doesn't exist
        await mkdir(dataDir, { recursive: true });
        console.log('✅ Data directory ready');
        
        // Initialize database
        const db = await initializeDatabase();
        console.log('✅ Database initialized successfully');
        
        // Close the database connection
        db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error setting up database:', error);
        process.exit(1);
    }
}

setupDatabase();
