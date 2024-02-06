export interface Task {
	call(): void
}
export type TaskFn = () => void
