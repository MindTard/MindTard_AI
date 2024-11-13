import * as skills from '../library/skills.js';
import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';
import { itemSatisfied } from './utils.js';

// Constants
const BLACKLIST = [
    'coal_block',
    'iron_block', 
    'gold_block',
    'diamond_block',
    'deepslate',
    'blackstone',
    'netherite',
    '_wood',
    'stripped_',
    'crimson',
    'warped',
    'dye'
];

class ItemNode {
    constructor(manager, wrapper, name) {
        this.manager = manager;
        this.wrapper = wrapper;
        this.name = name;
        this.type = '';
        this.source = null;
        this.prereq = null;
        this.recipe = [];
        this.fails = 0;
    }

    setRecipe(recipe) {
        this.type = 'craft';
        const size = this._calculateRecipeSize(recipe);
        this._setRecipeNodes(recipe);
        this._setPrereqIfNeeded(size);
        return this;
    }

    _calculateRecipeSize(recipe) {
        return Object.values(recipe).reduce((sum, value) => sum + value, 0);
    }

    _setRecipeNodes(recipe) {
        this.recipe = Object.entries(recipe).map(([key, value]) => {
            if (!this.manager.nodes[key]) {
                this.manager.nodes[key] = new ItemWrapper(this.manager, this.wrapper, key);
            }
            return { node: this.manager.nodes[key], quantity: value };
        });
    }

    _setPrereqIfNeeded(size) {
        if (size > 4) {
            if (!this.manager.nodes['crafting_table']) {
                this.manager.nodes['crafting_table'] = new ItemWrapper(this.manager, this.wrapper, 'crafting_table');
            }
            this.prereq = this.manager.nodes['crafting_table'];
        }
    }

    setCollectable(source = null, tool = null) {
        this.type = 'block';
        this.source = source || this.name;
        
        if (tool) {
            if (!this.manager.nodes[tool]) {
                this.manager.nodes[tool] = new ItemWrapper(this.manager, this.wrapper, tool);
            }
            this.prereq = this.manager.nodes[tool];
        }
        return this;
    }

    setSmeltable(sourceItem) {
        this.type = 'smelt';
        this._initializeSmeltingNodes(sourceItem);
        this._setSmeltingRecipe(sourceItem);
        return this;
    }

    _initializeSmeltingNodes(sourceItem) {
        if (!this.manager.nodes['furnace']) {
            this.manager.nodes['furnace'] = new ItemWrapper(this.manager, this.wrapper, 'furnace');
        }
        this.prereq = this.manager.nodes['furnace'];

        if (!this.manager.nodes[sourceItem]) {
            this.manager.nodes[sourceItem] = new ItemWrapper(this.manager, this.wrapper, sourceItem);
        }
        if (!this.manager.nodes['coal']) {
            this.manager.nodes['coal'] = new ItemWrapper(this.manager, this.wrapper, 'coal');
        }
    }

    _setSmeltingRecipe(sourceItem) {
        this.recipe = [
            { node: this.manager.nodes[sourceItem], quantity: 1 },
            { node: this.manager.nodes['coal'], quantity: 1 }
        ];
    }

    setHuntable(animalSource) {
        this.type = 'hunt';
        this.source = animalSource;
        return this;
    }

    getChildren() {
        const children = [...this.recipe];
        if (this.prereq) {
            children.push({ node: this.prereq, quantity: 1 });
        }
        return children;
    }

    isReady() {
        return this.getChildren().every(child => child.node.isDone(child.quantity));
    }

    isDone(quantity = 1) {
        if (this.manager.goal.name === this.name) return false;
        return itemSatisfied(this.manager.agent.bot, this.name, quantity);
    }

    getDepth(quantity = 1) {
        if (this.isDone(quantity)) return 0;
        const maxChildDepth = Math.max(...this.getChildren().map(child => 
            child.node.getDepth(child.quantity)
        ));
        return maxChildDepth + 1;
    }

    getFails(quantity = 1) {
        if (this.isDone(quantity)) return 0;
        const childFails = this.getChildren().reduce((sum, child) => 
            sum + child.node.getFails(child.quantity), 0
        );
        return childFails + this.fails;
    }

    getNext(quantity = 1) {
        if (this.isDone(quantity)) return null;
        if (this.isReady()) return { node: this, quantity };
        
        for (const child of this.getChildren()) {
            const result = child.node.getNext(child.quantity);
            if (result) return result;
        }
        return null;
    }

    async execute(quantity = 1) {
        if (!this.isReady()) {
            this.fails++;
            return;
        }

        const inventory = world.getInventoryCounts(this.manager.agent.bot);
        const initQuantity = inventory[this.name] || 0;

        await this._executeByType(quantity, inventory);

        const finalQuantity = world.getInventoryCounts(this.manager.agent.bot)[this.name] || 0;
        if (finalQuantity <= initQuantity) {
            this.fails++;
        }
    }

    async _executeByType(quantity, inventory) {
        switch(this.type) {
            case 'block':
                await skills.collectBlock(
                    this.manager.agent.bot, 
                    this.source, 
                    quantity, 
                    this.manager.agent.npc.getBuiltPositions()
                );
                break;
            case 'smelt':
                const toSmeltName = this.recipe[0].node.name;
                const toSmeltQuantity = Math.min(quantity, inventory[toSmeltName] || 1);
                await skills.smeltItem(this.manager.agent.bot, toSmeltName, toSmeltQuantity);
                break;
            case 'hunt':
                for (let i = 0; i < quantity; i++) {
                    const res = await skills.attackNearest(this.manager.agent.bot, this.source);
                    if (!res || this.manager.agent.bot.interrupt_code) break;
                }
                break;
            case 'craft':
                await skills.craftRecipe(this.manager.agent.bot, this.name, quantity);
                break;
        }
    }
}

class ItemWrapper {
    constructor(manager, parent, name) {
        this.manager = manager;
        this.name = name;
        this.parent = parent;
        this.methods = [];

        if (!this._isBlacklisted() && !this.containsCircularDependency()) {
            this.createChildren();
        }
    }

    _isBlacklisted() {
        return BLACKLIST.some(match => this.name.includes(match));
    }

    add_method(method) {
        if (method.getChildren().every(child => child.node.methods.length > 0)) {
            this.methods.push(method);
        }
    }

    createChildren() {
        this._createCraftingMethods();
        this._createCollectableMethods();
        this._createSmeltingMethods();
        this._createHuntingMethods();
    }

    _createCraftingMethods() {
        const recipes = mc.getItemCraftingRecipes(this.name);
        if (!recipes) return;

        recipes.forEach(recipe => {
            if (!this._hasBlacklistedIngredients(recipe)) {
                this.add_method(new ItemNode(this.manager, this, this.name).setRecipe(recipe));
            }
        });
    }

    _hasBlacklistedIngredients(recipe) {
        return Object.keys(recipe).some(ingredient => 
            BLACKLIST.some(match => ingredient.includes(match))
        );
    }

    _createCollectableMethods() {
        const blockSources = mc.getItemBlockSources(this.name);
        if (blockSources.length === 0 || this.name === 'torch' || this.name.includes('bed')) return;

        blockSources.forEach(blockSource => {
            if (blockSource === 'grass_block') return;
            const tool = mc.getBlockTool(blockSource);
            this.add_method(new ItemNode(this.manager, this, this.name).setCollectable(blockSource, tool));
        });
    }

    _createSmeltingMethods() {
        const smeltingIngredient = mc.getItemSmeltingIngredient(this.name);
        if (smeltingIngredient) {
            this.add_method(new ItemNode(this.manager, this, this.name).setSmeltable(smeltingIngredient));
        }
    }

    _createHuntingMethods() {
        const animalSource = mc.getItemAnimalSource(this.name);
        if (animalSource) {
            this.add_method(new ItemNode(this.manager, this, this.name).setHuntable(animalSource));
        }
    }

    containsCircularDependency() {
        let parent = this.parent;
        while (parent) {
            if (parent.name === this.name) return true;
            parent = parent.parent;
        }
        return false;
    }

    getBestMethod(quantity = 1) {
        return this.methods.reduce((best, method) => {
            const cost = method.getDepth(quantity) + method.getFails(quantity);
            return (!best || cost < best.cost) ? { method, cost } : best;
        }, null)?.method;
    }

    isDone(quantity = 1) {
        return this.methods.length > 0 && this.getBestMethod(quantity).isDone(quantity);
    }

    getDepth(quantity = 1) {
        return this.methods.length > 0 ? this.getBestMethod(quantity).getDepth(quantity) : 0;
    }

    getFails(quantity = 1) {
        return this.methods.length > 0 ? this.getBestMethod(quantity).getFails(quantity) : 0;
    }

    getNext(quantity = 1) {
        return this.methods.length > 0 ? this.getBestMethod(quantity).getNext(quantity) : null;
    }
}

export class ItemGoal {
    constructor(agent) {
        this.agent = agent;
        this.goal = null;
        this.nodes = {};
        this.failed = [];
    }

    async executeNext(itemName, itemQuantity = 1) {
        if (!this.nodes[itemName]) {
            this.nodes[itemName] = new ItemWrapper(this, null, itemName);
        }
        this.goal = this.nodes[itemName];

        const nextInfo = this.goal.getNext(itemQuantity);
        if (!nextInfo) {
            console.log(`Invalid item goal ${this.goal.name}`);
            return false;
        }

        if (!this._isExecutionViable(nextInfo.node)) {
            return await this._handleUnviableExecution(nextInfo.node);
        }

        if (!this.agent.isIdle()) return false;

        return await this._executeGoal(nextInfo.node, nextInfo.quantity);
    }

    _isExecutionViable(next) {
        return !(
            (next.type === 'block' && !world.getNearbyBlockTypes(this.agent.bot).includes(next.source)) ||
            (next.type === 'hunt' && !world.getNearbyEntityTypes(this.agent.bot).includes(next.source))
        );
    }

    async _handleUnviableExecution(next) {
        next.fails++;

        if (this.failed.includes(next.name)) {
            this.failed = this.failed.filter(item => item !== next.name);
            await this.agent.actions.runAction('itemGoal:explore', async () => {
                await skills.moveAway(this.agent.bot, 8);
            });
        } else {
            this.failed.push(next.name);
            await new Promise(resolve => setTimeout(resolve, 500));
            this.agent.bot.emit('idle');
        }
        return false;
    }

    async _executeGoal(next, quantity) {
        const initQuantity = world.getInventoryCounts(this.agent.bot)[next.name] || 0;
        
        await this.agent.actions.runAction('itemGoal:next', async () => {
            await next.execute(quantity);
        });
        
        const finalQuantity = world.getInventoryCounts(this.agent.bot)[next.name] || 0;
        const success = finalQuantity > initQuantity;
        
        console.log(`${success ? 'Successfully obtained' : 'Failed to obtain'} ${next.name} for goal ${this.goal.name}`);
        
        return success;
    }
}
