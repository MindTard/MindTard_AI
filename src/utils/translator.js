import translate from 'google-translate-api-x';
import settings from '../../settings.js';

const PREFERRED_LANG = String(settings.language).toLowerCase();
const ENGLISH = ['en', 'english'];

/**
 * Translates text to the preferred language or returns original if English
 * @param {string} message - Text to translate
 * @returns {Promise<string>} Translated text or original message
 */
export async function handleTranslation(message) {
    if (ENGLISH.includes(PREFERRED_LANG)) {
        return message;
    }
    return await translateText(message, PREFERRED_LANG);
}

/**
 * Translates text to English or returns original if already English
 * @param {string} message - Text to translate 
 * @returns {Promise<string>} Translated text or original message
 */
export async function handleEnglishTranslation(message) {
    if (ENGLISH.includes(PREFERRED_LANG)) {
        return message;
    }
    return await translateText(message, 'english');
}

/**
 * Helper function to handle translation with error handling
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language
 * @returns {Promise<string>} Translated text or original text on error
 */
async function translateText(text, targetLang) {
    try {
        const translation = await translate(text, { to: targetLang });
        return translation.text || text;
    } catch (error) {
        console.error('Error translating text:', error);
        return text;
    }
}
