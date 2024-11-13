import minecraftData from 'minecraft-data';
import settings from '../../settings.js';
import { createBot } from 'mineflayer';
import prismarine_items from 'prismarine-item';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as collectblock } from 'mineflayer-collectblock';
import { plugin as autoEat } from 'mineflayer-auto-eat';
import plugin from 'mineflayer-armor-manager';

// Constants
const MINECRAFT_VERSION = settings.minecraft_version;
const mcdata = minecraftData(MINECRAFT_VERSION);
const Item = prismarine_items(MINECRAFT_VERSION);

// Type definitions
/**
 * @typedef {string} ItemName
 * @typedef {string} BlockName
*/

// Game data constants
export const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];
export const MATCHING_WOOD_BLOCKS = [
    'log', 'planks', 'sign', 'boat', 'fence_gate', 'door', 'fence',
    'slab', 'stairs', 'button', 'pressure_plate', 'trapdoor'
];
export const WOOL_COLORS = [
    'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
    'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
    'brown', 'green', 'red', 'black'
];

// Lookup tables
const SMELTABLE_ITEMS = [
    'beef', 'chicken', 'cod', 'mutton', 'porkchop', 'rabbit',
    'salmon', 'tropical_fish', 'potato', 'kelp', 'sand',
    'cobblestone', 'clay_ball'
];

const SMELTING_MAP = {
    'baked_potato': 'potato',
    'steak': 'raw_beef',
    'cooked_chicken': 'raw_chicken',
    'cooked_cod': 'raw_cod',
    'cooked_mutton': 'raw_mutton',
    'cooked_porkchop': 'raw_porkchop',
    'cooked_rabbit': 'raw_rabbit',
    'cooked_salmon': 'raw_salmon',
    'dried_kelp': 'kelp',
    'iron_ingot': 'raw_iron',
    'gold_ingot': 'raw_gold',
    'copper_ingot': 'raw_copper',
    'glass': 'sand'
};

const ANIMAL_DROPS = {
    'raw_beef': 'cow',
    'raw_chicken': 'chicken',
    'raw_cod': 'cod',
    'raw_mutton': 'sheep',
    'raw_porkchop': 'pig',
    'raw_rabbit': 'rabbit',
    'raw_salmon': 'salmon',
    'leather': 'cow',
    'wool': 'sheep'
};

const FUEL_BURN_TIMES = {
    'coal': 8,
    'charcoal': 8,
    'coal_block': 80,
    'lava_bucket': 100
};

// Bot initialization
export function initBot(username) {
    const bot = createBot({
        username,
        host: settings.host,
        port: settings.port,
        auth: settings.auth,
        version: MINECRAFT_VERSION,
    });

    // Load plugins
    const plugins = [pathfinder, pvp, collectblock, autoEat, plugin];
    plugins.forEach(plugin => bot.loadPlugin(plugin));

    return bot;
}

// Entity checks
export function isHuntable(mob) {
    if (!mob?.name) return false;
    const animals = ['chicken', 'cow', 'llama', 'mooshroom', 'pig', 'rabbit', 'sheep'];
    return animals.includes(mob.name.toLowerCase()) && !mob.metadata[16];
}

export function isHostile(mob) {
    if (!mob?.name) return false;
    return (mob.type === 'mob' || mob.type === 'hostile') && 
           !['iron_golem', 'snow_golem'].includes(mob.name);
}

// Item and block utilities
export function getItemId(itemName) {
    return mcdata.itemsByName[itemName]?.id ?? null;
}

export function getItemName(itemId) {
    return mcdata.items[itemId]?.name ?? null;
}

export function getBlockId(blockName) {
    return mcdata.blocksByName[blockName]?.id ?? null;
}

export function getBlockName(blockId) {
    return mcdata.blocks[blockId]?.name ?? null;
}

// Collection getters
export function getAllItems(ignore = []) {
    return Object.values(mcdata.items)
        .filter(item => !ignore.includes(item.name));
}

export function getAllItemIds(ignore) {
    return getAllItems(ignore).map(item => item.id);
}

export function getAllBlocks(ignore = []) {
    return Object.values(mcdata.blocks)
        .filter(block => !ignore.includes(block.name));
}

export function getAllBlockIds(ignore) {
    return getAllBlocks(ignore).map(block => block.id);
}

export function getAllBiomes() {
    return mcdata.biomes;
}

// Crafting and recipes
export function getItemCraftingRecipes(itemName) {
    const itemId = getItemId(itemName);
    if (!mcdata.recipes[itemId]) return null;

    return mcdata.recipes[itemId].map(r => {
        const recipe = {};
        const ingredients = r.ingredients || r.inShape?.flat() || [];
        
        ingredients.forEach(ingredient => {
            const ingredientName = getItemName(ingredient);
            if (ingredientName) {
                recipe[ingredientName] = (recipe[ingredientName] || 0) + 1;
            }
        });

        return recipe;
    });
}

// Smelting utilities
export function isSmeltable(itemName) {
    return itemName.includes('raw') || 
           itemName.includes('log') || 
           SMELTABLE_ITEMS.includes(itemName);
}

export function getSmeltingFuel(bot) {
    const inventory = bot.inventory.items();
    
    // Priority order: coal/charcoal -> wood -> high-value fuels
    return inventory.find(i => ['coal', 'charcoal'].includes(i.name)) ||
           inventory.find(i => i.name.includes('log') || i.name.includes('planks')) ||
           inventory.find(i => ['coal_block', 'lava_bucket'].includes(i.name));
}

export function getFuelSmeltOutput(fuelName) {
    if (FUEL_BURN_TIMES[fuelName]) return FUEL_BURN_TIMES[fuelName];
    if (fuelName.includes('log') || fuelName.includes('planks')) return 1.5;
    return 0;
}

export function getItemSmeltingIngredient(itemName) {
    return SMELTING_MAP[itemName] || null;
}

// Source identification
export function getItemBlockSources(itemName) {
    const itemId = getItemId(itemName);
    return getAllBlocks()
        .filter(block => block.drops.includes(itemId))
        .map(block => block.name);
}

export function getItemAnimalSource(itemName) {
    return ANIMAL_DROPS[itemName] || null;
}

// Tool utilities
export function getBlockTool(blockName) {
    const block = mcdata.blocksByName[blockName];
    if (!block?.harvestTools) return null;
    return getItemName(Object.keys(block.harvestTools)[0]);
}

export function makeItem(name, amount = 1) {
    return new Item(getItemId(name), amount);
}

// Recipe calculation utilities
export function ingredientsFromPrismarineRecipe(recipe) {
    const requiredIngredients = {};

    if (recipe.inShape) {
        recipe.inShape.flat()
            .filter(ingredient => ingredient.id >= 0)
            .forEach(ingredient => {
                const name = getItemName(ingredient.id);
                requiredIngredients[name] = (requiredIngredients[name] || 0) + ingredient.count;
            });
    }

    if (recipe.ingredients) {
        recipe.ingredients
            .filter(ingredient => ingredient.id >= 0)
            .forEach(ingredient => {
                const name = getItemName(ingredient.id);
                requiredIngredients[name] = (requiredIngredients[name] || 0) - ingredient.count;
            });
    }

    return requiredIngredients;
}

/**
 * Calculates the number of times an action can be completed with available resources.
 * @template T
 * @param {Object.<T, number>} availableItems - Available resources
 * @param {Object.<T, number>} requiredItems - Required resources per action
 * @param {boolean} discrete - Whether the action must be completed in whole units
 * @returns {{num: number, limitingResource: (T | null)}}
 */
export function calculateLimitingResource(availableItems, requiredItems, discrete = true) {
    let limitingResource = null;
    let num = Infinity;

    for (const itemType in requiredItems) {
        const possible = availableItems[itemType] / requiredItems[itemType];
        if (possible < num) {
            num = possible;
            limitingResource = itemType;
        }
    }

    return {
        num: discrete ? Math.floor(num) : num,
        limitingResource
    };
}
