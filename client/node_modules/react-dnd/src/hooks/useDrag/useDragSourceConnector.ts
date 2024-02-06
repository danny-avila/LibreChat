import { useMemo } from 'react'

import { SourceConnector } from '../../internals/index.js'
import type {
	DragPreviewOptions,
	DragSourceOptions,
} from '../../types/index.js'
import { useDragDropManager } from '../useDragDropManager.js'
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.js'

export function useDragSourceConnector(
	dragSourceOptions: DragSourceOptions | undefined,
	dragPreviewOptions: DragPreviewOptions | undefined,
): SourceConnector {
	const manager = useDragDropManager()
	const connector = useMemo(
		() => new SourceConnector(manager.getBackend()),
		[manager],
	)
	useIsomorphicLayoutEffect(() => {
		connector.dragSourceOptions = dragSourceOptions || null
		connector.reconnect()
		return () => connector.disconnectDragSource()
	}, [connector, dragSourceOptions])
	useIsomorphicLayoutEffect(() => {
		connector.dragPreviewOptions = dragPreviewOptions || null
		connector.reconnect()
		return () => connector.disconnectDragPreview()
	}, [connector, dragPreviewOptions])
	return connector
}
