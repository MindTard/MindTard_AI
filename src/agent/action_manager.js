export class ActionManager {
    constructor(agent) {
        this.agent = agent;
        this.executing = false;
        this.currentAction = {
            label: '',
            fn: null
        };
        this.timedout = false;
        this.resume = {
            fn: null,
            name: '' 
        };
    }

    async resumeAction(actionFn, timeout) {
        return this.executeWithResume(actionFn, timeout);
    }

    async runAction(actionLabel, actionFn, options = {}) {
        const { timeout, resume = false } = options;
        
        return resume ? 
            this.executeWithResume(actionLabel, actionFn, timeout) :
            this.execute(actionLabel, actionFn, timeout);
    }

    async stop() {
        if (!this.executing) return;

        const killTimeout = setTimeout(() => {
            this.agent.cleanKill('Code execution refused stop after 10 seconds. Killing process.');
        }, 10000);

        while (this.executing) {
            this.agent.requestInterrupt();
            console.log('waiting for code to finish executing...');
            await this.delay(300);
        }

        clearTimeout(killTimeout);
    }

    cancelResume() {
        this.resume = {
            fn: null,
            name: null
        };
    }

    async executeWithResume(actionLabel = null, actionFn = null, timeout = 10) {
        const isNewResume = actionFn != null;

        if (isNewResume) {
            this.resume = {
                fn: actionFn,
                name: actionLabel || '' 
            };
        }

        const canExecute = this.resume.fn != null && 
                          this.agent.isIdle() && 
                          (!this.agent.self_prompter.on || isNewResume);

        if (canExecute) {
            this.currentAction.label = this.resume.name;
            const result = await this.execute(this.resume.name, this.resume.fn, timeout);
            this.currentAction.label = '';
            return result;
        }

        return { 
            success: false, 
            message: null, 
            interrupted: false, 
            timedout: false 
        };
    }

    async execute(actionLabel, actionFn, timeout = 10) {
        let timeoutId;

        try {
            console.log('executing code...\n');

            if (this.executing) {
                console.log(`action "${actionLabel}" trying to interrupt current action "${this.currentAction.label}"`);
            }

            await this.stop();
            this.agent.clearBotLogs();

            this.executing = true;
            this.currentAction = {
                label: actionLabel,
                fn: actionFn
            };

            if (timeout > 0) {
                timeoutId = this.startTimeout(timeout);
            }

            await actionFn();

            return await this.finishExecution(timeoutId);

        } catch (err) {
            return await this.handleExecutionError(err, timeoutId);
        }
    }

    async finishExecution(timeoutId) {
        this.executing = false;
        this.currentAction = {
            label: '',
            fn: null
        };
        clearTimeout(timeoutId);

        const output = this.getBotOutputSummary();
        const interrupted = this.agent.bot.interrupt_code;
        const timedout = this.timedout;
        
        this.agent.clearBotLogs();

        if (!interrupted && !this.agent.coder.generating) {
            this.agent.bot.emit('idle');
        }

        return { 
            success: true, 
            message: output, 
            interrupted, 
            timedout 
        };
    }

    async handleExecutionError(err, timeoutId) {
        this.executing = false;
        this.currentAction = {
            label: '',
            fn: null
        };
        clearTimeout(timeoutId);
        this.cancelResume();

        console.error("Code execution triggered catch: " + err);
        await this.stop();

        const message = this.getBotOutputSummary() + 
                       '!!Code threw exception!!  Error: ' + err;
        const interrupted = this.agent.bot.interrupt_code;
        
        this.agent.clearBotLogs();

        if (!interrupted && !this.agent.coder.generating) {
            this.agent.bot.emit('idle');
        }

        return { 
            success: false, 
            message, 
            interrupted, 
            timedout: false 
        };
    }

    getBotOutputSummary() {
        const { bot } = this.agent;
        if (bot.interrupt_code && !this.timedout) return '';

        let output = bot.output;
        const MAX_OUT = 500;

        if (output.length > MAX_OUT) {
            const firstHalf = output.substring(0, MAX_OUT / 2);
            const secondHalf = output.substring(output.length - MAX_OUT / 2);
            
            output = `Code output is very long (${output.length} chars) and has been shortened.\n
                     First outputs:\n${firstHalf}\n...skipping many lines.\nFinal outputs:\n ${secondHalf}`;
        } else {
            output = 'Code output:\n' + output;
        }

        return output;
    }

    startTimeout(timeoutMins = 10) {
        return setTimeout(async () => {
            console.warn(`Code execution timed out after ${timeoutMins} minutes. Attempting force stop.`);
            this.timedout = true;
            this.agent.history.add('system', 
                `Code execution timed out after ${timeoutMins} minutes. Attempting force stop.`);
            await this.stop();
        }, timeoutMins * 60 * 1000);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
