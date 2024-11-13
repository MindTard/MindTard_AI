import { readdirSync, readFileSync } from 'fs';
import { NPCData } from './data.js';
import { ItemGoal } from './item_goal.js';
import { BuildGoal } from './build_goal.js';
import { itemSatisfied, rotateXZ } from './utils.js';
import * as skills from '../library/skills.js';
import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';

export class NPCController {
    constructor(agent) {
        this.agent = agent;
        this.data = NPCData.fromObject(agent.prompter.profile.npc);
        this.goals = {
            temporary: [],
            current: null,
            history: {}
        };
        this.itemGoal = new ItemGoal(agent, this.data);
        this.buildGoal = new BuildGoal(agent);
        this.structures = this.loadConstructions();
    }

    loadConstructions() {
        const structures = {};
        try {
            const files = readdirSync('src/agent/npc/construction');
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const name = file.slice(0, -5);
                    structures[name] = JSON.parse(readFileSync(`src/agent/npc/construction/${file}`, 'utf8'));
                    this.normalizeStructureSize(structures[name]);
                }
            }
        } catch (error) {
            console.error('Error loading construction files:', error);
        }
        return structures;
    }

    normalizeStructureSize(structure) {
        const blocks = structure.blocks;
        const maxSize = Math.max(
            blocks[0][0].length,
            blocks[0].length
        );

        for (let y = 0; y < blocks.length; y++) {
            for (let z = 0; z < maxSize; z++) {
                if (z >= blocks[y].length) {
                    blocks[y].push([]);
                }
                for (let x = 0; x < maxSize; x++) {
                    if (x >= blocks[y][z].length) {
                        blocks[y][z].push('');
                    }
                }
            }
        }
    }

    getBuiltPositions() {
        const positions = [];
        for (const [name, buildData] of Object.entries(this.data.built)) {
            const structure = this.structures[name];
            const { position } = buildData;
            const { offset } = structure;
            const [sizeX, sizeZ, sizeY] = this.getStructureDimensions(structure);

            for (let y = offset; y < sizeY + offset; y++) {
                for (let z = 0; z < sizeZ; z++) {
                    for (let x = 0; x < sizeX; x++) {
                        positions.push({
                            x: position.x + x,
                            y: position.y + y,
                            z: position.z + z
                        });
                    }
                }
            }
        }
        return positions;
    }

    getStructureDimensions(structure) {
        return [
            structure.blocks[0][0].length,
            structure.blocks[0].length,
            structure.blocks.length
        ];
    }

    init() {
        this.agent.bot.on('idle', async () => {
            if (!this.hasActiveGoals()) return;

            // Wait before acting independently
            await this.waitForInput();
            if (!this.agent.isIdle()) return;

            // Pursue goal
            if (!this.agent.actions.resume_func) {
                await this.executeNext();
                this.agent.history.save();
            }
        });
    }

    hasActiveGoals() {
        return this.data.goals.length > 0 || this.data.curr_goal;
    }

    async waitForInput(ms = 5000) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    async setGoal(name = null, quantity = 1) {
        this.goals.current = null;
        this.goals.history = {};

        if (name) {
            this.data.curr_goal = { name, quantity };
            return;
        }

        if (!this.data.do_set_goal) return;

        const pastGoals = { ...this.goals.history };
        for (const goal of this.data.goals) {
            if (pastGoals[goal.name] === undefined) {
                pastGoals[goal.name] = true;
            }
        }

        const newGoal = await this.agent.prompter.promptGoalSetting(
            this.agent.history.getHistory(),
            pastGoals
        );

        if (newGoal) {
            this.data.curr_goal = newGoal;
            console.log(`Set new goal: ${newGoal.name} x${newGoal.quantity}`);
        } else {
            console.log('Error setting new goal.');
        }
    }

    async executeNext() {
        if (!this.agent.isIdle()) return;

        await this.moveAwayFromCurrentPosition();

        if (this.shouldPerformDaytimeActivities()) {
            await this.handleDaytimeActivities();
        } else {
            await this.handleNighttimeActivities();
        }

        if (this.agent.isIdle()) {
            this.agent.bot.emit('idle');
        }
    }

    async moveAwayFromCurrentPosition() {
        await this.agent.actions.runAction('npc:moveAway', async () => {
            await skills.moveAway(this.agent.bot, 2);
        });
    }

    shouldPerformDaytimeActivities() {
        return !this.data.do_routine || this.agent.bot.time.timeOfDay < 13000;
    }

    async handleDaytimeActivities() {
        await this.exitCurrentBuilding();
        await this.executeGoal();
    }

    async handleNighttimeActivities() {
        this.data.curr_goal = null;
        await this.returnHome();
        await this.goToBed();
    }

    async exitCurrentBuilding() {
        const building = this.currentBuilding();
        if (building === this.data.home) {
            const doorPos = this.getBuildingDoor(building);
            if (doorPos) {
                await this.agent.actions.runAction('npc:exitBuilding', async () => {
                    await skills.useDoor(this.agent.bot, doorPos);
                    await skills.moveAway(this.agent.bot, 2);
                });
            }
        }
    }

    async returnHome() {
        const currentBuilding = this.currentBuilding();
        if (this.data.home && currentBuilding !== this.data.home) {
            const doorPos = this.getBuildingDoor(this.data.home);
            await this.agent.actions.runAction('npc:returnHome', async () => {
                await skills.useDoor(this.agent.bot, doorPos);
            });
        }
    }

    async goToBed() {
        await this.agent.actions.runAction('npc:bed', async () => {
            await skills.goToBed(this.agent.bot);
        });
    }

    async executeGoal() {
        const allGoals = [...this.goals.temporary, ...this.data.goals];
        if (this.data.curr_goal) {
            allGoals.push(this.data.curr_goal);
        }
        this.goals.temporary = [];

        let acted = false;
        for (const goal of allGoals) {
            acted = await this.processGoal(goal);
            if (acted) break;
        }

        if (!acted && this.data.do_set_goal) {
            await this.setGoal();
        }
    }

    async processGoal(goal) {
        if (!this.structures[goal.name]) {
            return await this.handleItemGoal(goal);
        }
        return await this.handleBuildGoal(goal);
    }

    async handleItemGoal(goal) {
        if (!itemSatisfied(this.agent.bot, goal.name, goal.quantity)) {
            const result = await this.itemGoal.executeNext(goal.name, goal.quantity);
            this.goals.history[goal.name] = result;
            return true;
        }
        return false;
    }

    async handleBuildGoal(goal) {
        const result = await this.executeBuildTask(goal);
        this.processBuildResult(goal, result);
        return result.acted;
    }

    async executeBuildTask(goal) {
        if (this.data.built[goal.name]) {
            return await this.buildGoal.executeNext(
                this.structures[goal.name],
                this.data.built[goal.name].position,
                this.data.built[goal.name].orientation
            );
        }

        const result = await this.buildGoal.executeNext(this.structures[goal.name]);
        this.data.built[goal.name] = {
            name: goal.name,
            position: result.position,
            orientation: result.orientation
        };
        return result;
    }

    processBuildResult(goal, result) {
        if (Object.keys(result.missing).length === 0) {
            this.data.home = goal.name;
        }

        for (const [blockName, quantity] of Object.entries(result.missing)) {
            this.goals.temporary.push({
                name: blockName,
                quantity
            });
        }

        if (result.acted) {
            this.goals.history[goal.name] = Object.keys(result.missing).length === 0;
        }
    }

    currentBuilding() {
        const botPos = this.agent.bot.entity.position;
        
        for (const [name, buildData] of Object.entries(this.data.built)) {
            const structure = this.structures[name];
            const [sizeX, sizeZ, sizeY] = this.getStructureDimensions(structure);
            
            let finalSizeX = sizeX;
            let finalSizeZ = sizeZ;
            
            if (buildData.orientation % 2 === 1) {
                [finalSizeX, finalSizeZ] = [finalSizeZ, finalSizeX];
            }

            const isInside = this.isPositionInsideBuilding(
                botPos,
                buildData.position,
                structure.offset,
                finalSizeX,
                finalSizeZ,
                sizeY
            );

            if (isInside) return name;
        }
        return null;
    }

    isPositionInsideBuilding(botPos, buildingPos, offset, sizeX, sizeZ, sizeY) {
        return (
            botPos.x >= buildingPos.x &&
            botPos.x < buildingPos.x + sizeX &&
            botPos.y >= buildingPos.y + offset &&
            botPos.y < buildingPos.y + sizeY + offset &&
            botPos.z >= buildingPos.z &&
            botPos.z < buildingPos.z + sizeZ
        );
    }

    getBuildingDoor(name) {
        if (!name || !this.data.built[name]) return null;

        const doorPosition = this.findDoorPosition(name);
        if (!doorPosition) return null;

        return this.calculateFinalDoorPosition(name, doorPosition);
    }

    findDoorPosition(name) {
        const structure = this.structures[name];
        for (let y = 0; y < structure.blocks.length; y++) {
            for (let z = 0; z < structure.blocks[y].length; z++) {
                for (let x = 0; x < structure.blocks[y][z].length; x++) {
                    if (structure.blocks[y][z][x]?.includes('door')) {
                        return { x, y, z };
                    }
                }
            }
        }
        return null;
    }

    calculateFinalDoorPosition(name, doorPos) {
        const structure = this.structures[name];
        const buildData = this.data.built[name];
        const [sizeX, sizeZ] = this.getStructureDimensions(structure);

        let orientation = 4 - buildData.orientation;
        if (orientation === 4) orientation = 0;

        const [rotatedX, rotatedZ] = rotateXZ(
            doorPos.x,
            doorPos.z,
            orientation,
            sizeX,
            sizeZ
        );

        return {
            x: buildData.position.x + rotatedX,
            y: buildData.position.y + doorPos.y + structure.offset,
            z: buildData.position.z + rotatedZ
        };
    }
}
