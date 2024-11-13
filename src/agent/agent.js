import { History } from './history.js';
import { Coder } from './coder.js';
import { Prompter } from './prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction } from './commands/index.js';
import { ActionManager } from './action_manager.js';
import { NPCController } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import { SelfPrompter } from './self_prompter.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addViewer } from './viewer.js';
import settings from '../../settings.js';

export class Agent {
    constructor() {
        this.shut_up = false;
        this.actions = null;
        this.prompter = null; 
        this.name = null;
        this.history = null;
        this.coder = null;
        this.npc = null;
        this.memory_bank = null;
        this.self_prompter = null;
        this.bot = null;
    }
    
    async initialize(profile_fp) {
        if (!profile_fp) {
            throw new Error('No profile filepath provided');
        }

        console.log('Starting agent initialization with profile:', profile_fp);

        await this.initializeComponents(profile_fp);
        await this.prompter.initExamples();
        
        console.log('Logging into minecraft...');
        this.bot = initBot(this.name);
        
        initModes(this);
    }

    async initializeComponents(profile_fp) {
        try {
            console.log('Initializing components...');
            this.actions = new ActionManager(this);
            this.prompter = new Prompter(this, profile_fp);
            this.name = this.prompter.getName();
            this.history = new History(this);
            this.coder = new Coder(this);
            this.npc = new NPCController(this);
            this.memory_bank = new MemoryBank();
            this.self_prompter = new SelfPrompter(this);
        } catch (error) {
            throw new Error(`Failed to initialize agent components: ${error.message}`);
        }
    }

    async start(profile_fp, load_mem = false, init_message = null, count_id = 0) {
        try {
            await this.initialize(profile_fp);

            let save_data = load_mem ? this.history.load() : null;

            return this.waitForSpawn(save_data, init_message, count_id);
        } catch (error) {
            console.error('Agent start failed:', {
                message: error.message || 'No error message',
                stack: error.stack || 'No stack trace'
            });
            throw error;
        }
    }

    waitForSpawn(save_data, init_message, count_id) {
        return new Promise((resolve, reject) => {
            const spawnTimeout = setTimeout(() => {
                reject(new Error('Bot spawn timed out after 30 seconds'));
            }, 30000);

            this.setupSpawnHandlers(spawnTimeout, save_data, init_message, count_id, resolve, reject);
        });
    }

    setupSpawnHandlers(spawnTimeout, save_data, init_message, count_id, resolve, reject) {
        this.bot.once('error', (error) => {
            clearTimeout(spawnTimeout);
            console.error('Bot encountered error:', error);
            reject(error);
        });

        this.bot.on('login', () => {
            console.log('Logged in!');
        });

        this.bot.once('spawn', async () => {
            try {
                clearTimeout(spawnTimeout);
                await this.handleSpawn(count_id, save_data, init_message);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async handleSpawn(count_id, save_data, init_message) {
        addViewer(this.bot, count_id);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log(`${this.name} spawned.`);
        this.clearBotLogs();
        
        this.setupEventHandlers();
        this.setupMessageHandler();
        this.setupAutoEat();
        await this.handleStartupConditions(save_data, init_message);
        this.startEvents();
    }

    setupEventHandlers() {
        this.setupTimeEvents();
        this.setupHealthEvents();
        this.setupErrorEvents();
        this.setupIdleEvent();
    }

    setupTimeEvents() {
        this.bot.on('time', () => {
            const time = this.bot.time.timeOfDay;
            if (time === 0) this.bot.emit('sunrise');
            else if (time === 6000) this.bot.emit('noon');
            else if (time === 12000) this.bot.emit('sunset');
            else if (time === 18000) this.bot.emit('midnight');
        });
    }

    setupHealthEvents() {
        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });
    }

    setupErrorEvents() {
        this.bot.on('error', (err) => console.error('Error event!', err));
        this.bot.on('end', (reason) => {
            console.warn('Bot disconnected! Killing agent process.', reason);
            this.cleanKill('Bot disconnected! Killing agent process.');
        });
        this.bot.on('kicked', (reason) => {
            console.warn('Bot kicked!', reason);
            this.cleanKill('Bot kicked! Killing agent process.');
        });
        this.bot.on('death', () => {
            this.actions.cancelResume();
            this.actions.stop();
        });
    }

    setupIdleEvent() {
        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop();
            this.bot.modes.unPauseAll();
            this.actions.resumeAction();
        });
    }

    setupMessageHandler() {
        const ignore_messages = [
            "Set own game mode to",
            "Set the time to", 
            "Set the difficulty to",
            "Teleported ",
            "Set the weather to",
            "Gamerule "
        ];

        const eventname = settings.profiles.length > 1 ? 'whisper' : 'chat';
        
        this.bot.on(eventname, async (username, message) => {
            try {
                if (username === this.name) return;
                if (ignore_messages.some(m => message.startsWith(m))) return;

                this.shut_up = false;
                await this.handleMessage(username, message);
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        this.setupDeathMessageHandler();
    }

    setupDeathMessageHandler() {
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate?.startsWith('death') && message.startsWith(this.name)) {
                await this.handleDeathMessage(message);
            }
        });
    }

    async handleDeathMessage(message) {
        console.log('Agent died: ', message);
        const death_pos = this.bot.entity.position;
        this.memory_bank.rememberPlace('last_death_position', death_pos.x, death_pos.y, death_pos.z);
        
        const death_pos_text = death_pos ? 
            `x: ${death_pos.x.toFixed(2)}, y: ${death_pos.y.toFixed(2)}, z: ${death_pos.x.toFixed(2)}` :
            "unknown";
            
        const dimension = this.bot.game.dimension;
        await this.handleMessage('system', 
            `You died at position ${death_pos_text} in the ${dimension} dimension ` +
            `with the final message: '${message}'. Your place of death is saved as ` +
            `'last_death_position' if you want to return. Previous actions were stopped and you have respawned.`
        );
    }

    setupAutoEat() {
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
        };
    }

    async handleStartupConditions(save_data, init_message) {
        try {
            if (save_data?.self_prompt) {
                let prompt = save_data.self_prompt;
                this.history.add('system', prompt);
                await this.self_prompter.start(prompt);
            }
            else if (init_message) {
                await this.handleMessage('system', init_message, 2);
            }
            else {
                const translation = await handleTranslation("Hello world! I am " + this.name);
                this.bot.chat(translation);
                this.bot.emit('finished_executing');
            }
        } catch (error) {
            console.error('Error handling startup conditions:', error);
            throw error;
        }
    }

    async handleMessage(source, message, max_responses = null) {
        let used_command = false;
        if (max_responses === null) {
            max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
        }
        if (max_responses === -1) {
            max_responses = Infinity;
        }

        let self_prompt = source === 'system' || source === this.name;

        if (!self_prompt) {
            const user_command_name = containsCommand(message);
            if (user_command_name) {
                return await this.handleUserCommand(source, message, user_command_name);
            }
        }

        message = await handleEnglishTranslation(message);
        console.log('received message from', source, ':', message);

        await this.processMessage(source, message, self_prompt, max_responses);

        this.bot.emit('finished_executing');
        return used_command;
    }

    async handleUserCommand(source, message, command_name) {
        if (!commandExists(command_name)) {
            this.bot.chat(`Command '${command_name}' does not exist.`);
            return false;
        }
        this.bot.chat(`*${source} used ${command_name.substring(1)}*`);
        if (command_name === '!newAction') {
            this.history.add(source, message);
        }
        let execute_res = await executeCommand(this, message);
        if (execute_res) {
            this.cleanChat(execute_res);
        }
        return true;
    }

    async processMessage(source, message, self_prompt, max_responses) {
        const behavior_log = this.processBehaviorLog();
        if (behavior_log) {
            await this.history.add('system', behavior_log);
        }

        await this.history.add(source, message);
        this.history.save();

        if (!self_prompt && this.self_prompter.on) {
            max_responses = 1;
        }

        for (let i = 0; i < max_responses; i++) {
            if (this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up) break;
            await this.processResponse(source, self_prompt);
        }
    }

    processBehaviorLog() {
        let behavior_log = this.bot.modes.flushBehaviorLog();
        if (behavior_log.trim().length > 0) {
            const MAX_LOG = 500;
            if (behavior_log.length > MAX_LOG) {
                behavior_log = '...' + behavior_log.substring(behavior_log.length - MAX_LOG);
            }
            return 'Recent behaviors log: \n' + behavior_log.substring(behavior_log.indexOf('\n'));
        }
        return null;
    }

    async processResponse(source, self_prompt) {
        let history = this.history.getHistory();
        let res = await this.prompter.promptConvo(history);
        let command_name = containsCommand(res);

        if (command_name) {
            await this.handleCommandResponse(res, command_name, self_prompt);
        } else {
            await this.handleConversationalResponse(res);
        }
    }

    async handleCommandResponse(res, command_name, self_prompt) {
        console.log(`Full response: "${res}"`);
        res = truncCommandMessage(res);
        this.history.add(this.name, res);

        if (!this.validateCommand(command_name, self_prompt)) return;

        this.self_prompter.handleUserPromptedCmd(self_prompt, isAction(command_name));
        await this.outputCommand(res, command_name);

        let execute_res = await executeCommand(this, res);
        if (execute_res) {
            this.history.add('system', execute_res);
        }
        this.history.save();
    }

    validateCommand(command_name, self_prompt) {
        if (!commandExists(command_name)) {
            this.history.add('system', `Command ${command_name} does not exist.`);
            console.warn('Agent hallucinated command:', command_name);
            return false;
        }
        if (command_name === '!stopSelfPrompt' && self_prompt) {
            this.history.add('system', `Cannot stopSelfPrompt unless requested by user.`);
            return false;
        }
        return true;
    }

    async outputCommand(res, command_name) {
        if (settings.verbose_commands) {
            await this.cleanChat(res, res.indexOf(command_name));
        } else {
            let pre_message = res.substring(0, res.indexOf(command_name)).trim();
            let chat_message = `*used ${command_name.substring(1)}*`;
            if (pre_message.length > 0) {
                chat_message = `${pre_message} ${chat_message}`;
            }
            await this.cleanChat(chat_message);
        }
    }

    async handleConversationalResponse(res) {
        this.history.add(this.name, res);
        await this.cleanChat(res);
        console.log('Purely conversational response:', res);
    }

    startEvents() {
        this.npc.init();

        const INTERVAL = 300;
        let last = Date.now();
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.update(start - last);
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
                last = start;
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    async update(delta) {
        await this.bot.modes.update();
        await this.self_prompter.update(delta);
    }

    async cleanChat(message, translate_up_to = -1) {
        let to_translate = message;
        let remaining = '';
        if (translate_up_to != -1) {
            to_translate = to_translate. substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remaining;
        message = message.replaceAll('\n', ' ');
        return this.bot.chat(message);
    }

    requestInterrupt() {
        this.bot.interrupt_code = true;
        this.bot.collectBlock.cancelTask();
        this.bot.pathfinder.stop();
        this.bot.pvp.stop();
    }

    clearBotLogs() {
        this.bot.output = '';
        this.bot.interrupt_code = false;
    }

    shutUp() {
        this.shut_up = true;
        if (this.self_prompter.on) {
            this.self_prompter.stop(false);
        }
    }

    isIdle() {
        return !this.actions.executing && !this.coder.generating;
    }

    cleanKill(msg = 'Killing agent process...') {
        this.history.add('system', msg);
        this.bot.chat('Goodbye world.');
        this.history.save();
        process.exit(1);
    }
}
