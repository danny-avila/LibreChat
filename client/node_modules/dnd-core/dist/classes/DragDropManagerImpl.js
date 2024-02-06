import { createDragDropActions } from '../actions/dragDrop/index.js';
export class DragDropManagerImpl {
    receiveBackend(backend) {
        this.backend = backend;
    }
    getMonitor() {
        return this.monitor;
    }
    getBackend() {
        return this.backend;
    }
    getRegistry() {
        return this.monitor.registry;
    }
    getActions() {
        /* eslint-disable-next-line @typescript-eslint/no-this-alias */ const manager = this;
        const { dispatch  } = this.store;
        function bindActionCreator(actionCreator) {
            return (...args)=>{
                const action = actionCreator.apply(manager, args);
                if (typeof action !== 'undefined') {
                    dispatch(action);
                }
            };
        }
        const actions = createDragDropActions(this);
        return Object.keys(actions).reduce((boundActions, key)=>{
            const action = actions[key];
            boundActions[key] = bindActionCreator(action);
            return boundActions;
        }, {});
    }
    dispatch(action) {
        this.store.dispatch(action);
    }
    constructor(store, monitor){
        this.isSetUp = false;
        this.handleRefCountChange = ()=>{
            const shouldSetUp = this.store.getState().refCount > 0;
            if (this.backend) {
                if (shouldSetUp && !this.isSetUp) {
                    this.backend.setup();
                    this.isSetUp = true;
                } else if (!shouldSetUp && this.isSetUp) {
                    this.backend.teardown();
                    this.isSetUp = false;
                }
            }
        };
        this.store = store;
        this.monitor = monitor;
        store.subscribe(this.handleRefCountChange);
    }
}

//# sourceMappingURL=DragDropManagerImpl.js.map