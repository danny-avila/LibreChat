// Safari 6 and 6.1 for desktop, iPad, and iPhone are the only browsers that
// have WebKitMutationObserver but not un-prefixed MutationObserver.
// Must use `global` or `self` instead of `window` to work in both frames and web
// workers. `global` is a provision of Browserify, Mr, Mrs, or Mop.

/* globals self */
const scope = typeof global !== 'undefined' ? global : self
const BrowserMutationObserver =
	(scope as any).MutationObserver || (scope as any).WebKitMutationObserver

export function makeRequestCallFromTimer(callback: () => void) {
	return function requestCall() {
		// We dispatch a timeout with a specified delay of 0 for engines that
		// can reliably accommodate that request. This will usually be snapped
		// to a 4 milisecond delay, but once we're flushing, there's no delay
		// between events.
		const timeoutHandle = setTimeout(handleTimer, 0)
		// However, since this timer gets frequently dropped in Firefox
		// workers, we enlist an interval handle that will try to fire
		// an event 20 times per second until it succeeds.
		const intervalHandle = setInterval(handleTimer, 50)

		function handleTimer() {
			// Whichever timer succeeds will cancel both timers and
			// execute the callback.
			clearTimeout(timeoutHandle)
			clearInterval(intervalHandle)
			callback()
		}
	}
}

// To request a high priority event, we induce a mutation observer by toggling
// the text of a text node between "1" and "-1".
export function makeRequestCallFromMutationObserver(callback: () => void) {
	let toggle = 1
	const observer = new BrowserMutationObserver(callback)
	const node = document.createTextNode('')
	observer.observe(node, { characterData: true })
	return function requestCall() {
		toggle = -toggle
		;(node as any).data = toggle
	}
}

export const makeRequestCall =
	typeof BrowserMutationObserver === 'function'
		? // MutationObservers are desirable because they have high priority and work
		  // reliably everywhere they are implemented.
		  // They are implemented in all modern browsers.
		  //
		  // - Android 4-4.3
		  // - Chrome 26-34
		  // - Firefox 14-29
		  // - Internet Explorer 11
		  // - iPad Safari 6-7.1
		  // - iPhone Safari 7-7.1
		  // - Safari 6-7
		  makeRequestCallFromMutationObserver
		: // MessageChannels are desirable because they give direct access to the HTML
		  // task queue, are implemented in Internet Explorer 10, Safari 5.0-1, and Opera
		  // 11-12, and in web workers in many engines.
		  // Although message channels yield to any queued rendering and IO tasks, they
		  // would be better than imposing the 4ms delay of timers.
		  // However, they do not work reliably in Internet Explorer or Safari.

		  // Internet Explorer 10 is the only browser that has setImmediate but does
		  // not have MutationObservers.
		  // Although setImmediate yields to the browser's renderer, it would be
		  // preferrable to falling back to setTimeout since it does not have
		  // the minimum 4ms penalty.
		  // Unfortunately there appears to be a bug in Internet Explorer 10 Mobile (and
		  // Desktop to a lesser extent) that renders both setImmediate and
		  // MessageChannel useless for the purposes of ASAP.
		  // https://github.com/kriskowal/q/issues/396

		  // Timers are implemented universally.
		  // We fall back to timers in workers in most engines, and in foreground
		  // contexts in the following browsers.
		  // However, note that even this simple case requires nuances to operate in a
		  // broad spectrum of browsers.
		  //
		  // - Firefox 3-13
		  // - Internet Explorer 6-9
		  // - iPad Safari 4.3
		  // - Lynx 2.8.7
		  makeRequestCallFromTimer
