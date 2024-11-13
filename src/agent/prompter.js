import { readFileSync, mkdirSync, writeFileSync} from 'fs';
import { Examples } from '../utils/examples.js';
import { getCommandDocs, getCommand } from './commands/index.js';
import { getSkillDocs } from './library/index.js';
import { stringifyTurns } from '../utils/text.js';

// Model imports
import { Gemini } from '../models/gemini.js';
import { GPT } from '../models/gpt.js';
import { Claude } from '../models/claude.js';
import { ReplicateAPI } from '../models/replicate.js';
import { Local } from '../models/local.js';
import { GroqCloudAPI } from '../models/groq.js';
import { HuggingFace } from '../models/huggingface.js';
import { Qwen } from "../models/qwen.js";

export class Prompter {
    constructor(agent, fp) {
        this.agent = agent;
        this.profile = JSON.parse(readFileSync(fp, 'utf8'));
        this.initializeBasicProperties();
        this.initializeChatModel();
        this.initializeEmbeddingModel();
        this.saveProfileCopy();
    }

    initializeBasicProperties() {
        this.convo_examples = null;
        this.coding_examples = null;
        this.cooldown = this.profile.cooldown || 0;
        this.last_prompt_time = 0;
    }

    initializeChatModel() {
        const chat = this.normalizeChatConfig(this.profile.model);
        console.log('Using chat settings:', chat);

        this.chat_model = this.createModelInstance(chat, this.profile.max_tokens);
    }

    normalizeChatConfig(chat) {
        if (typeof chat === 'string' || chat instanceof String) {
            const config = {model: chat};
            config.api = this.determineAPI(chat);
            return config;
        }
        return chat;
    }

    determineAPI(modelName) {
        if (modelName.includes('gemini')) return 'google';
        if (modelName.includes('gpt') || modelName.includes('o1')) return 'openai';
        if (modelName.includes('claude')) return 'anthropic';
        if (modelName.includes('huggingface/')) return 'huggingface';
        if (modelName.includes('meta/') || modelName.includes('mistralai/') || modelName.includes('replicate/')) return 'replicate';
        if (modelName.includes("groq/") || modelName.includes("groqcloud/")) return 'groq';
        if (modelName.includes('qwen')) return 'qwen';
        return 'ollama';
    }

    createModelInstance(chat, maxTokens) {
        const modelMap = {
            'google': () => new Gemini(chat.model, chat.url),
            'openai': () => new GPT(chat.model, chat.url),
            'anthropic': () => new Claude(chat.model, chat.url),
            'replicate': () => new ReplicateAPI(chat.model, chat.url),
            'ollama': () => new Local(chat.model, chat.url),
            'groq': () => new GroqCloudAPI(
                chat.model.replace('groq/', '').replace('groqcloud/', ''),
                chat.url,
                maxTokens || 8192
            ),
            'huggingface': () => new HuggingFace(chat.model, chat.url),
            'qwen': () => new Qwen(chat.model, chat.url)
        };

        const modelCreator = modelMap[chat.api];
        if (!modelCreator) throw new Error(`Unknown API: ${chat.api}`);
        return modelCreator();
    }

    initializeEmbeddingModel() {
        const embedding = this.normalizeEmbeddingConfig();
        console.log('Using embedding settings:', embedding);

        try {
            this.embedding_model = this.createEmbeddingModelInstance(embedding);
        } catch (err) {
            console.log('Warning: Failed to initialize embedding model:', err.message);
            console.log('Continuing anyway, using word overlap instead.');
            this.embedding_model = null;
        }
    }

    normalizeEmbeddingConfig() {
        let embedding = this.profile.embedding;
        if (embedding === undefined) {
            return {api: this.profile.model.api !== 'ollama' ? this.profile.model.api : 'none'};
        }
        return typeof embedding === 'string' ? {api: embedding} : embedding;
    }

    createEmbeddingModelInstance(embedding) {
        if (!embedding || !embedding.api || embedding.api === 'none') {
            console.log('Using word overlap - no embedding model specified');
            return null;
        }

        return this.createModelInstance(embedding);
    }

    saveProfileCopy() {
        const profilePath = `./bots/${this.profile.name}/last_profile.json`;
        mkdirSync(`./bots/${this.profile.name}`, { recursive: true });
        writeFileSync(profilePath, JSON.stringify(this.profile, null, 4));
    }

    getName() {
        return this.profile.name;
    }

    getInitModes() {
        return this.profile.modes;
    }

    async initExamples() {
        this.convo_examples = new Examples(this.embedding_model);
        this.coding_examples = new Examples(this.embedding_model);
        
        try {
            await Promise.all([
                this.convo_examples.load(this.profile.conversation_examples),
                this.coding_examples.load(this.profile.coding_examples)
            ]);
        } catch (error) {
            console.error('Failed to initialize examples:', error);
            throw error;
        }
    }

    async replaceStrings(prompt, messages, examples = null, to_summarize = [], last_goals = null) {
        const replacements = {
            '$NAME': this.agent.name,
            '$STATS': async () => await getCommand('!stats').perform(this.agent),
            '$INVENTORY': async () => await getCommand('!inventory').perform(this.agent),
            '$COMMAND_DOCS': () => getCommandDocs(),
            '$CODE_DOCS': () => getSkillDocs(),
            '$EXAMPLES': async () => examples ? await examples.createExampleMessage(messages) : '',
            '$MEMORY': () => this.agent.history.memory,
            '$TO_SUMMARIZE': () => stringifyTurns(to_summarize),
            '$CONVO': () => 'Recent conversation:\n' + stringifyTurns(messages),
            '$SELF_PROMPT': () => this.getSelfPromptText(),
            '$LAST_GOALS': () => this.getLastGoalsText(last_goals),
            '$BLUEPRINTS': () => this.getBlueprintsText()
        };

        for (const [key, replacer] of Object.entries(replacements)) {
            if (prompt.includes(key)) {
                const value = typeof replacer === 'function' ? await replacer() : replacer;
                prompt = prompt.replaceAll(key, value);
            }
        }

        this.checkRemainingPlaceholders(prompt);
        return prompt;
    }

    getSelfPromptText() {
        return this.agent.self_prompter.on 
            ? `YOUR CURRENT ASSIGNED GOAL: "${this.agent.self_prompter.prompt}"\n` 
            : '';
    }

    getLastGoalsText(last_goals) {
        if (!last_goals) return '';
        return Object.entries(last_goals)
            .map(([goal, success]) => 
                `You recently ${success ? 'successfully completed' : 'failed to complete'} the goal ${goal}.`)
            .join('\n');
    }

    getBlueprintsText() {
        if (!this.agent.npc.constructions) return '';
        return Object.keys(this.agent.npc.constructions).join(', ');
    }

    checkRemainingPlaceholders(prompt) {
        const remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }
    }

    async checkCooldown() {
        const elapsed = Date.now() - this.last_prompt_time;
        if (elapsed < this.cooldown && this.cooldown > 0) {
            await new Promise(r => setTimeout(r, this.cooldown - elapsed));
        }
        this.last_prompt_time = Date.now();
    }

    async promptConvo(messages) {
        await this.checkCooldown();
        const prompt = await this.replaceStrings(this.profile.conversing, messages, this.convo_examples);
        return await this.chat_model.sendRequest(messages, prompt);
    }

    async promptCoding(messages) {
        await this.checkCooldown();
        const prompt = await this.replaceStrings(this.profile.coding, messages, this.coding_examples);
        return await this.chat_model.sendRequest(messages, prompt);
    }

    async promptMemSaving(to_summarize) {
        await this.checkCooldown();
        const prompt = await this.replaceStrings(this.profile.saving_memory, null, null, to_summarize);
        return await this.chat_model.sendRequest([], prompt);
    }

    async promptGoalSetting(messages, last_goals) {
        const system_message = await this.replaceStrings(this.profile.goal_setting, messages);
        const user_message = await this.replaceStrings(
            'Use the below info to determine what goal to target next\n\n$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO',
            messages, null, null, last_goals
        );

        const response = await this.chat_model.sendRequest(
            [{role: 'user', content: user_message}], 
            system_message
        );

        return this.parseGoalResponse(response);
    }

    parseGoalResponse(response) {
        try {
            const data = response.split('```')[1].replace('json', '').trim();
            const goal = JSON.parse(data);
            
            if (!goal?.name || !goal?.quantity || isNaN(parseInt(goal.quantity))) {
                console.log('Failed to set goal: Invalid format');
                return null;
            }

            return { ...goal, quantity: parseInt(goal.quantity) };
        } catch (err) {
            console.log('Failed to parse goal:', response, err);
            return null;
        }
    }
}
