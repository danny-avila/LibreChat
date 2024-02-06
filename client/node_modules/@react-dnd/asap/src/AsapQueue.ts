/* eslint-disable no-restricted-globals, @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars, @typescript-eslint/no-non-null-assertion */
import { makeRequestCall, makeRequestCallFromTimer } from './makeRequestCall.js'
import type { Task } from './types.js'

export class AsapQueue {
	private queue: Task[] = []
	// We queue errors to ensure they are thrown in right order (FIFO).
	// Array-as-queue is good enough here, since we are just dealing with exceptions.
	private pendingErrors: any[] = []
	// Once a flush has been requested, no further calls to `requestFlush` are
	// necessary until the next `flush` completes.
	// @ts-ignore
	private flushing = false
	// `requestFlush` is an implementation-specific method that attempts to kick
	// off a `flush` event as quickly as possible. `flush` will attempt to exhaust
	// the event queue before yielding to the browser's own event loop.
	private requestFlush: () => void

	private requestErrorThrow: () => void
	// The position of the next task to execute in the task queue. This is
	// preserved between calls to `flush` so that it can be resumed if
	// a task throws an exception.
	private index = 0
	// If a task schedules additional tasks recursively, the task queue can grow
	// unbounded. To prevent memory exhaustion, the task queue will periodically
	// truncate already-completed tasks.
	private capacity = 1024

	public constructor() {
		// `requestFlush` requests that the high priority event queue be flushed as
		// soon as possible.
		// This is useful to prevent an error thrown in a task from stalling the event
		// queue if the exception handled by Node.js’s
		// `process.on("uncaughtException")` or by a domain.

		// `requestFlush` is implemented using a strategy based on data collected from
		// every available SauceLabs Selenium web driver worker at time of writing.
		// https://docs.google.com/spreadsheets/d/1mG-5UYGup5qxGdEMWkhP6BWCz053NUb2E1QoUTU16uA/edit#gid=783724593
		this.requestFlush = makeRequestCall(this.flush)
		this.requestErrorThrow = makeRequestCallFromTimer(() => {
			// Throw first error
			if (this.pendingErrors.length) {
				throw this.pendingErrors.shift()
			}
		})
	}

	// Use the fastest means possible to execute a task in its own turn, with
	// priority over other events including IO, animation, reflow, and redraw
	// events in browsers.
	//
	// An exception thrown by a task will permanently interrupt the processing of
	// subsequent tasks. The higher level `asap` function ensures that if an
	// exception is thrown by a task, that the task queue will continue flushing as
	// soon as possible, but if you use `rawAsap` directly, you are responsible to
	// either ensure that no exceptions are thrown from your task, or to manually
	// call `rawAsap.requestFlush` if an exception is thrown.
	public enqueueTask(task: Task): void {
		const { queue: q, requestFlush } = this
		if (!q.length) {
			requestFlush()
			this.flushing = true
		}
		// Equivalent to push, but avoids a function call.
		q[q.length] = task
	}

	// The flush function processes all tasks that have been scheduled with
	// `rawAsap` unless and until one of those tasks throws an exception.
	// If a task throws an exception, `flush` ensures that its state will remain
	// consistent and will resume where it left off when called again.
	// However, `flush` does not make any arrangements to be called again if an
	// exception is thrown.
	private flush = () => {
		const { queue: q } = this
		while (this.index < q.length) {
			const currentIndex = this.index
			// Advance the index before calling the task. This ensures that we will
			// begin flushing on the next task the task throws an error.
			this.index++
			q[currentIndex]!.call()
			// Prevent leaking memory for long chains of recursive calls to `asap`.
			// If we call `asap` within tasks scheduled by `asap`, the queue will
			// grow, but to avoid an O(n) walk for every task we execute, we don't
			// shift tasks off the queue after they have been executed.
			// Instead, we periodically shift 1024 tasks off the queue.
			if (this.index > this.capacity) {
				// Manually shift all values starting at the index back to the
				// beginning of the queue.
				for (
					let scan = 0, newLength = q.length - this.index;
					scan < newLength;
					scan++
				) {
					q[scan] = q[scan + this.index]!
				}
				q.length -= this.index
				this.index = 0
			}
		}
		q.length = 0
		this.index = 0
		this.flushing = false
	}

	// In a web browser, exceptions are not fatal. However, to avoid
	// slowing down the queue of pending tasks, we rethrow the error in a
	// lower priority turn.
	public registerPendingError = (err: any) => {
		this.pendingErrors.push(err)
		this.requestErrorThrow()
	}
}

// The message channel technique was discovered by Malte Ubl and was the
// original foundation for this library.
// http://www.nonblocking.io/2011/06/windownexttick.html

// Safari 6.0.5 (at least) intermittently fails to create message ports on a
// page's first load. Thankfully, this version of Safari supports
// MutationObservers, so we don't need to fall back in that case.

// function makeRequestCallFromMessageChannel(callback) {
//     var channel = new MessageChannel();
//     channel.port1.onmessage = callback;
//     return function requestCall() {
//         channel.port2.postMessage(0);
//     };
// }

// For reasons explained above, we are also unable to use `setImmediate`
// under any circumstances.
// Even if we were, there is another bug in Internet Explorer 10.
// It is not sufficient to assign `setImmediate` to `requestFlush` because
// `setImmediate` must be called *by name* and therefore must be wrapped in a
// closure.
// Never forget.

// function makeRequestCallFromSetImmediate(callback) {
//     return function requestCall() {
//         setImmediate(callback);
//     };
// }

// Safari 6.0 has a problem where timers will get lost while the user is
// scrolling. This problem does not impact ASAP because Safari 6.0 supports
// mutation observers, so that implementation is used instead.
// However, if we ever elect to use timers in Safari, the prevalent work-around
// is to add a scroll event listener that calls for a flush.

// `setTimeout` does not call the passed callback if the delay is less than
// approximately 7 in web workers in Firefox 8 through 18, and sometimes not
// even then.

// This is for `asap.js` only.
// Its name will be periodically randomized to break any code that depends on
// // its existence.
// rawAsap.makeRequestCallFromTimer = makeRequestCallFromTimer

// ASAP was originally a nextTick shim included in Q. This was factored out
// into this ASAP package. It was later adapted to RSVP which made further
// amendments. These decisions, particularly to marginalize MessageChannel and
// to capture the MutationObserver implementation in a closure, were integrated
// back into ASAP proper.
// https://github.com/tildeio/rsvp.js/blob/cddf7232546a9cf858524b75cde6f9edf72620a7/lib/rsvp/asap.js
