import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';

class QueryHandler {
    static pad(str) {
        return '\n' + str + '\n';
    }

    static getTimeOfDay(timeOfDay) {
        if (timeOfDay < 6000) return 'Morning';
        if (timeOfDay < 12000) return 'Afternoon';
        return 'Night';
    }

    static getWeather(bot) {
        if (bot.thunderState > 0) return 'Thunderstorm';
        if (bot.rainState > 0) return 'Rain';
        return 'Clear';
    }

    static formatEquipment(slot, type) {
        return slot ? `\n${type}: ${slot.name}` : '';
    }

    static getStats(agent) {
        const bot = agent.bot;
        const pos = bot.entity.position;
        let res = 'STATS';

        res += `\n- Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`;
        res += `\n- Gamemode: ${bot.game.gameMode}`;
        res += `\n- Health: ${Math.round(bot.health)} / 20`;
        res += `\n- Hunger: ${Math.round(bot.food)} / 20`;
        res += `\n- Biome: ${world.getBiomeName(bot)}`;
        res += `\n- Weather: ${this.getWeather(bot)}`;
        res += `\n- Time: ${this.getTimeOfDay(bot.time.timeOfDay)}`;

        const otherPlayers = world.getNearbyPlayerNames(bot);
        if (otherPlayers.length > 0) {
            res += '\n- Other Players: ' + otherPlayers.join(', ');
        }

        res += '\n' + agent.bot.modes.getMiniDocs() + '\n';
        return this.pad(res);
    }

    static getInventory(agent) {
        const bot = agent.bot;
        const inventory = world.getInventoryCounts(bot);
        let res = 'INVENTORY';

        // Inventory items
        Object.entries(inventory).forEach(([item, count]) => {
            if (count > 0) res += `\n- ${item}: ${count}`;
        });

        if (res === 'INVENTORY') {
            res += ': none';
        } else if (bot.game.gameMode === 'creative') {
            res += '\n(You have infinite items in creative mode. You do not need to gather resources!!)';
        }

        // Equipment
        res += '\nWEARING: ';
        const equipment = {
            'Head': bot.inventory.slots[5],
            'Torso': bot.inventory.slots[6],
            'Legs': bot.inventory.slots[7],
            'Feet': bot.inventory.slots[8]
        };

        const wearingItems = Object.entries(equipment)
            .map(([type, slot]) => this.formatEquipment(slot, type))
            .filter(item => item)
            .join('');

        res += wearingItems || 'None';

        return this.pad(res);
    }

    static getNearbyBlocks(agent) {
        const blocks = world.getNearbyBlockTypes(agent.bot);
        let res = 'NEARBY_BLOCKS';
        
        blocks.forEach(block => res += `\n- ${block}`);
        
        if (blocks.length === 0) {
            res += ': none';
        }
        return this.pad(res);
    }

    static getCraftable(agent) {
        const craftable = world.getCraftableItems(agent.bot);
        let res = 'CRAFTABLE_ITEMS';
        
        craftable.forEach(item => res += `\n- ${item}`);
        
        if (res === 'CRAFTABLE_ITEMS') {
            res += ': none';
        }
        return this.pad(res);
    }

    static getEntities(agent) {
        const bot = agent.bot;
        let res = 'NEARBY_ENTITIES';

        world.getNearbyPlayerNames(bot).forEach(entity => {
            res += `\n- player: ${entity}`;
        });

        world.getNearbyEntityTypes(bot).forEach(entity => {
            if (entity !== 'player' && entity !== 'item') {
                res += `\n- entities: ${entity}`;
            }
        });

        if (res === 'NEARBY_ENTITIES') {
            res += ': none';
        }
        return this.pad(res);
    }
}

export const queryList = [
    {
        name: "!stats",
        description: "Get your bot's location, health, hunger, and time of day.",
        perform: (agent) => QueryHandler.getStats(agent)
    },
    {
        name: "!inventory", 
        description: "Get your bot's inventory.",
        perform: (agent) => QueryHandler.getInventory(agent)
    },
    {
        name: "!nearbyBlocks",
        description: "Get the blocks near the bot.",
        perform: (agent) => QueryHandler.getNearbyBlocks(agent)
    },
    {
        name: "!craftable",
        description: "Get the craftable items with the bot's inventory.",
        perform: (agent) => QueryHandler.getCraftable(agent)
    },
    {
        name: "!entities",
        description: "Get the nearby players and entities.",
        perform: (agent) => QueryHandler.getEntities(agent)
    },
    {
        name: "!modes",
        description: "Get all available modes and their docs and see which are on/off.",
        perform: (agent) => agent.bot.modes.getDocs()
    },
    {
        name: '!savedPlaces',
        description: 'List all saved locations.',
        perform: async (agent) => "Saved place names: " + agent.memory_bank.getKeys()
    }
];
