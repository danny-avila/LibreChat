/** As `React.useEffect` but pass origin value in callback and not need care deps length change. */
export default function useEffect(callback: (prevDeps: any[]) => void, deps: any[]): void;
