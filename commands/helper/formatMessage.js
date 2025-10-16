export function formatMessage(text, data) {
    if (!text) {
        return '';
    }

    let formattedText = text;

    // Loop door alle sleutels in de data en vervang de bijbehorende placeholders
    for (const key in data) {
        // Maak een nieuwe RegExp om alle instanties van {key} te vinden
        // De 'g' vlag zorgt ervoor dat alle matches worden vervangen
        const placeholder = new RegExp(`\\{${key}\\}`, 'g');
        formattedText = formattedText.replace(placeholder, data[key]);
    }

    return formattedText;
}