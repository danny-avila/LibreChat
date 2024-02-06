import type { Result, Root as PostCSSRoot } from 'postcss';
import type { Root as SelectorRoot } from 'postcss-selector-parser';
export default function getCustomSelectors(root: PostCSSRoot, result: Result, opts: {
    preserve?: boolean;
}): Map<string, SelectorRoot>;
