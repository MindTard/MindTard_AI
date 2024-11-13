import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';
import settings from '../../settings.js';
import { handleTranslation } from '../utils/translator.js';

class Mode {
    constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.interrupts = config.interrupts || [];
        this.on = config.on || false;
        this.active = false;
        this.paused = false;
        this.update = config.update;
        
        // Copy any additional properties
        Object.assign(this, config);
    }
}

async function say(agent, message) {
    agent.bot.modes.behavior_log += message + '\n';
    if (agent.shut_up || !settings.narrate_behavior) return;
    let translation = await handleTranslation(message);
    agent.bot.chat(translation);
}

async function execute(mode, agent, func, timeout = -1) {
    if (agent.self_prompter.on) {
        agent.self_prompter.stopLoop();
    }
    mode.active = true;
    let code_return = await agent.actions.runAction(`mode:${mode.name}`, async () => {
        await func();
    }, { timeout });
    mode.active = false;
    console.log(`Mode ${mode.name} finished executing, code_return: ${code_return.message}`);
}

const modeConfigs = [
    {
        name: 'self_preservation',
        description: 'Respond to drowning, burning, and damage at low health. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        fall_blocks: ['sand', 'gravel', 'concrete_powder'],
        async update(agent) {
            const bot = agent.bot;
            const [block, blockAbove] = this.getBlocks(bot);

            if (this.isUnderwater(blockAbove)) {
                this.handleUnderwater(bot);
            }
            else if (this.isUnderFallingBlock(blockAbove)) {
                await this.handleFallingBlock(bot, agent);
            }
            else if (this.isInDanger(block, blockAbove)) {
                await this.handleDanger(bot, agent);
            }
            else if (this.isLowHealth(bot)) {
                await this.handleLowHealth(bot, agent);
            }
            else if (agent.isIdle()) {
                bot.clearControlStates();
            }
        },

        getBlocks(bot) {
            let block = bot.blockAt(bot.entity.position) || { name: 'air' };
            let blockAbove = bot.blockAt(bot.entity.position.offset(0, 1, 0)) || { name: 'air' };
            return [block, blockAbove];
        },

        isUnderwater(blockAbove) {
            return blockAbove.name === 'water' || blockAbove.name === 'flowing_water';
        },

        isUnderFallingBlock(blockAbove) {
            return this.fall_blocks.some(name => blockAbove.name.includes(name));
        },

        isInDanger(block, blockAbove) {
            const dangerousBlocks = ['lava', 'flowing_lava', 'fire'];
            return dangerousBlocks.includes(block.name) || dangerousBlocks.includes(blockAbove.name);
        },

        isLowHealth(bot) {
            return Date.now() - bot.lastDamageTime < 3000 && 
                   (bot.health < 5 || bot.lastDamageTaken >= bot.health);
        },

        handleUnderwater(bot) {
            if (!bot.pathfinder.goal) {
                bot.setControlState('jump', true);
            }
        },

        async handleFallingBlock(bot, agent) {
            execute(this, agent, async () => {
                await skills.moveAway(bot, 2);
            });
        },

        async handleDanger(bot, agent) {
            say(agent, "I'm on fire!");
            execute(this, agent, async () => {
                let nearestWater = world.getNearestBlock(bot, 'water', 20);
                if (nearestWater) {
                    const pos = nearestWater.position;
                    await skills.goToPosition(bot, pos.x, pos.y, pos.z, 0.2);
                    say(agent, "Ahhhh that's better!");
                } else {
                    await skills.moveAway(bot, 5);
                }
            });
        },

        async handleLowHealth(bot, agent) {
            say(agent, "I'm dying!");
            execute(this, agent, async () => {
                await skills.moveAway(bot, 20);
            });
        }
    },

    {
        name: 'unstuck',
        description: 'Attempt to get unstuck when in the same place for a while. Interrupts some actions.',
        interrupts: ['all'],
        on: true,
        prev_location: null,
        distance: 2,
        stuck_time: 0,
        last_time: Date.now(),
        max_stuck_time: 20,

        async update(agent) {
            if (agent.isIdle()) {
                this.resetStuckState();
                return;
            }

            const bot = agent.bot;
            this.updateStuckState(bot);

            if (this.isStuck()) {
                await this.handleStuckState(agent);
            }

            this.last_time = Date.now();
        },

        resetStuckState() {
            this.prev_location = null;
            this.stuck_time = 0;
        },

        updateStuckState(bot) {
            if (this.prev_location && this.prev_location.distanceTo(bot.entity.position) < this.distance) {
                this.stuck_time += (Date.now() - this.last_time) / 1000;
            } else {
                this.prev_location = bot.entity.position.clone();
                this.stuck_time = 0;
            }
        },

        isStuck() {
            return this.stuck_time > this.max_stuck_time;
        },

        async handleStuckState(agent) {
            say(agent, "I'm stuck!");
            this.stuck_time = 0;
            execute(this, agent, async () => {
                const crashTimeout = setTimeout(() => { 
                    agent.cleanKill("Got stuck and couldn't get unstuck") 
                }, 10000);
                await skills.moveAway(agent.bot, 5);
                clearTimeout(crashTimeout);
            });
        }
    },

    {
        name: 'cowardice',
        description: 'Run away from enemies. Interrupts all actions.',
        interrupts: ['all'],
        on: true,

        async update(agent) {
            const enemy = this.findNearbyEnemy(agent.bot);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                await this.handleEnemyPresence(agent, enemy);
            }
        },

        findNearbyEnemy(bot) {
            return world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 16);
        },

        async handleEnemyPresence(agent, enemy) {
            say(agent, `Aaa! A ${enemy.name.replace("_", " ")}!`);
            execute(this, agent, async () => {
                await skills.avoidEnemies(agent.bot, 24);
            });
        }
    },

    {
        name: 'self_defense',
        description: 'Attack nearby enemies. Interrupts all actions.',
        interrupts: ['all'],
        on: true,

        async update(agent) {
            const enemy = this.findNearbyEnemy(agent.bot);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                await this.engageEnemy(agent, enemy);
            }
        },

        findNearbyEnemy(bot) {
            return world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 8);
        },

        async engageEnemy(agent, enemy) {
            say(agent, `Fighting ${enemy.name}!`);
            execute(this, agent, async () => {
                await skills.defendSelf(agent.bot, 8);
            });
        }
    },

    {
        name: 'hunting',
        description: 'Hunt nearby animals when idle.',
        interrupts: [],
        on: true,

        async update(agent) {
            const huntable = this.findHuntableTarget(agent.bot);
            if (huntable && await world.isClearPath(agent.bot, huntable)) {
                await this.huntTarget(agent, huntable);
            }
        },

        findHuntableTarget(bot) {
            return world.getNearestEntityWhere(bot, entity => mc.isHuntable(entity), 8);
        },

        async huntTarget(agent, target) {
            execute(this, agent, async () => {
                say(agent, `Hunting ${target.name}!`);
                await skills.attackEntity(agent.bot, target);
            });
        }
    },

    {
        name: 'item_collecting',
        description: 'Collect nearby items when idle.',
        interrupts: ['action:followPlayer'],
        on: true,
        wait: 2,
        prev_item: null,
        noticed_at: -1,

        async update(agent) {
            const item = this.findNearbyItem(agent.bot);
            if (this.shouldCollectItem(agent, item)) {
                await this.handleItemCollection(agent, item);
            } else {
                this.noticed_at = -1;
            }
        },

        findNearbyItem(bot) {
            return world.getNearestEntityWhere(bot, entity => entity.name === 'item', 8);
        },

        shouldCollectItem(agent, item) {
            return item && 
                   item !== this.prev_item && 
                   agent.bot.inventory.emptySlotCount() > 1 &&
                   world.isClearPath(agent.bot, item);
        },

        async handleItemCollection(agent, item) {
            if (this.noticed_at === -1) {
                this.noticed_at = Date.now();
            }
            if (Date.now() - this.noticed_at > this.wait * 1000) {
                say(agent, `Picking up item!`);
                this.prev_item = item;
                execute(this, agent, async () => {
                    await skills.pickupNearbyItems(agent.bot);
                });
                this.noticed_at = -1;
            }
        }
    },

    {
        name: 'torch_placing',
        description: 'Place torches when idle and there are no torches nearby.',
        interrupts: ['action:followPlayer'],
        on: true,
        cooldown: 5,
        last_place: Date.now(),

        update(agent) {
            if (this.shouldPlaceTorch(agent)) {
                this.placeTorch(agent);
            }
        },

        shouldPlaceTorch(agent) {
            return world.shouldPlaceTorch(agent.bot) && 
                   Date.now() - this.last_place >= this.cooldown * 1000;
        },

        placeTorch(agent) {
            execute(this, agent, async () => {
                const pos = agent.bot.entity.position;
                await skills.placeBlock(agent.bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
            });
            this.last_place = Date.now();
        }
    },

    {
        name: 'idle_staring',
        description: 'Animation to look around at entities when idle.',
        interrupts: [],
        on: true,
        staring: false,
        last_entity: null,
        next_change: 0,

        update(agent) {
            const entity = agent.bot.nearestEntity();
            const entityInView = this.checkEntityInView(entity, agent);

            if (entityInView && entity !== this.last_entity) {
                this.startStaring(entity);
            }

            if (entityInView && this.staring) {
                this.lookAtEntity(entity, agent);
            }

            if (!entityInView) {
                this.last_entity = null;
            }

            if (Date.now() > this.next_change) {
                this.updateLookDirection(agent);
            }
        },

        checkEntityInView(entity, agent) {
            return entity && 
                   entity.position.distanceTo(agent.bot.entity.position) < 10 && 
                   entity.name !== 'enderman';
        },

        startStaring(entity) {
            this.staring = true;
            this.last_entity = entity;
            this.next_change = Date.now() + Math.random() * 1000 + 4000;
        },

        lookAtEntity(entity, agent) {
            const isBaby = entity.type !== 'player' && entity.metadata[16];
            const height = isBaby ? entity.height/2 : entity.height;
            agent.bot.lookAt(entity.position.offset(0, height, 0));
        },

        updateLookDirection(agent) {
            this.staring = Math.random() < 0.3;
            if (!this.staring) {
                const yaw = Math.random() * Math.PI * 2;
                const pitch = (Math.random() * Math.PI/2) - Math.PI/4;
                agent.bot.look(yaw, pitch, false);
            }
            this.next_change = Date.now() + Math.random() * 10000 + 2000;
        }
    },

    {
        name: 'cheat',
        description: 'Use cheats to instantly place blocks and teleport.',
        interrupts: [],
        on: false,
        update: function (agent) { /* do nothing */ }
    }
];

class ModeController {
    constructor(agent) {
        this.agent = agent;
        this.modes_list = modeConfigs.map(config => new Mode(config));
        this.modes_map = Object.fromEntries(
            this.modes_list.map(mode => [mode.name, mode])
        );
        this.behavior_log = '';
    }

    exists(mode_name) {
        return this.modes_map[mode_name] != null;
    }

    setOn(mode_name, on) {
        this.modes_map[mode_name].on = on;
    }

    isOn(mode_name) {
        return this.modes_map[mode_name].on;
    }

    pause(mode_name) {
        this.modes_map[mode_name].paused = true;
    }

    unpause(mode_name) {
        this.modes_map[mode_name].paused = false;
    }

    unPauseAll() {
        this.modes_list.forEach(mode => {
            if (mode.paused) console.log(`Unpausing mode ${mode.name}`);
            mode.paused = false;
        });
    }

    getMiniDocs() {
        return ['Agent Modes:', 
            ...this.modes_list.map(mode => 
                `- ${mode.name}(${mode.on ? 'ON' : 'OFF'})`)
        ].join('\n');
    }

    getDocs() {
        return ['Agent Modes:', 
            ...this.modes_list.map(mode => 
                `- ${mode.name}(${mode.on ? 'ON' : 'OFF'}): ${mode.description}`)
        ].join('\n');
    }

    async update() {
        if (this.agent.isIdle()) {
            this.unPauseAll();
        }

        for (const mode of this.modes_list) {
            const interruptible = mode.interrupts.includes('all') || 
                                mode.interrupts.includes(this.agent.actions.currentActionLabel);

            if (mode.on && !mode.paused && !mode.active && 
                (this.agent.isIdle() || interruptible)) {
                await mode.update(this.agent);
            }
            if (mode.active) break;
        }
    }

    flushBehaviorLog() {
        const log = this.behavior_log;
        this.behavior_log = '';
        return log;
    }

    getJson() {
        return Object.fromEntries(
            this.modes_list.map(mode => [mode.name, mode.on])
        );
    }

    loadJson(json) {
        Object.entries(json).forEach(([name, value]) => {
            if (value !== undefined) {
                this.modes_map[name].on = value;
            }
        });
    }
}

export function initModes(agent) {
    agent.bot.modes = new ModeController(agent);
    const modes = agent.prompter.getInitModes();
    if (modes) {
        agent.bot.modes.loadJson(modes);
    }
}
