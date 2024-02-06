import type { Action, Store } from 'redux';
import type { Backend, DragDropActions, DragDropManager, DragDropMonitor, HandlerRegistry } from '../interfaces.js';
import type { State } from '../reducers/index.js';
export declare class DragDropManagerImpl implements DragDropManager {
    private store;
    private monitor;
    private backend;
    private isSetUp;
    constructor(store: Store<State>, monitor: DragDropMonitor);
    receiveBackend(backend: Backend): void;
    getMonitor(): DragDropMonitor;
    getBackend(): Backend;
    getRegistry(): HandlerRegistry;
    getActions(): DragDropActions;
    dispatch(action: Action<any>): void;
    private handleRefCountChange;
}
