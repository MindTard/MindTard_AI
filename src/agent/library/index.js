import * as skills from './skills.js';
import * as world from './world.js';

/**
 * Extracts documentation from function comments
 * @param {Function[]} functions Array of functions to extract docs from
 * @param {string} moduleName Name of the module containing functions
 * @returns {string} Formatted documentation string
 */
function extractFunctionDocs(functions, moduleName) {
    return functions
        .map(func => {
            const str = func.toString();
            if (!str.includes('/**')) return '';

            const docStart = str.indexOf('/**') + 3;
            const docEnd = str.indexOf('**/');
            return `${moduleName}.${func.name}${str.substring(docStart, docEnd)}\n`;
        })
        .filter(Boolean)
        .join('');
}

/**
 * Gets documentation for all available skills and world functions
 * @returns {string} Complete documentation string
 */
export function getSkillDocs() {
    const header = "\n*SKILL DOCS\nThese skills are javascript functions that can be called when writing actions and skills.\n";
    
    const skillDocs = extractFunctionDocs(Object.values(skills), 'skills');
    const worldDocs = extractFunctionDocs(Object.values(world), 'world');
    
    return `${header}${skillDocs}${worldDocs}*\n`;
}
