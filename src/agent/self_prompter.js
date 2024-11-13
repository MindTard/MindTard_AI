export class SelfPrompter {
    static DEFAULT_COOLDOWN = 2000;
    static MAX_NO_COMMAND_ATTEMPTS = 3;

    constructor(agent) {
        this.agent = agent;
        this.state = {
            isActive: false,
            isLoopRunning: false,
            shouldInterrupt: false,
            prompt: '',
            idleTime: 0,
            cooldown: SelfPrompter.DEFAULT_COOLDOWN
        };
    }

    start(prompt) {
        if (!this._validatePrompt(prompt)) {
            return 'No prompt specified. Ignoring request.';
        }

        this._updateState({ 
            isActive: true, 
            prompt: prompt 
        });
        
        console.log('Self-prompting started.');
        this._initializeLoop();
    }

    async _initializeLoop() {
        if (this.state.isLoopRunning) {
            console.warn('Self-prompt loop is already active. Ignoring request.');
            return;
        }

        console.log('Starting self-prompt loop');
        this.state.isLoopRunning = true;
        
        try {
            await this._runPromptLoop();
        } catch (error) {
            console.error('Error in prompt loop:', error);
        } finally {
            this._cleanupLoop();
        }
    }

    async _runPromptLoop() {
        let noCommandCount = 0;

        while (!this.state.shouldInterrupt) {
            const usedCommand = await this._executeSinglePrompt();
            
            if (!usedCommand) {
                if (await this._handleNoCommand(++noCommandCount)) {
                    break;
                }
            } else {
                noCommandCount = 0;
                await this._waitCooldown();
            }
        }
    }

    async _executeSinglePrompt() {
        const promptMessage = this._buildPromptMessage();
        return await this.agent.handleMessage('system', promptMessage, -1);
    }

    async _handleNoCommand(count) {
        if (count >= SelfPrompter.MAX_NO_COMMAND_ATTEMPTS) {
            const message = `Agent did not use command in the last ${SelfPrompter.MAX_NO_COMMAND_ATTEMPTS} auto-prompts. Stopping auto-prompting.`;
            this.agent.bot.chat(message);
            console.warn(message);
            this.state.isActive = false;
            return true;
        }
        return false;
    }

    update(delta) {
        if (!this._shouldRestartLoop()) {
            this.state.idleTime = 0;
            return;
        }

        this._updateIdleTime(delta);

        if (this.state.idleTime >= this.state.cooldown) {
            console.log('Restarting self-prompting...');
            this._initializeLoop();
            this.state.idleTime = 0;
        }
    }

    async stop(stopAction = true) {
        this.state.shouldInterrupt = true;
        
        if (stopAction) {
            await this.agent.actions.stop();
        }
        
        await this._waitForLoopToEnd();
        this.state.isActive = false;
    }

    shouldInterrupt(isSelfPrompt) {
        return isSelfPrompt && this.state.isActive && this.state.shouldInterrupt;
    }

    handleUserPromptedCmd(isSelfPrompt, isAction) {
        if (!isSelfPrompt && isAction) {
            this.stopLoop();
        }
    }

    // Private helper methods
    async stopLoop() {
        console.log('Stopping self-prompt loop');
        this.state.shouldInterrupt = true;
        await this._waitForLoopToEnd();
    }

    _validatePrompt(prompt) {
        return Boolean(prompt);
    }

    _buildPromptMessage() {
        return `You are self-prompting with the goal: '${this.state.prompt}'. Your next response MUST contain a command !withThisSyntax. Respond:`;
    }

    _updateState(newState) {
        this.state = { ...this.state, ...newState };
    }

    _shouldRestartLoop() {
        return this.state.isActive && !this.state.isLoopRunning && !this.state.shouldInterrupt;
    }

    _updateIdleTime(delta) {
        if (this.agent.isIdle()) {
            this.state.idleTime += delta;
        } else {
            this.state.idleTime = 0;
        }
    }

    _cleanupLoop() {
        console.log('Self prompt loop stopped');
        this.state.isLoopRunning = false;
        this.state.shouldInterrupt = false;
    }

    async _waitForLoopToEnd() {
        while (this.state.isLoopRunning) {
            await new Promise(r => setTimeout(r, 500));
        }
        this.state.shouldInterrupt = false;
    }

    async _waitCooldown() {
        await new Promise(r => setTimeout(r, this.state.cooldown));
    }
}
