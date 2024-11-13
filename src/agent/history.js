import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import settings from '../../settings.js';

export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.baseDir = path.join('./bots', this.name);
        this.memoryPath = path.join(this.baseDir, 'memory.json');
        this.historiesDir = path.join(this.baseDir, 'histories');
        this.fullHistoryPath = null;

        this.initializeDirectories();
        
        this.turns = [];
        this.memory = '';
        this.maxMessages = settings.max_messages;
        this.summaryChunkSize = 5;
    }

    initializeDirectories() {
        mkdirSync(this.historiesDir, { recursive: true });
    }

    getHistory() {
        return JSON.parse(JSON.stringify(this.turns));
    }

    async summarizeMemories(turns) {
        console.log("Storing memories...");
        try {
            this.memory = await this.agent.prompter.promptMemSaving(turns);
            this.truncateMemoryIfNeeded();
            console.log("Memory updated to: ", this.memory);
        } catch (error) {
            console.error("Error summarizing memories:", error);
            throw error;
        }
    }

    truncateMemoryIfNeeded() {
        const MAX_MEMORY_LENGTH = 500;
        if (this.memory.length > MAX_MEMORY_LENGTH) {
            this.memory = this.memory.slice(0, MAX_MEMORY_LENGTH);
            this.memory += '...(Memory truncated to 500 chars. Compress it more next time)';
        }
    }

    initializeFullHistory() {
        if (!this.fullHistoryPath) {
            const timestamp = new Date().toLocaleString()
                .replace(/[/:]/g, '-')
                .replace(/ /g, '')
                .replace(/,/g, '_');
            this.fullHistoryPath = path.join(this.historiesDir, `${timestamp}.json`);
            writeFileSync(this.fullHistoryPath, '[]', 'utf8');
        }
    }

    appendFullHistory(toStore) {
        this.initializeFullHistory();
        
        try {
            const existingData = readFileSync(this.fullHistoryPath, 'utf8');
            const fullHistory = JSON.parse(existingData);
            fullHistory.push(...toStore);
            writeFileSync(this.fullHistoryPath, JSON.stringify(fullHistory, null, 4), 'utf8');
        } catch (error) {
            console.error(`Error managing ${this.name}'s full history:`, error);
            throw error;
        }
    }

    determineMessageRole(name, content) {
        if (name === 'system') return 'system';
        if (name !== this.name) {
            return {
                role: 'user',
                content: `${name}: ${content}`
            };
        }
        return {
            role: 'assistant',
            content
        };
    }

    async add(name, content) {
        const messageData = this.determineMessageRole(name, content);
        this.turns.push(typeof messageData === 'string' 
            ? { role: messageData, content }
            : messageData
        );

        await this.checkAndUpdateHistory();
    }

    async checkAndUpdateHistory() {
        if (this.turns.length >= this.maxMessages) {
            const chunk = this.extractChunkForProcessing();
            await this.summarizeMemories(chunk);
            this.appendFullHistory(chunk);
        }
    }

    extractChunkForProcessing() {
        const chunk = this.turns.splice(0, this.summaryChunkSize);
        while (this.turns.length > 0 && this.turns[0].role === 'assistant') {
            chunk.push(this.turns.shift());
        }
        return chunk;
    }

    async save() {
        try {
            const data = {
                memory: this.memory,
                turns: this.turns,
                self_prompt: this.agent.self_prompter.on 
                    ? this.agent.self_prompter.prompt 
                    : null
            };
            writeFileSync(this.memoryPath, JSON.stringify(data, null, 2));
            console.log('Saved memory to:', this.memoryPath);
        } catch (error) {
            console.error('Failed to save history:', error);
            throw error;
        }
    }

    load() {
        try {
            if (!existsSync(this.memoryPath)) {
                console.log('No memory file found.');
                return null;
            }

            const data = JSON.parse(readFileSync(this.memoryPath, 'utf8'));
            this.memory = data.memory || '';
            this.turns = data.turns || [];
            console.log('Loaded memory:', this.memory);
            return data;
        } catch (error) {
            console.error('Failed to load history:', error);
            throw error;
        }
    }

    clear() {
        this.turns = [];
        this.memory = '';
    }
}
