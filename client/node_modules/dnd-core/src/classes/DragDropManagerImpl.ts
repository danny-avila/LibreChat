import type { Action, Store } from 'redux'

import { createDragDropActions } from '../actions/dragDrop/index.js'
import type {
	ActionCreator,
	Backend,
	DragDropActions,
	DragDropManager,
	DragDropMonitor,
	HandlerRegistry,
} from '../interfaces.js'
import type { State } from '../reducers/index.js'
import type { DragDropMonitorImpl } from './DragDropMonitorImpl.js'

export class DragDropManagerImpl implements DragDropManager {
	private store: Store<State>
	private monitor: DragDropMonitor
	private backend: Backend | undefined
	private isSetUp = false

	public constructor(store: Store<State>, monitor: DragDropMonitor) {
		this.store = store
		this.monitor = monitor
		store.subscribe(this.handleRefCountChange)
	}

	public receiveBackend(backend: Backend): void {
		this.backend = backend
	}

	public getMonitor(): DragDropMonitor {
		return this.monitor
	}

	public getBackend(): Backend {
		return this.backend as Backend
	}

	public getRegistry(): HandlerRegistry {
		return (this.monitor as DragDropMonitorImpl).registry
	}

	public getActions(): DragDropActions {
		/* eslint-disable-next-line @typescript-eslint/no-this-alias */
		const manager = this
		const { dispatch } = this.store

		function bindActionCreator(actionCreator: ActionCreator<any>) {
			return (...args: any[]) => {
				const action = actionCreator.apply(manager, args as any)
				if (typeof action !== 'undefined') {
					dispatch(action)
				}
			}
		}

		const actions = createDragDropActions(this)

		return Object.keys(actions).reduce(
			(boundActions: DragDropActions, key: string) => {
				const action: ActionCreator<any> = (actions as any)[
					key
				] as ActionCreator<any>
				;(boundActions as any)[key] = bindActionCreator(action)
				return boundActions
			},
			{} as DragDropActions,
		)
	}

	public dispatch(action: Action<any>): void {
		this.store.dispatch(action)
	}

	private handleRefCountChange = (): void => {
		const shouldSetUp = this.store.getState().refCount > 0
		if (this.backend) {
			if (shouldSetUp && !this.isSetUp) {
				this.backend.setup()
				this.isSetUp = true
			} else if (!shouldSetUp && this.isSetUp) {
				this.backend.teardown()
				this.isSetUp = false
			}
		}
	}
}
