import { Subject } from './utils/createSubject';
type Props<T> = {
    disabled?: boolean;
    subject: Subject<T>;
    next: (value: T) => void;
};
export declare function useSubscribe<T>(props: Props<T>): void;
export {};
//# sourceMappingURL=useSubscribe.d.ts.map