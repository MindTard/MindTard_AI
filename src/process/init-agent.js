import { Agent } from '../agent/agent.js';
import yargs from 'yargs';

/**
 * Configure and parse command line arguments
 */
function parseCommandLineArgs() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Usage: node init_agent.js <agent_name> [profile] [load_memory] [init_message]');
        process.exit(1);
    }

    return yargs(args)
        .option('profile', {
            alias: 'p',
            type: 'string',
            description: 'profile filepath to use for agent'
        })
        .option('load_memory', {
            alias: 'l', 
            type: 'boolean',
            description: 'load agent memory from file on startup'
        })
        .option('init_message', {
            alias: 'm',
            type: 'string', 
            description: 'automatically prompt the agent on startup'
        })
        .option('count_id', {
            alias: 'c',
            type: 'number',
            default: 0,
            description: 'identifying count for multi-agent scenarios',
        })
        .argv;
}

/**
 * Configure global error handlers
 */
function setupErrorHandlers() {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', {
            promise,
            reason,
            stack: reason?.stack || 'No stack trace'
        });
        process.exit(1);
    });
}

/**
 * Initialize and start the agent
 */
async function initializeAgent(argv) {
    try {
        console.log('Starting agent with profile:', argv.profile);
        const agent = new Agent();
        await agent.start(argv.profile, argv.load_memory, argv.init_message, argv.count_id);
    } catch (error) {
        console.error('Failed to start agent process:', {
            message: error.message || 'No error message',
            stack: error.stack || 'No stack trace',
            error
        });
        process.exit(1);
    }
}

/**
 * Main execution function
 */
async function main() {
    setupErrorHandlers();
    const argv = parseCommandLineArgs();
    await initializeAgent(argv);
}

// Start the application
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
