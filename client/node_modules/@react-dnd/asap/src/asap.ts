import { AsapQueue } from './AsapQueue.js'
import { TaskFactory } from './TaskFactory.js'
import type { TaskFn } from './types.js'

const asapQueue = new AsapQueue()
const taskFactory = new TaskFactory(asapQueue.registerPendingError)

/**
 * Calls a task as soon as possible after returning, in its own event, with priority
 * over other events like animation, reflow, and repaint. An error thrown from an
 * event will not interrupt, nor even substantially slow down the processing of
 * other events, but will be rather postponed to a lower priority event.
 * @param {{call}} task A callable object, typically a function that takes no
 * arguments.
 */
export function asap(task: TaskFn) {
	asapQueue.enqueueTask(taskFactory.create(task))
}
