import type { Container, Result } from 'postcss';
export type walkFunc = (node: Container, result: Result, opts: {
    noIsPseudoSelector: boolean;
}) => void;
