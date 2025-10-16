// utils/pathResolve.js
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

// Get the project root directory (go up from modules/utils directory)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..'); // Go up two levels from modules/utils

/**
 * Resolve a path relative to the project root
 * @param {...string} pathParts - Path parts to join relative to project root
 * @returns {string} Absolute path
 */
export function resolvePath(...pathParts) {
    return resolve(projectRoot, ...pathParts);
}

/**
 * Create a module importer that resolves paths from project root
 * @param {string} basePath - Base path relative to project root
 * @returns {function(string): Promise<any>} Async function to import modules
 */
export function createImporter(basePath = '') {
    return async (modulePath) => {
        const absolutePath = resolve(projectRoot, basePath, modulePath);
        // Add .js extension if not present
        const fullPath = modulePath.endsWith('.js') ? absolutePath : `${absolutePath}.js`;
        return await import(fullPath);
    };
}

// Export commonly used paths
export const PATHS = {
    ROOT: projectRoot,
    COMMANDS: resolvePath('commands'),
    MODULES: resolvePath('modules'),
    UTILS: resolvePath('utils'),
    EVENTS: resolvePath('events'),
};

// Helper to convert file:// URL to path (renamed to avoid conflict with node:url)
const convertFileURLToPath = (url) => {
    if (url.startsWith('file://')) {
        return fileURLToPath(url);
    }
    return url;
};

// Helper to convert path to file:// URL
const pathToFileURL = (path) => {
    if (path.startsWith('file://')) {
        return path;
    }
    return `file://${resolve(path)}`;
};

export default {
    resolvePath,
    createImporter,
    PATHS,
    fileURLToPath: convertFileURLToPath,
    pathToFileURL,
    join
};
