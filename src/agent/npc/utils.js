import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';

/**
 * Determines the specific type of a generic block based on inventory contents and surroundings
 * @param {Object} bot - The bot instance
 * @param {string} blockName - The generic block name
 * @returns {string} The specific block type
 */
export function getTypeOfGeneric(bot, blockName) {
    const handlers = {
        wood: handleWoodType,
        bed: handleBedType
    };

    const blockType = Object.keys(handlers).find(type => 
        (type === 'wood' && mc.MATCHING_WOOD_BLOCKS.includes(blockName)) ||
        (type === 'bed' && blockName === 'bed')
    );

    return blockType 
        ? handlers[blockType](bot, blockName)
        : blockName;
}

/**
 * Handles wood type determination
 * @private
 */
function handleWoodType(bot, blockName) {
    // Try inventory first
    const woodType = getMostCommonTypeFromInventory(
        bot, 
        mc.WOOD_TYPES,
        item => mc.WOOD_TYPES.some(wood => item.includes(wood))
    );
    
    if (woodType) return `${woodType}_${blockName}`;

    // Try nearby blocks
    const nearestWood = findNearestWoodType(bot);
    if (nearestWood) return `${nearestWood}_${blockName}`;

    // Default to oak
    return `oak_${blockName}`;
}

/**
 * Handles bed type determination
 * @private
 */
function handleBedType(bot, blockName) {
    const woolType = getMostCommonTypeFromInventory(
        bot,
        mc.WOOL_COLORS,
        (item, color) => item === `${color}_wool`
    );

    return `${woolType || 'white'}_${blockName}`;
}

/**
 * Gets the most common type from inventory based on criteria
 * @private
 */
function getMostCommonTypeFromInventory(bot, types, matchFunction) {
    const inventory = world.getInventoryCounts(bot);
    const typeCounts = {};
    let maxCount = 0;
    let maxType = null;

    for (const item in inventory) {
        for (const type of types) {
            if (matchFunction(item, type)) {
                typeCounts[type] = (typeCounts[type] || 0) + inventory[item];
                if (typeCounts[type] > maxCount) {
                    maxCount = typeCounts[type];
                    maxType = type;
                }
            }
        }
    }

    return maxType;
}

/**
 * Finds the nearest wood type in the environment
 * @private
 */
function findNearestWoodType(bot) {
    const logTypes = mc.WOOD_TYPES.map(wood => `${wood}_log`);
    const blocks = world.getNearestBlocks(bot, logTypes, 16, 1);
    return blocks.length > 0 ? blocks[0].name.split('_')[0] : null;
}

/**
 * Checks if a block satisfies the target criteria
 */
export function blockSatisfied(targetName, block) {
    const specialCases = {
        'dirt': () => block.name === 'dirt' || block.name === 'grass_block',
        'bed': () => block.name.endsWith('bed'),
        'torch': () => block.name.includes('torch')
    };

    if (targetName in specialCases) {
        return specialCases[targetName]();
    }

    if (mc.MATCHING_WOOD_BLOCKS.includes(targetName)) {
        return block.name.endsWith(targetName);
    }

    return block.name === targetName;
}

/**
 * Checks if the bot has sufficient quantities of an item or better alternatives
 */
export function itemSatisfied(bot, item, quantity = 1) {
    const qualifyingItems = getQualifyingItems(item);
    return qualifyingItems.some(qualifyingItem => 
        world.getInventoryCounts(bot)[qualifyingItem] >= quantity
    );
}

/**
 * Gets all qualifying items including upgrades
 * @private
 */
function getQualifyingItems(item) {
    if (!isTool(item)) return [item];

    const [material, type] = item.split('_');
    const materialTiers = {
        'wooden': ['stone', 'iron', 'gold', 'diamond'],
        'stone': ['iron', 'gold', 'diamond'],
        'iron': ['gold', 'diamond'],
        'gold': ['diamond'],
        'diamond': []
    };

    return [item, ...materialTiers[material].map(tier => `${tier}_${type}`)];
}

/**
 * Checks if an item is a tool
 * @private
 */
function isTool(item) {
    const toolTypes = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'];
    return toolTypes.some(tool => item.includes(tool));
}

/**
 * Rotates coordinates based on orientation
 */
export function rotateXZ(x, z, orientation, sizeX, sizeZ) {
    const rotations = [
        [x, z],
        [z, sizeX - x - 1],
        [sizeX - x - 1, sizeZ - z - 1],
        [sizeZ - z - 1, x]
    ];
    
    return rotations[orientation] || rotations[0];
}
