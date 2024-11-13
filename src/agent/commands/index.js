import { getBlockId, getItemId } from "../../utils/mcdata.js";
import { actionsList } from './actions.js';
import { queryList } from './queries.js';

// Constants
const BOOLEAN_MAP = {
  'false': false, 'f': false, '0': false, 'off': false,
  'true': true, 't': true, '1': true, 'on': true
};

const INTERVAL_CHECKS = {
  '[)': (num, lower, upper) => lower <= num && num < upper,
  '()': (num, lower, upper) => lower < num && num < upper, 
  '(]': (num, lower, upper) => lower < num && num <= upper,
  '[]': (num, lower, upper) => lower <= num && num <= upper
};

const TYPE_TRANSLATIONS = {
  'float': 'number',
  'int': 'number', 
  'BlockName': 'string',
  'ItemName': 'string',
  'boolean': 'bool'
};

// Initialize commands
const commandList = queryList.concat(actionsList);
const commandMap = commandList.reduce((map, cmd) => {
  map[cmd.name] = cmd;
  return map;
}, {});

let suppressNoDomainWarning = false;

// Regular expressions
const commandRegex = /!(\w+)(?:\(([\s\S]*)\))?/;
const argRegex = /(?:"[^"]*"|'[^']*'|[^,])+/g;

// Helper functions
function parseBoolean(input) {
  return BOOLEAN_MAP[input.toLowerCase()] ?? null;
}

function checkInInterval(number, lowerBound, upperBound, endpointType = '[)') {
  const checker = INTERVAL_CHECKS[endpointType];
  if (!checker) throw new Error('Unknown endpoint type: ' + endpointType);
  return checker(number, lowerBound, upperBound);
}

function parseArg(arg, param, paramName, commandName) {
  arg = arg.trim();
  if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
    arg = arg.substring(1, arg.length-1);
  }

  if (arg.includes('=')) {
    arg = arg.split('=')[1];
  }

  switch(param.type) {
    case 'int':
      arg = Number.parseInt(arg); break;
    case 'float':
      arg = Number.parseFloat(arg); break;
    case 'boolean':
      arg = parseBoolean(arg); break;
    case 'BlockName':
    case 'ItemName':
      if (arg.endsWith('plank')) arg += 's';
      break;
    case 'string':
      break;
    default:
      throw new Error(`Command '${commandName}' parameter '${paramName}' has unknown type: ${param.type}`);
  }

  if (arg === null || Number.isNaN(arg)) {
    throw new Error(`Param '${paramName}' must be of type ${param.type}`);
  }

  validateNumericDomain(arg, param, paramName, commandName);
  validateBlockOrItem(arg, param.type);

  return arg;
}

function validateNumericDomain(value, param, paramName, commandName) {
  if (typeof value !== 'number') return;

  const domain = param.domain;
  if (domain) {
    domain[2] = domain[2] || '[)';
    if (!checkInInterval(value, ...domain)) {
      throw new Error(`Param '${paramName}' must be in ${domain[2][0]}${domain[0]}, ${domain[1]}${domain[2][1]}`);
    }
  } else if (!suppressNoDomainWarning) {
    console.warn(`Command '${commandName}' parameter '${paramName}' has no domain set`);
    suppressNoDomainWarning = true;
  }
}

function validateBlockOrItem(value, type) {
  if (type === 'BlockName' && getBlockId(value) == null) {
    throw new Error(`Invalid block type: ${value}`);
  }
  if (type === 'ItemName' && getItemId(value) == null) {
    throw new Error(`Invalid item type: ${value}`);
  }
}

// Exports
export function getCommand(name) {
  return commandMap[name];
}

export function containsCommand(message) {
  const match = message.match(commandRegex);
  return match ? "!" + match[1] : null;
}

export function commandExists(commandName) {
  if (!commandName.startsWith("!")) commandName = "!" + commandName;
  return commandMap[commandName] !== undefined;
}

export function truncCommandMessage(message) {
  const match = message.match(commandRegex);
  return match ? message.substring(0, match.index + match[0].length) : message;
}

export function isAction(name) {
  return actionsList.find(action => action.name === name) !== undefined;
}

export function getCommandDocs() {
  const docs = [`
*COMMAND DOCS
You can use the following commands to perform actions and get information about the world.
Use the commands with the syntax: !commandName or !commandName("arg1", 1.2, ...) if the command takes arguments.
Do not use codeblocks. Only use one command in each response, trailing commands and comments will be ignored.
`];

  for (const command of commandList) {
    docs.push(`${command.name}: ${command.description}`);
    
    if (command.params) {
      docs.push('Params:');
      for (const [param, details] of Object.entries(command.params)) {
        const type = TYPE_TRANSLATIONS[details.type] || details.type;
        docs.push(`${param}: (${type}) ${details.description}`);
      }
    }
  }

  return docs.join('\n') + '\n*\n';
}

export async function executeCommand(agent, message) {
  try {
    const parsed = parseCommandMessage(message);
    if (typeof parsed === 'string') return parsed;

    const command = getCommand(parsed.commandName);
    const params = command.params ? Object.values(command.params).length : 0;
    const args = parsed.args?.length || 0;

    if (args !== params) {
      return `Command ${command.name} was given ${args} args, but requires ${params} args.`;
    }

    return await command.perform(agent, ...(parsed.args || []));
  } catch (error) {
    return error.message;
  }
}

function parseCommandMessage(message) {
  const match = message.match(commandRegex);
  if (!match) return 'Command is incorrectly formatted';

  const commandName = "!" + match[1];
  const command = getCommand(commandName);
  if (!command) return `${commandName} is not a command.`;

  const rawArgs = match[2] ? match[2].match(argRegex) : [];
  const params = command.params ? Object.entries(command.params) : [];

  if (rawArgs.length !== params.length) {
    return `Command ${command.name} was given ${rawArgs.length} args, but requires ${params.length} args.`;
  }

  try {
    const args = rawArgs.map((arg, i) => {
      const [paramName, param] = params[i];
      return parseArg(arg, param, paramName, commandName);
    });

    return { commandName, args };
  } catch (error) {
    return error.message;
  }
}
