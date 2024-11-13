import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

class Application {
    constructor() {
        this.settings = settings;
    }

    parseArguments() {
        return yargs(hideBin(process.argv))
            .option('profiles', {
                type: 'array',
                describe: 'List of agent profile paths',
            })
            .help()
            .alias('help', 'h')
            .parse();
    }

    getProfiles(args) {
        return args.profiles || this.settings.profiles;
    }

    initializeAgents(profiles) {
        const { load_memory, init_message } = this.settings;
        
        return profiles.map((profile, index) => {
            const agent = new AgentProcess();
            agent.start(profile, load_memory, init_message, index);
            return agent;
        });
    }

    run() {
        try {
            const args = this.parseArguments();
            const profiles = this.getProfiles(args);
            console.log('Loading profiles:', profiles);
            
            const agents = this.initializeAgents(profiles);
            return agents;
        } catch (error) {
            console.error('Application initialization failed:', error);
            process.exit(1);
        }
    }
}

// Application entry point
const app = new Application();
app.run();
