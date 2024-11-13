import pf from 'mineflayer-pathfinder';
import * as mc from '../../utils/mcdata.js';

export class WorldHelper {
    /**
     * Helper class for interacting with the Minecraft world
     */
    static getNearestFreeSpace(bot, size = 1, distance = 8) {
        const emptyPositions = bot.findBlocks({
            matching: block => block?.name === 'air',
            maxDistance: distance,
            count: 1000
        });

        for (const pos of emptyPositions) {
            let isEmpty = true;
            for (let x = 0; x < size && isEmpty; x++) {
                for (let z = 0; z < size && isEmpty; z++) {
                    const top = bot.blockAt(pos.offset(x, 0, z));
                    const bottom = bot.blockAt(pos.offset(x, -1, z));
                    
                    if (!top || top.name !== 'air' || !bottom || !bottom.drops.length || !bottom.diggable) {
                        isEmpty = false;
                    }
                }
            }
            if (isEmpty) return pos;
        }
        return null;
    }

    static getNearestBlocks(bot, blockTypes = null, distance = 16, count = 10000) {
        const blockIds = blockTypes === null 
            ? mc.getAllBlockIds(['air'])
            : (Array.isArray(blockTypes) ? blockTypes : [blockTypes]).map(type => mc.getBlockId(type));

        const positions = bot.findBlocks({
            matching: blockIds, 
            maxDistance: distance, 
            count: count
        });

        return positions
            .map(pos => ({
                block: bot.blockAt(pos),
                distance: pos.distanceTo(bot.entity.position)
            }))
            .sort((a, b) => a.distance - b.distance)
            .map(item => item.block);
    }

    static getNearestBlock(bot, blockType, distance = 16) {
        const blocks = this.getNearestBlocks(bot, blockType, distance, 1);
        return blocks.length ? blocks[0] : null;
    }

    static getNearbyEntities(bot, maxDistance = 16) {
        return Object.values(bot.entities)
            .filter(entity => entity.position.distanceTo(bot.entity.position) <= maxDistance)
            .sort((a, b) => 
                a.position.distanceTo(bot.entity.position) - 
                b.position.distanceTo(bot.entity.position)
            );
    }

    static getNearestEntityWhere(bot, predicate, maxDistance = 16) {
        return bot.nearestEntity(entity => 
            predicate(entity) && 
            bot.entity.position.distanceTo(entity.position) < maxDistance
        );
    }

    static getNearbyPlayers(bot, maxDistance = 16) {
        return Object.values(bot.entities)
            .filter(entity => 
                entity.type === 'player' &&
                entity.username !== bot.username &&
                entity.position.distanceTo(bot.entity.position) <= maxDistance
            )
            .sort((a, b) => 
                a.position.distanceTo(bot.entity.position) - 
                b.position.distanceTo(bot.entity.position)
            );
    }

    static getInventoryStacks(bot) {
        return bot.inventory.items().filter(item => item != null);
    }

    static getInventoryCounts(bot) {
        return this.getInventoryStacks(bot).reduce((acc, item) => {
            acc[item.name] = (acc[item.name] || 0) + item.count;
            return acc;
        }, {});
    }

    static getCraftableItems(bot) {
        const table = this.getNearestBlock(bot, 'crafting_table') || 
            bot.inventory.items().find(item => item?.name === 'crafting_table');

        return mc.getAllItems()
            .filter(item => bot.recipesFor(item.id, null, 1, table).length > 0)
            .map(item => item.name);
    }

    static getPosition(bot) {
        return bot.entity.position;
    }

    static getNearbyEntityTypes(bot) {
        return [...new Set(this.getNearbyEntities(bot).map(entity => entity.name))];
    }

    static getNearbyPlayerNames(bot) {
        return [...new Set(this.getNearbyPlayers(bot).map(player => player.username))];
    }

    static getNearbyBlockTypes(bot, distance = 16) {
        return [...new Set(this.getNearestBlocks(bot, null, distance).map(block => block.name))];
    }

    static async isClearPath(bot, target) {
        const movements = new pf.Movements(bot);
        movements.canDig = false;
        movements.canPlaceOn = false;
        
        const goal = new pf.goals.GoalNear(
            target.position.x,
            target.position.y, 
            target.position.z,
            1
        );

        const path = await bot.pathfinder.getPathTo(movements, goal, 100);
        return path.status === 'success';
    }

    static shouldPlaceTorch(bot) {
        if (!bot.modes.isOn('torch_placing') || bot.interrupt_code) return false;

        const pos = this.getPosition(bot);
        let nearestTorch = this.getNearestBlock(bot, 'torch', 6) || 
                          this.getNearestBlock(bot, 'wall_torch', 6);

        if (!nearestTorch) {
            const block = bot.blockAt(pos);
            const hasTorch = bot.inventory.items().some(item => item.name === 'torch');
            return hasTorch && block.name === 'air';
        }
        return false;
    }

    static getBiomeName(bot) {
        const biomeId = bot.world.getBiome(bot.entity.position);
        return mc.getAllBiomes()[biomeId].name;
    }
}

export const {
    getNearestFreeSpace,
    getNearestBlocks,
    getNearestBlock,
    getNearbyEntities,
    getNearestEntityWhere,
    getNearbyPlayers,
    getInventoryStacks,
    getInventoryCounts,
    getCraftableItems,
    getPosition,
    getNearbyEntityTypes,
    getNearbyPlayerNames,
    getNearbyBlockTypes,
    isClearPath,
    shouldPlaceTorch,
    getBiomeName
} = WorldHelper;
