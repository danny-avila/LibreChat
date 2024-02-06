/**
 *
 * @param monitor The monitor to collect state from
 * @param collect The collecting function
 * @param onUpdate A method to invoke when updates occur
 */
export declare function useCollector<T, S>(monitor: T, collect: (monitor: T) => S, onUpdate?: () => void): [S, () => void];
