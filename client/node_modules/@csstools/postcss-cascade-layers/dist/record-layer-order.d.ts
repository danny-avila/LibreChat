import type { Container, Result } from 'postcss';
import type { Model } from './model';
import { pluginOptions } from './options';
export declare function recordLayerOrder(root: Container, model: Model, { result, options }: {
    result: Result;
    options: pluginOptions;
}): void;
