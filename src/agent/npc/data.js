class Goal {
    constructor(name, quantity = 1) {
        this.name = name;
        this.quantity = quantity;
    }

    static fromObject(obj) {
        if (typeof obj === 'string') {
            return new Goal(obj);
        }
        return new Goal(obj.name, obj.quantity);
    }

    toObject() {
        return {
            name: this.name,
            quantity: this.quantity
        };
    }
}

export class NPCData {
    constructor() {
        this.goals = [];
        this.curr_goal = null;
        this.built = {};
        this.home = null;
        this.do_routine = false;
        this.do_set_goal = false;
    }

    addGoal(goal) {
        const newGoal = goal instanceof Goal ? goal : Goal.fromObject(goal);
        this.goals.push(newGoal);
    }

    setCurrentGoal(goal) {
        this.curr_goal = goal instanceof Goal ? goal : Goal.fromObject(goal);
    }

    setHome(location) {
        this.home = location;
    }

    toggleRoutine(value) {
        this.do_routine = Boolean(value);
    }

    toggleSetGoal(value) {
        this.do_set_goal = Boolean(value);
    }

    addBuilt(key, value) {
        this.built[key] = value;
    }

    toObject() {
        const obj = {
            do_routine: this.do_routine,
            do_set_goal: this.do_set_goal
        };

        if (this.goals.length > 0) {
            obj.goals = this.goals.map(goal => goal.toObject());
        }

        if (this.curr_goal) {
            obj.curr_goal = this.curr_goal instanceof Goal 
                ? this.curr_goal.toObject() 
                : Goal.fromObject(this.curr_goal).toObject();
        }

        if (Object.keys(this.built).length > 0) {
            obj.built = { ...this.built };
        }

        if (this.home) {
            obj.home = this.home;
        }

        return obj;
    }

    static fromObject(obj) {
        const npc = new NPCData();
        
        if (!obj) return npc;

        if (Array.isArray(obj.goals)) {
            npc.goals = obj.goals.map(goal => Goal.fromObject(goal));
        }

        if (obj.curr_goal) {
            npc.curr_goal = Goal.fromObject(obj.curr_goal);
        }

        if (obj.built) {
            npc.built = { ...obj.built };
        }

        if (obj.home) {
            npc.home = obj.home;
        }

        npc.do_routine = Boolean(obj.do_routine);
        npc.do_set_goal = Boolean(obj.do_set_goal);

        return npc;
    }
}
