import type { DropTarget } from 'dnd-core'

import type { DropTargetMonitor } from '../../types/index.js'
import type { DropTargetHookSpec } from '../types.js'

export class DropTargetImpl<O, R, P> implements DropTarget {
	public constructor(
		public spec: DropTargetHookSpec<O, R, P>,
		private monitor: DropTargetMonitor<O, R>,
	) {}

	public canDrop() {
		const spec = this.spec
		const monitor = this.monitor
		return spec.canDrop ? spec.canDrop(monitor.getItem(), monitor) : true
	}

	public hover() {
		const spec = this.spec
		const monitor = this.monitor
		if (spec.hover) {
			spec.hover(monitor.getItem(), monitor)
		}
	}

	public drop() {
		const spec = this.spec
		const monitor = this.monitor
		if (spec.drop) {
			return spec.drop(monitor.getItem(), monitor)
		}
		return
	}
}
