import { Vec3 } from 'vec3';
import * as skills from '../library/skills.js';
import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js'; 
import { blockSatisfied, getTypeOfGeneric, rotateXZ } from './utils.js';

export class BuildGoal {
    constructor(agent) {
        this.agent = agent;
    }

    async wrapSkill(func) {
        if (!this.agent.isIdle()) {
            return false;
        }
        const res = await this.agent.actions.runAction('BuildGoal', func);
        return !res.interrupted;
    }

    async executeNext(goal, position = null, orientation = null) {
        const { blocks } = goal;
        const dimensions = this.getDimensions(blocks);
        
        position = position || await this.findBuildPosition(dimensions.x);
        orientation = orientation ?? Math.floor(Math.random() * 4);

        const inventory = world.getInventoryCounts(this.agent.bot);
        const result = {
            missing: {},
            acted: false,
            position,
            orientation
        };

        if (!position) {
            return result;
        }

        for (let y = goal.offset; y < dimensions.y + goal.offset; y++) {
            for (let z = 0; z < dimensions.z; z++) {
                for (let x = 0; x < dimensions.x; x++) {
                    const success = await this.processBlock(
                        goal, x, y, z, 
                        dimensions, 
                        orientation,
                        position,
                        inventory,
                        result
                    );

                    if (!success) {
                        return result;
                    }
                }
            }
        }

        return result;
    }

    getDimensions(blocks) {
        return {
            x: blocks[0][0].length,
            z: blocks[0].length,
            y: blocks.length
        };
    }

    async findBuildPosition(sizeX) {
        for (let x = 0; x < sizeX - 1; x++) {
            const pos = world.getNearestFreeSpace(this.agent.bot, sizeX - x, 16);
            if (pos) return pos;
        }
        return null;
    }

    async processBlock(goal, x, y, z, dimensions, orientation, position, inventory, result) {
        const [rx, rz] = rotateXZ(x, z, orientation, dimensions.x, dimensions.z);
        const ry = y - goal.offset;
        const blockName = goal.blocks[ry][rz][rx];

        if (!blockName || blockName === '') {
            return true;
        }

        const worldPos = new Vec3(
            position.x + x,
            position.y + y, 
            position.z + z
        );
        const currentBlock = this.agent.bot.blockAt(worldPos);

        if (currentBlock && !blockSatisfied(blockName, currentBlock)) {
            result.acted = true;

            if (currentBlock.name !== 'air') {
                const breakSuccess = await this.breakExistingBlock(worldPos);
                if (!breakSuccess) return false;
            }

            if (blockName !== 'air') {
                const placeSuccess = await this.placeNewBlock(
                    blockName,
                    worldPos,
                    inventory,
                    result.missing
                );
                if (!placeSuccess) return false;
            }
        }

        return true;
    }

    async breakExistingBlock(position) {
        return await this.wrapSkill(async () => {
            await skills.breakBlockAt(
                this.agent.bot,
                position.x,
                position.y,
                position.z
            );
        });
    }

    async placeNewBlock(blockName, position, inventory, missing) {
        const blockType = getTypeOfGeneric(this.agent.bot, blockName);
        
        if (inventory[blockType] > 0) {
            return await this.wrapSkill(async () => {
                await skills.placeBlock(
                    this.agent.bot,
                    blockType,
                    position.x,
                    position.y,
                    position.z
                );
            });
        } else {
            missing[blockType] = (missing[blockType] || 0) + 1;
            return true;
        }
    }
}
