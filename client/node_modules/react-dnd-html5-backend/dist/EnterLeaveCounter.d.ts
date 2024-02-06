declare type NodePredicate = (node: Node | null | undefined) => boolean;
export declare class EnterLeaveCounter {
    private entered;
    private isNodeInDocument;
    constructor(isNodeInDocument: NodePredicate);
    enter(enteringNode: EventTarget | null): boolean;
    leave(leavingNode: EventTarget | null): boolean;
    reset(): void;
}
export {};
