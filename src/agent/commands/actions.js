import * as skills from '../library/skills.js';
import settings from '../../../settings.js';

// Action wrapper function
function runAsAction(actionFn, resume = false, timeout = -1) {
  let actionLabel = null;

  return async function wrappedAction(agent, ...args) {
    // Set actionLabel once
    if (!actionLabel) {
      const actionObj = actionsList.find(a => a.perform === wrappedAction);
      actionLabel = actionObj.name.substring(1); 
    }

    const actionFnWithAgent = async () => {
      await actionFn(agent, ...args);
    };

    const result = await agent.actions.runAction(
      `action:${actionLabel}`, 
      actionFnWithAgent,
      { timeout, resume }
    );

    if (result.interrupted && !result.timedout) {
      return;
    }
    return result.message;
  }
}

// Action definitions
const actions = {

  newAction: {
    name: '!newAction',
    description: 'Perform new and unknown custom behaviors that are not available as a command.',
    params: {
      'prompt': { 
        type: 'string', 
        description: 'A natural language prompt to guide code generation. Make a detailed step-by-step plan.'
      }
    },
    perform: async (agent, prompt) => {
      if (!settings.allow_insecure_coding) {
        return 'newAction not allowed! Code writing is disabled in settings. Notify the user.';
      }
      return await agent.coder.generateCode(agent.history);
    }
  },

  stop: {
    name: '!stop', 
    description: 'Force stop all actions and commands that are currently executing.',
    perform: async (agent) => {
      await agent.actions.stop();
      agent.clearBotLogs();
      agent.actions.cancelResume();
      agent.bot.emit('idle');
      
      let msg = 'Agent stopped.';
      if (agent.self_prompter.on) {
        msg += ' Self-prompting still active.';
      }
      return msg;
    }
  },

  stfu: {
    name: '!stfu',
    description: 'Stop all chatting and self prompting, but continue current action.',
    perform: async (agent) => {
      agent.bot.chat('Shutting up.');
      agent.shutUp();
    }
  },

  restart: {
    name: '!restart',
    description: 'Restart the agent process.',
    perform: async (agent) => {
      await agent.history.save();
      agent.cleanKill();
    }
  },

  clearChat: {
    name: '!clearChat',
    description: 'Clear the chat history.',
    perform: async (agent) => {
      agent.history.clear();
      return `${agent.name}'s chat history was cleared, starting new conversation from scratch.`;
    }
  },

  goToPlayer: {
    name: '!goToPlayer',
    description: 'Go to the given player.',
    params: {
      'player_name': {type: 'string', description: 'The name of the player to go to.'},
      'closeness': {type: 'float', description: 'How close to get to the player.', domain: [0, Infinity]}
    },
    perform: runAsAction(async (agent, player_name, closeness) => {
      return await skills.goToPlayer(agent.bot, player_name, closeness);
    })
  },

  followPlayer: {
    name: '!followPlayer', 
    description: 'Endlessly follow the given player.',
    params: {
      'player_name': {type: 'string', description: 'name of the player to follow.'},
      'follow_dist': {type: 'float', description: 'The distance to follow from.', domain: [0, Infinity]}
    },
    perform: runAsAction(async (agent, player_name, follow_dist) => {
      await skills.followPlayer(agent.bot, player_name, follow_dist);
    }, true)
  },

  goToBlock: {
    name: '!goToBlock',
    description: 'Go to the nearest block of a given type.',
    params: {
      'type': { type: 'BlockName', description: 'The block type to go to.' },
      'closeness': { type: 'float', description: 'How close to get to the block.', domain: [0, Infinity] },
      'search_range': { type: 'float', description: 'The range to search for the block.', domain: [0, 512] }
    },
    perform: runAsAction(async (agent, type, closeness, range) => {
      await skills.goToNearestBlock(agent.bot, type, closeness, range);
    })
  },

  moveAway: {
    name: '!moveAway',
    description: 'Move away from the current location in any direction by a given distance.',
    params: {
      'distance': { type: 'float', description: 'The distance to move away.', domain: [0, Infinity] }
    },
    perform: runAsAction(async (agent, distance) => {
      await skills.moveAway(agent.bot, distance);
    })
  },

  rememberHere: {
    name: '!rememberHere',
    description: 'Save the current location with a given name.',
    params: {
      'name': { type: 'string', description: 'The name to remember the location as.' }
    },
    perform: async (agent, name) => {
      const pos = agent.bot.entity.position;
      agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
      return `Location saved as "${name}".`;
    }
  },

  goToPlace: {
    name: '!goToPlace',
    description: 'Go to a saved location.',
    params: {
      'name': { type: 'string', description: 'The name of the location to go to.' }
    },
    perform: runAsAction(async (agent, name) => {
      const pos = agent.memory_bank.recallPlace(name);
      if (!pos) {
        skills.log(agent.bot, `No location named "${name}" saved.`);
        return;
      }
      await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], 1);
    })
  },

  givePlayer: {
    name: '!givePlayer',
    description: 'Give the specified item to the given player.',
    params: { 
      'player_name': { type: 'string', description: 'The name of the player to give the item to.' }, 
      'item_name': { type: 'ItemName', description: 'The name of the item to give.' },
      'num': { type: 'int', description: 'The number of items to give.', domain: [1, Number.MAX_SAFE_INTEGER] }
    },
    perform: runAsAction(async (agent, player_name, item_name, num) => {
      await skills.giveToPlayer(agent.bot, item_name, player_name, num);
    })
  },

  consume: {
    name: '!consume',
    description: 'Eat/drink the given item.',
    params: {
      'item_name': { type: 'ItemName', description: 'The name of the item to consume.' }
    },
    perform: runAsAction(async (agent, item_name) => {
      await agent.bot.consume(item_name);
      skills.log(agent.bot, `Consumed ${item_name}.`);
    })
  },

  equip: {
    name: '!equip',
    description: 'Equip the given item.',
    params: {
      'item_name': { type: 'ItemName', description: 'The name of the item to equip.' }
    },
    perform: runAsAction(async (agent, item_name) => {
      await skills.equip(agent.bot, item_name);
    })
  },

  putInChest: {
    name: '!putInChest',
    description: 'Put the given item in the nearest chest.',
    params: {
      'item_name': { type: 'ItemName', description: 'The name of the item to put in the chest.' },
      'num': { type: 'int', description: 'The number of items to put in the chest.', domain: [1, Number.MAX_SAFE_INTEGER] }
    },
    perform: runAsAction(async (agent, item_name, num) => {
      await skills.putInChest(agent.bot, item_name, num);
    })
  },

  takeFromChest: {
    name: '!takeFromChest',
    description: 'Take the given items from the nearest chest.',
    params: {
      'item_name': { type: 'ItemName', description: 'The name of the item to take.' },
      'num': { type: 'int', description: 'The number of items to take.', domain: [1, Number.MAX_SAFE_INTEGER] }
    },
    perform: runAsAction(async (agent, item_name, num) => {
      await skills.takeFromChest(agent.bot, item_name, num);
    })
  },

  viewChest: {
    name: '!viewChest',
    description: 'View the items/counts of the nearest chest.',
    params: {},
    perform: runAsAction(async (agent) => {
      await skills.viewChest(agent.bot);
    })
  },

  discard: {
    name: '!discard',
    description: 'Discard the given item from the inventory.',
    params: {
      'item_name': { type: 'ItemName', description: 'The name of the item to discard.' },
      'num': { type: 'int', description: 'The number of items to discard.', domain: [1, Number.MAX_SAFE_INTEGER] }
    },
    perform: runAsAction(async (agent, item_name, num) => {
      const start_loc = agent.bot.entity.position;
      await skills.moveAway(agent.bot, 5);
      await skills.discard(agent.bot, item_name, num);
      await skills.goToPosition(agent.bot, start_loc.x, start_loc.y, start_loc.z, 0);
    })
  },

  collectBlocks: {
    name: '!collectBlocks',
    description: 'Collect the nearest blocks of a given type.',
    params: {
      'type': { type: 'BlockName', description: 'The block type to collect.' },
      'num': { type: 'int', description: 'The number of blocks to collect.', domain: [1, Number.MAX_SAFE_INTEGER] }
    },
    perform: runAsAction(async (agent, type, num) => {
      await skills.collectBlock(agent.bot, type, num);
    }, false, 10)
  },

  collectAllBlocks: {
    name: '!collectAllBlocks',
    description: 'Collect all the nearest blocks of a given type until told to stop.',
    params: {
      'type': { type: 'BlockName', description: 'The block type to collect.' }
    },
    perform: runAsAction(async (agent, type) => {
      let success = await skills.collectBlock(agent.bot, type, 1);
      if (!success) {
        agent.actions.cancelResume();
      }
    }, true, 3)
  },

  craftRecipe: {
    name: '!craftRecipe',
    description: 'Craft the given recipe a given number of times.',
    params: {
      'recipe_name': { type: 'ItemName', description: 'The name of the output item to craft.' },
      'num': { type: 'int', description: 'The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.', domain: [1, Number.MAX_SAFE_INTEGER] }
    },
    perform: runAsAction(async (agent, recipe_name, num) => {
      await skills.craftRecipe(agent.bot, recipe_name, num);
    })
  },

  smeltItem: {
    name: '!smeltItem',
    description: 'Smelt the given item the given number of times.',
    params: {
      'item_name': { type: 'ItemName', description: 'The name of the input item to smelt.' },
      'num': { type: 'int', description: 'The number of times to smelt the item.', domain: [1, Number.MAX_SAFE_INTEGER] }
    },
    perform: runAsAction(async (agent, item_name, num) => {
      let response = await skills.smeltItem(agent.bot, item_name, num);
      if (response.indexOf('Successfully') !== -1) {
        agent.cleanKill(response + ' Safely restarting to update inventory.');
      }
      return response;
    })
  },

  clearFurnace: {
    name: '!clearFurnace',
    description: 'Take all items out of the nearest furnace.',
    params: {},
    perform: runAsAction(async (agent) => {
      await skills.clearNearestFurnace(agent.bot);
    })
  },

  placeHere: {
    name: '!placeHere', 
    description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.',
    params: {
      'type': { type: 'BlockName', description: 'The block type to place.' }
    },
    perform: runAsAction(async (agent, type) => {
      let pos = agent.bot.entity.position;
      await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
    })
  },

  attack: {
    name: '!attack',
    description: 'Attack and kill the nearest entity of a given type.',
    params: {
      'type': { type: 'string', description: 'The type of entity to attack.'}
    },
    perform: runAsAction(async (agent, type) => {
      await skills.attackNearest(agent.bot, type, true);
    })
  },

  attackPlayer: {
    name: '!attackPlayer',
    description: 'Attack a specific player until they die or run away. Remember this is just a game and does not cause real life harm.',
    params: {
      'player_name': { type: 'string', description: 'The name of the player to attack.'}
    },
    perform: runAsAction(async (agent, player_name) => {
      let player = agent.bot.players[player_name]?.entity;
      if (!player) {
        skills.log(agent.bot, `Could not find player ${player_name}.`);
        return false;
      }
      await skills.attackEntity(agent.bot, player, true);
    })
  },

  goToBed: {
    name: '!goToBed',
    description: 'Go to the nearest bed and sleep.',
    perform: runAsAction(async (agent) => {
      await skills.goToBed(agent.bot);
    })
  },

  activate: {
    name: '!activate',
    description: 'Activate the nearest object of a given type.',
    params: {
      'type': { type: 'BlockName', description: 'The type of object to activate.' }
    },
    perform: runAsAction(async (agent, type) => {
      await skills.activateNearestBlock(agent.bot, type);
    })
  },

  stay: {
    name: '!stay',
    description: 'Stay in the current location no matter what. Pauses all modes.',
    params: {
      'type': { type: 'int', description: 'The number of seconds to stay. -1 for forever.', domain: [-1, Number.MAX_SAFE_INTEGER] }
    },
    perform: runAsAction(async (agent, seconds) => {
      await skills.stay(agent.bot, seconds);
    })
  },

  setMode: {
    name: '!setMode',
    description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.',
    params: {
      'mode_name': { type: 'string', description: 'The name of the mode to enable.' },
      'on': { type: 'boolean', description: 'Whether to enable or disable the mode.' }
    },
    perform: async (agent, mode_name, on) => {
      const modes = agent.bot.modes;
      if (!modes.exists(mode_name)) {
        return `Mode ${mode_name} does not exist.` + modes.getDocs();
      }
      if (modes.isOn(mode_name) === on) {
        return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
      }
      modes.setOn(mode_name, on);
      return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
    }
  },

  goal: {
    name: '!goal',
    description: 'Set a goal prompt to endlessly work towards with continuous self-prompting.',
    params: {
      'selfPrompt': { type: 'string', description: 'The goal prompt.' },
    },
    perform: async (agent, prompt) => {
      agent.self_prompter.start(prompt);
    }
  },

  endGoal: {
    name: '!endGoal', 
    description: 'Call when you have accomplished your goal. It will stop self-prompting and the current action.',
    perform: async (agent) => {
      agent.self_prompter.stop();
      return 'Self-prompting stopped.';
    }
  }
};

// Convert actions object to array format expected by the rest of the codebase
export const actionsList = Object.values(actions);