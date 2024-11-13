import * as mc from "../../utils/mcdata.js";
import * as world from "./world.js";
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';

// Utility functions
export function log(bot, message, chat=false) {
    bot.output += message + '\n';
    if (chat)
        bot.chat(message);
}

async function autoLight(bot) {
    if (world.shouldPlaceTorch(bot)) {
        try {
            const pos = world.getPosition(bot);
            return await placeBlock(bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
        } catch (err) {
            return false;
        }
    }
    return false;
}

async function equipHighestAttack(bot) {
    let weapons = bot.inventory.items().filter(item => 
        item.name.includes('sword') || 
        (item.name.includes('axe') && !item.name.includes('pickaxe'))
    );
    
    if (weapons.length === 0) {
        weapons = bot.inventory.items().filter(item => 
            item.name.includes('pickaxe') || 
            item.name.includes('shovel')
        );
    }
    
    if (weapons.length === 0) return;
    
    weapons.sort((a, b) => b.attackDamage - a.attackDamage);
    if (weapons[0]) await bot.equip(weapons[0], 'hand');
}

// Movement functions
export async function goToPosition(bot, x, y, z, min_distance=2) {
    if (x == null || y == null || z == null) {
        log(bot, `Missing coordinates, given x:${x} y:${y} z:${z}`);
        return false;
    }

    if (bot.modes.isOn('cheat')) {
        bot.chat('/tp @s ' + x + ' ' + y + ' ' + z);
        log(bot, `Teleported to ${x}, ${y}, ${z}.`);
        return true;
    }

    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalNear(x, y, z, min_distance));
    log(bot, `You have reached ${x}, ${y}, ${z}.`);
    return true;
}

export async function goToNearestBlock(bot, blockType, min_distance=2, range=64) {
    const MAX_RANGE = 512;
    range = Math.min(range, MAX_RANGE);

    const block = world.getNearestBlock(bot, blockType, range);
    if (!block) {
        log(bot, `Could not find any ${blockType} in ${range} blocks.`);
        return false;
    }

    log(bot, `Found ${blockType} at ${block.position}.`);
    return await goToPosition(bot, block.position.x, block.position.y, block.position.z, min_distance);
}

export async function goToPlayer(bot, username, distance=3) {
    if (bot.modes.isOn('cheat')) {
        bot.chat('/tp @s ' + username);
        log(bot, `Teleported to ${username}.`);
        return true;
    }

    bot.modes.pause('self_defense');
    bot.modes.pause('cowardice');
    
    const player = bot.players[username]?.entity;
    if (!player) {
        log(bot, `Could not find ${username}.`);
        return false;
    }

    const move = new pf.Movements(bot);
    bot.pathfinder.setMovements(move);
    await bot.pathfinder.goto(new pf.goals.GoalFollow(player, distance), true);

    log(bot, `You have reached ${username}.`);
    return true;
}

export async function followPlayer(bot, username, distance=4) {
    const player = bot.players[username]?.entity;
    if (!player) return false;

    const move = new pf.Movements(bot);
    bot.pathfinder.setMovements(move);
    bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, distance), true);
    log(bot, `You are now actively following player ${username}.`);

    while (!bot.interrupt_code) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (bot.modes.isOn('cheat') && 
            bot.entity.position.distanceTo(player.position) > 100 && 
            player.isOnGround) {
            await goToPlayer(bot, username);
        }

        if (bot.modes.isOn('unstuck')) {
            const isNearby = bot.entity.position.distanceTo(player.position) <= distance + 1;
            isNearby ? bot.modes.pause('unstuck') : bot.modes.unpause('unstuck');
        }
    }
    return true;
}

export async function moveAway(bot, distance) {
    const pos = bot.entity.position;
    let goal = new pf.goals.GoalNear(pos.x, pos.y, pos.z, distance);
    let invertedGoal = new pf.goals.GoalInvert(goal);
    bot.pathfinder.setMovements(new pf.Movements(bot));

    if (bot.modes.isOn('cheat')) {
        const move = new pf.Movements(bot);
        const path = await bot.pathfinder.getPathTo(move, invertedGoal, 10000);
        let lastMove = path.path[path.path.length-1];
        
        if (lastMove) {
            let x = Math.floor(lastMove.x);
            let y = Math.floor(lastMove.y);
            let z = Math.floor(lastMove.z);
            bot.chat('/tp @s ' + x + ' ' + y + ' ' + z);
            return true;
        }
    }

    await bot.pathfinder.goto(invertedGoal);
    let newPos = bot.entity.position;
    log(bot, `Moved away from nearest entity to ${newPos}.`);
    return true;
}

// Combat functions 
export async function attackNearest(bot, mobType, kill=true) {
    bot.modes.pause('cowardice');
    
    const underwaterMobs = ['drowned', 'cod', 'salmon', 'tropical_fish', 'squid'];
    if (underwaterMobs.includes(mobType)) {
        bot.modes.pause('self_preservation');
    }

    const mob = world.getNearbyEntities(bot, 24).find(entity => entity.name === mobType);
    if (mob) {
        return await attackEntity(bot, mob, kill);
    }

    log(bot, 'Could not find any '+mobType+' to attack.');
    return false;
}

export async function attackEntity(bot, entity, kill=true) {
    const pos = entity.position;

    await equipHighestAttack(bot);

    if (!kill) {
        if (bot.entity.position.distanceTo(pos) > 5) {
            await goToPosition(bot, pos.x, pos.y, pos.z);
        }
        await bot.attack(entity);
    } else {
        bot.pvp.attack(entity);
        while (world.getNearbyEntities(bot, 24).includes(entity)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (bot.interrupt_code) {
                bot.pvp.stop();
                return false;
            }
        }
        log(bot, `Successfully killed ${entity.name}.`);
        await pickupNearbyItems(bot);
        return true;
    }
}

export async function defendSelf(bot, range=9) {
    bot.modes.pause('self_defense');
    bot.modes.pause('cowardice');
    
    let attacked = false;
    let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
    
    while (enemy) {
        await equipHighestAttack(bot);

        const distanceToEnemy = bot.entity.position.distanceTo(enemy.position);
        
        if (distanceToEnemy >= 4 && enemy.name !== 'creeper' && enemy.name !== 'phantom') {
            try {
                bot.pathfinder.setMovements(new pf.Movements(bot));
                await bot.pathfinder.goto(new pf.goals.GoalFollow(enemy, 3.5), true);
            } catch (err) {/* might error if entity dies, ignore */}
        }

        if (distanceToEnemy <= 2) {
            try {
                bot.pathfinder.setMovements(new pf.Movements(bot));
                let invertedGoal = new pf.goals.GoalInvert(new pf.goals.GoalFollow(enemy, 2));
                await bot.pathfinder.goto(invertedGoal, true);
            } catch (err) {/* might error if entity dies, ignore */}
        }

        bot.pvp.attack(enemy);
        attacked = true;
        
        await new Promise(resolve => setTimeout(resolve, 500));
        enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
        
        if (bot.interrupt_code) {
            bot.pvp.stop();
            return false;
        }
    }

    bot.pvp.stop();
    log(bot, attacked ? `Successfully defended self.` : `No enemies nearby to defend self from.`);
    return attacked;
}

// Crafting and Item Management
export async function craftRecipe(bot, itemName, num=1) {
    let placedTable = false;

    if (mc.getItemCraftingRecipes(itemName).length === 0) {
        log(bot, `${itemName} is either not an item, or it does not have a crafting recipe!`);
        return false;
    }

    // Get recipes that don't require a crafting table
    let recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, null); 
    let craftingTable = null;
    const craftingTableRange = 32;

    placeTable: if (!recipes || recipes.length === 0) {
        recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, true);
        if (!recipes || recipes.length === 0) break placeTable;

        craftingTable = world.getNearestBlock(bot, 'crafting_table', craftingTableRange);
        
        if (!craftingTable) {
            const hasTable = world.getInventoryCounts(bot)['crafting_table'] > 0;
            if (hasTable) {
                const pos = world.getNearestFreeSpace(bot, 1, 6);
                await placeBlock(bot, 'crafting_table', pos.x, pos.y, pos.z);
                craftingTable = world.getNearestBlock(bot, 'crafting_table', craftingTableRange);
                
                if (craftingTable) {
                    recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, craftingTable);
                    placedTable = true;
                }
            } else {
                log(bot, `Crafting ${itemName} requires a crafting table.`);
                return false;
            }
        } else {
            recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, craftingTable);
        }
    }

    if (!recipes || recipes.length === 0) {
        const recipeRequirements = Object.entries(mc.getItemCraftingRecipes(itemName)[0])
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
        log(bot, `You do not have the resources to craft a ${itemName}. It requires: ${recipeRequirements}.`);
        
        if (placedTable) {
            await collectBlock(bot, 'crafting_table', 1);
        }
        return false;
    }
    
    if (craftingTable && bot.entity.position.distanceTo(craftingTable.position) > 4) {
        await goToNearestBlock(bot, 'crafting_table', 4, craftingTableRange);
    }

    const recipe = recipes[0];
    const inventory = world.getInventoryCounts(bot);
    const requiredIngredients = mc.ingredientsFromPrismarineRecipe(recipe);
    const craftLimit = mc.calculateLimitingResource(inventory, requiredIngredients);
    const craftAmount = Math.min(craftLimit.num, num);
    
    await bot.craft(recipe, craftAmount, craftingTable);
    
    if (craftLimit.num < num) {
        log(bot, `Not enough ${craftLimit.limitingResource} to craft ${num}, crafted ${craftLimit.num}. You now have ${world.getInventoryCounts(bot)[itemName]} ${itemName}.`);
    } else {
        log(bot, `Successfully crafted ${itemName}, you now have ${world.getInventoryCounts(bot)[itemName]} ${itemName}.`);
    }

    if (placedTable) {
        await collectBlock(bot, 'crafting_table', 1);
    }

    bot.armorManager.equipAll();
    return true;
}

export async function smeltItem(bot, itemName, num=1) {
    if (!mc.isSmeltable(itemName)) {
        log(bot, `Cannot smelt ${itemName}. Hint: make sure you are smelting the 'raw' item.`);
        return false;
    }

    const furnaceRange = 32;
    let placedFurnace = false;
    let furnaceBlock = world.getNearestBlock(bot, 'furnace', furnaceRange);

    if (!furnaceBlock) {
        const hasFurnace = world.getInventoryCounts(bot)['furnace'] > 0;
        if (hasFurnace) {
            const pos = world.getNearestFreeSpace(bot, 1, furnaceRange);
            await placeBlock(bot, 'furnace', pos.x, pos.y, pos.z);
            furnaceBlock = world.getNearestBlock(bot, 'furnace', furnaceRange);
            placedFurnace = true;
        }
    }

    if (!furnaceBlock) {
        log(bot, `There is no furnace nearby and you have no furnace.`);
        return false;
    }

    if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
        await goToNearestBlock(bot, 'furnace', 4, furnaceRange);
    }

    bot.modes.pause('unstuck');
    await bot.lookAt(furnaceBlock.position);

    const furnace = await bot.openFurnace(furnaceBlock);
    const inputItem = furnace.inputItem();

    // Check if furnace is already in use
    if (inputItem && inputItem.type !== mc.getItemId(itemName) && inputItem.count > 0) {
        log(bot, `The furnace is currently smelting ${mc.getItemName(inputItem.type)}.`);
        if (placedFurnace) {
            await collectBlock(bot, 'furnace', 1);
        }
        return false;
    }

    // Check inventory resources
    const invCounts = world.getInventoryCounts(bot);
    if (!invCounts[itemName] || invCounts[itemName] < num) {
        log(bot, `You do not have enough ${itemName} to smelt.`);
        if (placedFurnace) {
            await collectBlock(bot, 'furnace', 1);
        }
        return false;
    }

    // Handle fuel
    if (!furnace.fuelItem()) {
        const fuel = mc.getSmeltingFuel(bot);
        if (!fuel) {
            log(bot, `You have no fuel to smelt ${itemName}, you need coal, charcoal, or wood.`);
            if (placedFurnace) {
                await collectBlock(bot, 'furnace', 1);
            }
            return false;
        }

        const requiredFuel = Math.ceil(num / mc.getFuelSmeltOutput(fuel.name));

        if (fuel.count < requiredFuel) {
            log(bot, `You don't have enough ${fuel.name} to smelt ${num} ${itemName}; you need ${requiredFuel}.`);
            if (placedFurnace) {
                await collectBlock(bot, 'furnace', 1);
            }
            return false;
        }

        await furnace.putFuel(fuel.type, null, requiredFuel);
        log(bot, `Added ${requiredFuel} ${mc.getItemName(fuel.type)} to furnace fuel.`);
    }

    // Start smelting process
    await furnace.putInput(mc.getItemId(itemName), null, num);
    
    let total = 0;
    let collectedLast = true;
    let smeltedItem = null;
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    while (total < num) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        let collected = false;
        if (furnace.outputItem()) {
            smeltedItem = await furnace.takeOutput();
            if (smeltedItem) {
                total += smeltedItem.count;
                collected = true;
            }
        }

        if (!collected && !collectedLast) break;
        collectedLast = collected;
        if (bot.interrupt_code) break;
    }

    await bot.closeWindow(furnace);

    if (placedFurnace) {
        await collectBlock(bot, 'furnace', 1);
    }

    if (total === 0) {
        log(bot, `Failed to smelt ${itemName}.`);
        return false;
    }

    if (total < num) {
        log(bot, `Only smelted ${total} ${mc.getItemName(smeltedItem.type)}.`);
        return false;
    }

    log(bot, `Successfully smelted ${itemName}, got ${total} ${mc.getItemName(smeltedItem.type)}.`);
    return true;
}

// Inventory Management
export async function clearNearestFurnace(bot) {
    const furnaceBlock = world.getNearestBlock(bot, 'furnace', 32);
    if (!furnaceBlock) {
        log(bot, `No furnace nearby to clear.`);
        return false;
    }

    if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
        await goToNearestBlock(bot, 'furnace', 4, 32);
    }

    const furnace = await bot.openFurnace(furnaceBlock);
    
    // Extract all items from furnace
    let [smeltedItem, inputItem, fuelItem] = [null, null, null];
    
    if (furnace.outputItem()) smeltedItem = await furnace.takeOutput();
    if (furnace.inputItem()) inputItem = await furnace.takeInput();
    if (furnace.fuelItem()) fuelItem = await furnace.takeFuel();

    const formatItem = (item) => item ? `${item.count} ${item.name}` : '0 items';
    log(bot, `Cleared furnace, received ${formatItem(smeltedItem)} smelted, ${formatItem(inputItem)} input, and ${formatItem(fuelItem)} fuel.`);
    
    return true;
}

export async function pickupNearbyItems(bot) {
    const PICKUP_DISTANCE = 8;
    const getNearestItem = bot => bot.nearestEntity(entity => 
        entity.name === 'item' && 
        bot.entity.position.distanceTo(entity.position) < PICKUP_DISTANCE
    );

    let nearestItem = getNearestItem(bot);
    let pickedUp = 0;

    while (nearestItem) {
        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(new pf.goals.GoalFollow(nearestItem, 0.8), true);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const previousItem = nearestItem;
        nearestItem = getNearestItem(bot);
        
        if (previousItem === nearestItem) break;
        pickedUp++;
    }

    log(bot, `Picked up ${pickedUp} items.`);
    return true;
}

export async function equip(bot, itemName) {
    const item = bot.inventory.slots.find(slot => slot && slot.name === itemName);
    if (!item) {
        log(bot, `You do not have any ${itemName} to equip.`);
        return false;
    }

    const equipmentSlot = (() => {
        if (itemName.includes('leggings')) return 'legs';
        if (itemName.includes('boots')) return 'feet';
        if (itemName.includes('helmet')) return 'head';
        if (itemName.includes('chestplate') || itemName.includes('elytra')) return 'torso';
        if (itemName.includes('shield')) return 'off-hand';
        return 'hand';
    })();

    await bot.equip(item, equipmentSlot);
    log(bot, `Equipped ${itemName}.`);
    return true;
}

export async function discard(bot, itemName, num=-1) {
    let discarded = 0;
    
    while (true) {
        const item = bot.inventory.items().find(item => item.name === itemName);
        if (!item) break;

        const toDiscard = num === -1 ? item.count : Math.min(num - discarded, item.count);
        await bot.toss(item.type, null, toDiscard);
        discarded += toDiscard;

        if (num !== -1 && discarded >= num) break;
    }

    if (discarded === 0) {
        log(bot, `You do not have any ${itemName} to discard.`);
        return false;
    }

    log(bot, `Successfully discarded ${discarded} ${itemName}.`);
    return true;
}

// Chest Operations
export async function putInChest(bot, itemName, num=-1) {
    const chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }

    const item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
        log(bot, `You do not have any ${itemName} to put in the chest.`);
        return false;
    }

    const toPut = num === -1 ? item.count : Math.min(num, item.count);
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    
    const chestContainer = await bot.openContainer(chest);
    await chestContainer.deposit(item.type, null, toPut);
    await chestContainer.close();
    
    log(bot, `Successfully put ${toPut} ${itemName} in the chest.`);
    return true;
}

export async function takeFromChest(bot, itemName, num=-1) {
    const chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }

    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    
    const item = chestContainer.containerItems().find(item => item.name === itemName);
    if (!item) {
        log(bot, `Could not find any ${itemName} in the chest.`);
        await chestContainer.close();
        return false;
    }

    const toTake = num === -1 ? item.count : Math.min(num, item.count);
    await chestContainer.withdraw(item.type, null, toTake);
    await chestContainer.close();
    
    log(bot, `Successfully took ${toTake} ${itemName} from the chest.`);
    return true;
}

export async function viewChest(bot) {
    const chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }

    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    const items = chestContainer.containerItems();

    if (items.length === 0) {
        log(bot, `The chest is empty.`);
    } else {
        log(bot, `The chest contains:`);
        items.forEach(item => log(bot, `${item.count} ${item.name}`));
    }

    await chestContainer.close();
    return true;
}

// World Interaction
export async function breakBlockAt(bot, x, y, z) {
    if (x == null || y == null || z == null) {
        throw new Error('Invalid position to break block at.');
    }

    const block = bot.blockAt(Vec3(x, y, z));
    const unbreakableBlocks = ['air', 'water', 'lava'];
    
    if (!unbreakableBlocks.includes(block.name)) {
        if (bot.modes.isOn('cheat')) {
            const setBlockCommand = `/setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} air`;
            bot.chat(setBlockCommand);
            log(bot, `Used /setblock to break block at ${x}, ${y}, ${z}.`);
            return true;
        }

        if (bot.entity.position.distanceTo(block.position) > 4.5) {
            const pos = block.position;
            const movements = new pf.Movements(bot);
            movements.canPlaceOn = false;
            movements.allow1by1towers = false;
            bot.pathfinder.setMovements(movements);
            await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
        }

        if (bot.game.gameMode !== 'creative') {
            await bot.tool.equipForBlock(block);
            const itemId = bot.heldItem ? bot.heldItem.type : null;
            if (!block.canHarvest(itemId)) {
                log(bot, `Don't have right tools to break ${block.name}.`);
                return false;
            }
        }

        await bot.dig(block, true);
        log(bot, `Broke ${block.name} at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);
    } else {
        log(bot, `Skipping block at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)} because it is ${block.name}.`);
        return false;
    }
    return true;
}

export async function placeBlock(bot, blockType, x, y, z, placeOn='bottom', dontCheat=false) {
    if (!mc.getBlockId(blockType)) {
        log(bot, `Invalid block type: ${blockType}.`);
        return false;
    }

    const targetDest = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));

    if (bot.modes.isOn('cheat') && !dontCheat) {
        const getFacing = (direction) => {
            const facings = {
                north: 'south',
                south: 'north',
                east: 'west',
                west: 'east'
            };
            return facings[direction] || direction;
        };

        let blockName = blockType;
        const face = getFacing(placeOn);

        if (blockType.includes('torch') && placeOn !== 'bottom') {
            blockName = blockType.replace('torch', 'wall_torch');
            if (placeOn !== 'side' && placeOn !== 'top') {
                blockName += `[facing=${face}]`;
            }
        }

        if (blockType.includes('button') || blockType === 'lever') {
            if (placeOn === 'top') {
                blockName += `[face=ceiling]`;
            } else if (placeOn === 'bottom') {
                blockName += `[face=floor]`;
            } else {
                blockName += `[facing=${face}]`;
            }
        }

        if (['ladder', 'repeater', 'comparator'].includes(blockType)) {
            blockName += `[facing=${face}]`;
        }

        const setBlockCommand = `/setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} ${blockName}`;
        bot.chat(setBlockCommand);

        // Handle special blocks that need additional placement
        if (blockType.includes('door')) {
            bot.chat(`/setblock ${Math.floor(x)} ${Math.floor(y+1)} ${Math.floor(z)} ${blockName}[half=upper]`);
        }
        if (blockType.includes('bed')) {
            bot.chat(`/setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z-1)} ${blockName}[part=head]`);
        }

        log(bot, `Used /setblock to place ${blockName} at ${targetDest}.`);
        return true;
    }

    // Normal block placement logic
    const itemName = blockType === "redstone_wire" ? "redstone" : blockType;
    let block = bot.inventory.items().find(item => item.name === itemName);

    if (!block && bot.game.gameMode === 'creative') {
        await bot.creative.setInventorySlot(36, mc.makeItem(itemName, 1));
        block = bot.inventory.items().find(item => item.name === itemName);
    }

    if (!block) {
        log(bot, `Don't have any ${blockType} to place.`);
        return false;
    }

    const targetBlock = bot.blockAt(targetDest);
    if (targetBlock.name === blockType) {
        log(bot, `${blockType} already at ${targetBlock.position}.`);
        return false;
    }

    const emptyBlocks = ['air', 'water', 'lava', 'grass', 'short_grass', 'tall_grass', 'snow', 'dead_bush', 'fern'];
    if (!emptyBlocks.includes(targetBlock.name)) {
        const removed = await breakBlockAt(bot, x, y, z);
        if (!removed) {
            log(bot, `Cannot place ${blockType} at ${targetBlock.position}: block in the way.`);
            return false;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Find suitable placement face
    const dirMap = {
        'top': Vec3(0, 1, 0),
        'bottom': Vec3(0, -1, 0),
        'north': Vec3(0, 0, -1),
        'south': Vec3(0, 0, 1),
        'east': Vec3(1, 0, 0),
        'west': Vec3(-1, 0, 0)
    };

    let dirs = [];
    if (placeOn === 'side') {
        dirs = ['north', 'south', 'east', 'west'].map(dir => dirMap[dir]);
    } else if (dirMap[placeOn]) {
        dirs = [dirMap[placeOn]];
    } else {
        dirs = [dirMap['bottom']];
        log(bot, `Unknown placeOn value "${placeOn}". Defaulting to bottom.`);
    }

    dirs.push(...Object.values(dirMap).filter(d => !dirs.includes(d)));

    let buildOffBlock = null;
    let faceVec = null;

    for (let dir of dirs) {
        const adjacentBlock = bot.blockAt(targetDest.plus(dir));
        if (!emptyBlocks.includes(adjacentBlock.name)) {
            buildOffBlock = adjacentBlock;
            faceVec = new Vec3(-dir.x, -dir.y, -dir.z);
            break;
        }
    }

    if (!buildOffBlock) {
        log(bot, `Cannot place ${blockType} at ${targetBlock.position}: nothing to place on.`);
        return false;
    }

    // Check if bot needs to move
    const botPos = bot.entity.position;
    const botPosAbove = botPos.plus(Vec3(0, 1, 0));
    const dontMoveFor = ['torch', 'redstone_torch', 'redstone_wire', 'lever', 'button', 'rail', 
                        'detector_rail', 'powered_rail', 'activator_rail', 'tripwire_hook', 
                        'tripwire', 'water_bucket'];

    if (!dontMoveFor.includes(blockType) && 
        (botPos.distanceTo(targetBlock.position) < 1 || botPosAbove.distanceTo(targetBlock.position) < 1)) {
        const goal = new pf.goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2);
        const invertedGoal = new pf.goals.GoalInvert(goal);
        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(invertedGoal);
    }

    if (bot.entity.position.distanceTo(targetBlock.position) > 4.5) {
        const pos = targetBlock.position;
        const movements = new pf.Movements(bot);
        bot.pathfinder.setMovements(movements);
        await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
    }

    await bot.equip(block, 'hand');
    await bot.lookAt(buildOffBlock.position);

    try {
        await bot.placeBlock(buildOffBlock, faceVec);
        log(bot, `Placed ${blockType} at ${targetDest}.`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return true;
    } catch (err) {
        log(bot, `Failed to place ${blockType} at ${targetDest}.`);
        return false;
    }
}

// Miscellaneous Actions
export async function eat(bot, foodName="") {
    const item = foodName 
        ? bot.inventory.items().find(item => item.name === foodName)
        : bot.inventory.items().find(item => item.foodRecovery > 0);
    
    const itemName = foodName || "food";

    if (!item) {
        log(bot, `You do not have any ${itemName} to eat.`);
        return false;
    }

    await bot.equip(item, 'hand');
    await bot.consume();
    log(bot, `Successfully ate ${item.name}.`);
    return true;
}

export async function stay(bot, seconds=30) {
    const modesToPause = [
        'self_preservation',
        'unstuck',
        'cowardice',
        'self_defense',
        'hunting',
        'torch_placing',
        'item_collecting'
    ];

    modesToPause.forEach(mode => bot.modes.pause(mode));

    const start = Date.now();
    while (!bot.interrupt_code && (seconds === -1 || Date.now() - start < seconds*1000)) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    log(bot, `Stayed for ${(Date.now() - start)/1000} seconds.`);
    return true;
}

export async function avoidEnemies(bot, distance=16) {
    bot.modes.pause('self_preservation');
    
    let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), distance);
    while (enemy) {
        const follow = new pf.goals.GoalFollow(enemy, distance + 1);
        const invertedGoal = new pf.goals.GoalInvert(follow);
        
        bot.pathfinder.setMovements(new pf.Movements(bot));
        bot.pathfinder.setGoal(invertedGoal, true);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), distance);
        
        if (bot.interrupt_code) break;
        
        if (enemy && bot.entity.position.distanceTo(enemy.position) < 3) {
            await attackEntity(bot, enemy, false);
        }
    }

    bot.pathfinder.stop();
    log(bot, `Moved ${distance} away from enemies.`);
    return true;
}

// World Interaction - Farming & Special Blocks
export async function tillAndSow(bot, x, y, z, seedType=null) {
    const roundedPos = {
        x: Math.round(x),
        y: Math.round(y),
        z: Math.round(z)
    };

    const block = bot.blockAt(new Vec3(roundedPos.x, roundedPos.y, roundedPos.z));
    const tillableBlocks = ['grass_block', 'dirt', 'farmland'];
    
    if (!tillableBlocks.includes(block.name)) {
        log(bot, `Cannot till ${block.name}, must be grass_block or dirt.`);
        return false;
    }

    const blockAbove = bot.blockAt(new Vec3(roundedPos.x, roundedPos.y + 1, roundedPos.z));
    if (blockAbove.name !== 'air') {
        log(bot, `Cannot till, there is ${blockAbove.name} above the block.`);
        return false;
    }

    // Move to block if too far
    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        const pos = block.position;
        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
    }

    // Till the block if needed
    if (block.name !== 'farmland') {
        const hoe = bot.inventory.items().find(item => item.name.includes('hoe'));
        if (!hoe) {
            log(bot, `Cannot till, no hoes.`);
            return false;
        }
        await bot.equip(hoe, 'hand');
        await bot.activateBlock(block);
        log(bot, `Tilled block x:${roundedPos.x}, y:${roundedPos.y}, z:${roundedPos.z}.`);
    }
    
    // Plant seeds if provided
    if (seedType) {
        let adjustedSeedType = seedType;
        if (seedType.endsWith('seed') && !seedType.endsWith('seeds')) {
            adjustedSeedType += 's'; // Fix common mistake
        }

        const seeds = bot.inventory.items().find(item => item.name === adjustedSeedType);
        if (!seeds) {
            log(bot, `No ${adjustedSeedType} to plant.`);
            return false;
        }

        await bot.equip(seeds, 'hand');
        await bot.placeBlock(block, new Vec3(0, -1, 0));
        log(bot, `Planted ${adjustedSeedType} at x:${roundedPos.x}, y:${roundedPos.y}, z:${roundedPos.z}.`);
    }

    return true;
}

export async function useDoor(bot, doorPos=null) {
    // Find door if position not provided
    if (!doorPos) {
        const doorTypes = [
            'oak_door', 'spruce_door', 'birch_door', 'jungle_door',
            'acacia_door', 'dark_oak_door', 'mangrove_door', 'cherry_door',
            'bamboo_door', 'crimson_door', 'warped_door'
        ];

        for (const doorType of doorTypes) {
            const door = world.getNearestBlock(bot, doorType, 16);
            if (door) {
                doorPos = door.position;
                break;
            }
        }
    } else {
        doorPos = Vec3(doorPos.x, doorPos.y, doorPos.z);
    }

    if (!doorPos) {
        log(bot, `Could not find a door to use.`);
        return false;
    }

    // Move to door
    bot.pathfinder.setGoal(new pf.goals.GoalNear(doorPos.x, doorPos.y, doorPos.z, 1));
    await new Promise(resolve => setTimeout(resolve, 1000));
    while (bot.pathfinder.isMoving()) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Use door
    const doorBlock = bot.blockAt(doorPos);
    await bot.lookAt(doorPos);
    
    if (!doorBlock._properties.open) {
        await bot.activateBlock(doorBlock);
    }
    
    // Walk through door
    bot.setControlState("forward", true);
    await new Promise(resolve => setTimeout(resolve, 600));
    bot.setControlState("forward", false);
    await bot.activateBlock(doorBlock);

    log(bot, `Used door at ${doorPos}.`);
    return true;
}

export async function goToBed(bot) {
    const beds = bot.findBlocks({
        matching: block => block.name.includes('bed'),
        maxDistance: 32,
        count: 1
    });

    if (beds.length === 0) {
        log(bot, `Could not find a bed to sleep in.`);
        return false;
    }

    const bedLocation = beds[0];
    await goToPosition(bot, bedLocation.x, bedLocation.y, bedLocation.z);
    
    const bed = bot.blockAt(bedLocation);
    await bot.sleep(bed);
    log(bot, `You are in bed.`);
    
    bot.modes.pause('unstuck');
    while (bot.isSleeping) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    log(bot, `You have woken up.`);
    return true;
}

export async function activateNearestBlock(bot, type) {
    const block = world.getNearestBlock(bot, type, 16);
    if (!block) {
        log(bot, `Could not find any ${type} to activate.`);
        return false;
    }

    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        const pos = block.position;
        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
    }

    await bot.activateBlock(block);
    log(bot, `Activated ${type} at x:${block.position.x.toFixed(1)}, y:${block.position.y.toFixed(1)}, z:${block.position.z.toFixed(1)}.`);
    return true;
}

export async function giveToPlayer(bot, itemType, username, num=1) {
    const player = bot.players[username]?.entity;
    if (!player) {
        log(bot, `Could not find ${username}.`);
        return false;
    }

    await goToPlayer(bot, username);
    await bot.lookAt(player.position);
    await discard(bot, itemType, num);
    return true;
}