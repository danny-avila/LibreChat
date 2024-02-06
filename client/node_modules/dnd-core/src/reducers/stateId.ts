export type State = number

export function reduce(state: State = 0): State {
	return state + 1
}
