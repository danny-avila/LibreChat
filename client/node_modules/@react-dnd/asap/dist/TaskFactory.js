import { RawTask } from './RawTask.js';
export class TaskFactory {
    create(task) {
        const tasks = this.freeTasks;
        const t1 = tasks.length ? tasks.pop() : new RawTask(this.onError, (t)=>tasks[tasks.length] = t
        );
        t1.task = task;
        return t1;
    }
    constructor(onError){
        this.onError = onError;
        this.freeTasks = [];
    }
}

//# sourceMappingURL=TaskFactory.js.map