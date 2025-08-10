// commands/utils/colorValidator.js

/**
 * Validates a color string for Discord embeds
 * @param {string} color - The color string to validate
 * @returns {string|number|null} - Valid color value or null if invalid
 */
export function validateEmbedColor(color) {
    if (!color) return null;
    
    // If it's already a number, check if it's in valid range
    if (typeof color === 'number') {
        if (color >= 0 && color <= 16777215) { // 0xFFFFFF
            return color;
        }
        return null;
    }
    
    // Convert to string if it's not already
    const colorStr = String(color).trim();
    
    // Check for hex format (#RRGGBB or RRGGBB)
    if (colorStr.startsWith('#')) {
        const hex = colorStr.slice(1);
        if (/^[0-9A-F]{6}$/i.test(hex)) {
            return `#${hex}`;
        }
    } else if (/^[0-9A-F]{6}$/i.test(colorStr)) {
        return `#${colorStr}`;
    }
    
    // Check for decimal number
    if (/^\d+$/.test(colorStr)) {
        const num = parseInt(colorStr, 10);
        if (num >= 0 && num <= 16777215) { // 0xFFFFFF
            return num;
        }
    }
    
    // Check for built-in color names
    const validColorNames = [
        'DEFAULT', 'WHITE', 'AQUA', 'GREEN', 'BLUE', 'YELLOW', 
        'PURPLE', 'LUMINOUS_VIVID_PINK', 'FUCHSIA', 'GOLD', 'ORANGE', 
        'RED', 'GREY', 'NAVY', 'DARK_AQUA', 'DARK_GREEN', 'DARK_BLUE', 
        'DARK_PURPLE', 'DARK_VIVID_PINK', 'DARK_GOLD', 'DARK_ORANGE', 
        'DARK_RED', 'DARK_GREY', 'DARKER_GREY', 'LIGHT_GREY', 'DARK_NAVY',
        'BLURPLE', 'GREYPLE', 'DARK_BUT_NOT_BLACK', 'NOT_QUITE_BLACK', 'RANDOM'
    ];
    
    if (validColorNames.includes(colorStr.toUpperCase())) {
        return colorStr.toUpperCase();
    }
    
    // Invalid color
    return null;
}

/**
 * Gets a user-friendly error message for invalid colors
 * @param {string} color - The invalid color string
 * @returns {string} - Error message
 */
export function getColorErrorMessage(color) {
    return `Ongeldige kleur: ${color}. Gebruik een hexadecimale kleur (bijv. #FF0000), een decimaal getal (0-16777215), of een geldige kleurnaam.`;
}
