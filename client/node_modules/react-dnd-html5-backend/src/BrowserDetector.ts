import { memoize } from './utils/js_utils.js'

declare global {
	interface Window extends HTMLElement {
		safari: any
	}
}

export type Predicate = () => boolean
export const isFirefox: Predicate = memoize(() =>
	/firefox/i.test(navigator.userAgent),
)
export const isSafari: Predicate = memoize(() => Boolean(window.safari))
