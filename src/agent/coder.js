import { writeFile, readFile, mkdirSync } from 'fs';
import settings from '../../settings.js';
import { makeCompartment } from './library/lockdown.js';
import * as skills from './library/skills.js';
import * as world from './library/world.js';
import { Vec3 } from 'vec3';

const MAX_RETRY_ATTEMPTS = 5;
const CODE_INJECTION_CHECK = /;\n/g;

export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.fileCounter = 0;
        this.filePath = `/bots/${agent.name}/action-code/`;
        this.generating = false;
        this.codeTemplate = '';
        this.compartmentConfig = {
            skills,
            log: skills.log,
            world,
            Vec3,
        };

        this.initializeEnvironment();
    }

    async initializeEnvironment() {
        try {
            this.codeTemplate = await this.readTemplateFile();
            mkdirSync('.' + this.filePath, { recursive: true });
        } catch (error) {
            console.error('Failed to initialize coding environment:', error);
            throw error;
        }
    }

    readTemplateFile() {
        return new Promise((resolve, reject) => {
            readFile('./bots/template.js', 'utf8', (err, data) => {
                if (err) reject(err);
                resolve(data);
            });
        });
    }

    sanitizeCode(code) {
        code = code.trim();
        const codeKeywords = ['Javascript', 'javascript', 'js'];
        
        for (const keyword of codeKeywords) {
            if (code.startsWith(keyword)) {
                return code.slice(keyword.length);
            }
        }
        return code;
    }

    prepareCode(code) {
        let processedCode = this.sanitizeCode(code);
        processedCode = processedCode
            .replaceAll('console.log(', 'log(bot,')
            .replaceAll('log("', 'log(bot,"')
            .replaceAll(CODE_INJECTION_CHECK, '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');

        console.log(`Generated code: """${processedCode}"""`);
        
        const indentedCode = processedCode
            .split('\n')
            .map(line => `    ${line}`)
            .join('\n');

        return this.codeTemplate.replace('/* CODE HERE */', indentedCode);
    }

    async writeCodeToFile(source) {
        const filename = `${this.fileCounter}.js`;
        this.fileCounter++;
        
        try {
            await this.writeFilePromise('.' + this.filePath + filename, source);
            return filename;
        } catch (error) {
            console.error('Error writing code file:', error);
            return null;
        }
    }

    writeFilePromise(filename, source) {
        return new Promise((resolve, reject) => {
            writeFile(filename, source, err => {
                err ? reject(err) : resolve();
            });
        });
    }

    async stageCode(code) {
        const source = this.prepareCode(code);
        const filename = await this.writeCodeToFile(source);
        
        if (!filename) return null;

        try {
            const compartment = makeCompartment(this.compartmentConfig);
            const mainFunction = compartment.evaluate(source);
            return { main: mainFunction };
        } catch (error) {
            console.error('Error evaluating code in compartment:', error);
            return null;
        }
    }

    async generateCode(agentHistory) {
        if (this.generating) return null;

        try {
            await this.agent.actions.stop();
            this.generating = true;
            const result = await this.generateCodeLoop(agentHistory);
            
            if (!result.interrupted) {
                this.agent.bot.emit('idle');
            }
            
            return result.message;
        } finally {
            this.generating = false;
        }
    }

    async generateCodeLoop(agentHistory) {
        this.agent.bot.modes.pause('unstuck');
        
        const messages = [
            ...agentHistory.getHistory(),
            { role: 'system', content: 'Code generation started. Write code in codeblock in your response:' }
        ];

        let failures = 0;

        for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
            if (this.agent.bot.interrupt_code) {
                return { success: true, message: null, interrupted: true, timedout: false };
            }

            const result = await this.processCodeGeneration(messages, failures);
            
            if (result) return result;
            
            failures++;
        }

        return { success: false, message: null, interrupted: false, timedout: true };
    }

    async processCodeGeneration(messages, failures) {
        const response = await this.agent.prompter.promptCoding(JSON.parse(JSON.stringify(messages)));
        
        if (this.agent.bot.interrupt_code) {
            return { success: true, message: null, interrupted: true, timedout: false };
        }

        if (!response.includes('```')) {
            return this.handleNoCodeResponse(response, messages, failures);
        }

        const code = response.substring(
            response.indexOf('```') + 3,
            response.lastIndexOf('```')
        );

        return await this.executeAndProcessCode(code, response, messages);
    }

    async handleNoCodeResponse(response, messages, failures) {
        if (response.includes('!newAction')) {
            messages.push({
                role: 'assistant',
                content: response.substring(0, response.indexOf('!newAction'))
            });
            return null;
        }

        if (failures >= 3) {
            return {
                success: false,
                message: 'Action failed, agent would not write code.',
                interrupted: false,
                timedout: false
            };
        }

        messages.push({
            role: 'system',
            content: 'Error: no code provided. Write code in codeblock in your response. ``` // example ```'
        });
        return null;
    }

    async executeAndProcessCode(code, response, messages) {
        const executionModule = await this.stageCode(code);
        
        if (!executionModule) {
            messages.push({
                role: 'system',
                content: 'Failed to stage code, something is wrong.'
            });
            return { success: false, message: null, interrupted: false, timedout: false };
        }

        const codeResult = await this.agent.actions.runAction('newAction', 
            async () => await executionModule.main(this.agent.bot),
            { timeout: settings.code_timeout_mins }
        );

        if (codeResult.interrupted && !codeResult.timedout) {
            return { success: false, message: null, interrupted: true, timedout: false };
        }

        if (codeResult.success) {
            const summary = `Summary of newAction\nAgent wrote this code: \n\`\`\`${this.sanitizeCode(code)}\`\`\`\nCode Output:\n${codeResult.message}`;
            return { success: true, message: summary, interrupted: false, timedout: false };
        }

        messages.push(
            { role: 'assistant', content: response },
            { role: 'system', content: `${codeResult.message}\nCode failed. Please try again:` }
        );

        return null;
    }
}
