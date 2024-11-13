import { spawn } from 'child_process';

export class AgentProcess {
    static runningCount = 0;
    static MIN_RUNTIME_MS = 10000; // Minimum runtime before restart in ms

    constructor() {
        this.lastRestartTime = Date.now();
    }

    buildProcessArgs(profile, loadMemory, initMessage, countId) {
        const args = ['src/process/init-agent.js', this.name, '-p', profile, '-c', countId];
        
        if (loadMemory) args.push('-l', loadMemory);
        if (initMessage) args.push('-m', initMessage);
        
        return args;
    }

    spawnAgentProcess(args) {
        const agentProcess = spawn('node', args, {
            stdio: 'inherit',
            stderr: 'inherit'
        });
        AgentProcess.runningCount++;
        return agentProcess;
    }

    handleProcessExit(code, signal, profile, countId) {
        console.log(`Agent process exited with code ${code} and signal ${signal}`);

        if (code === 0) return;

        const timeSinceLastRestart = Date.now() - this.lastRestartTime;
        
        if (timeSinceLastRestart < AgentProcess.MIN_RUNTIME_MS) {
            this.handleQuickExit(profile);
            return;
        }

        this.restartAgent(profile, countId);
    }

    handleQuickExit(profile) {
        console.error(`Agent process ${profile} exited too quickly and will not be restarted.`);
        AgentProcess.runningCount--;
        
        if (AgentProcess.runningCount <= 0) {
            console.error('All agent processes have ended. Exiting.');
            process.exit(0);
        }
    }

    restartAgent(profile, countId) {
        console.log('Restarting agent...');
        this.start(profile, true, 'Agent process restarted.', countId);
        this.lastRestartTime = Date.now();
    }

    start(profile, loadMemory = false, initMessage = null, countId = 0) {
        const args = this.buildProcessArgs(profile, loadMemory, initMessage, countId);
        const agentProcess = this.spawnAgentProcess(args);

        agentProcess.on('exit', (code, signal) => {
            this.handleProcessExit(code, signal, profile, countId);
        });
    
        agentProcess.on('error', (err) => {
            console.error('Agent process error:', err);
        });
    }
}
