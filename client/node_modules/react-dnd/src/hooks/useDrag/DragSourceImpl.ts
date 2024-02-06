import type { DragDropMonitor, DragSource, Identifier } from 'dnd-core'

import type { Connector } from '../../internals/index.js'
import type { DragSourceMonitor } from '../../types/index.js'
import type { DragObjectFactory, DragSourceHookSpec } from '../types.js'

export class DragSourceImpl<O, R, P> implements DragSource {
	public constructor(
		public spec: DragSourceHookSpec<O, R, P>,
		private monitor: DragSourceMonitor<O, R>,
		private connector: Connector,
	) {}

	public beginDrag() {
		const spec = this.spec
		const monitor = this.monitor

		let result: O | null = null
		if (typeof spec.item === 'object') {
			result = spec.item as O
		} else if (typeof spec.item === 'function') {
			result = (spec.item as DragObjectFactory<O>)(monitor)
		} else {
			result = {} as O
		}
		return result ?? null
	}

	public canDrag() {
		const spec = this.spec
		const monitor = this.monitor
		if (typeof spec.canDrag === 'boolean') {
			return spec.canDrag
		} else if (typeof spec.canDrag === 'function') {
			return spec.canDrag(monitor)
		} else {
			return true
		}
	}

	public isDragging(globalMonitor: DragDropMonitor, target: Identifier) {
		const spec = this.spec
		const monitor = this.monitor
		const { isDragging } = spec
		return isDragging
			? isDragging(monitor)
			: target === globalMonitor.getSourceId()
	}

	public endDrag() {
		const spec = this.spec
		const monitor = this.monitor
		const connector = this.connector
		const { end } = spec
		if (end) {
			end(monitor.getItem(), monitor)
		}
		connector.reconnect()
	}
}
