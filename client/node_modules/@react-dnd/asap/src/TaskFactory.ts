import { RawTask } from './RawTask.js'
import type { Task } from './types.js'

export class TaskFactory {
	private freeTasks: RawTask[] = []

	public constructor(private onError: (err: any) => void) {}

	public create(task: () => void): Task {
		const tasks = this.freeTasks
		const t = tasks.length
			? (tasks.pop() as RawTask)
			: new RawTask(this.onError, (t) => (tasks[tasks.length] = t))
		t.task = task
		return t
	}
}
