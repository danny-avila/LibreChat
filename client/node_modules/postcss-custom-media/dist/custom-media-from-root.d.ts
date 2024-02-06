import { MediaQuery } from '@csstools/media-query-list-parser';
import type { Result, Root as PostCSSRoot } from 'postcss';
export default function getCustomMedia(root: PostCSSRoot, result: Result, opts: {
    preserve?: boolean;
}): Map<string, {
    truthy: Array<MediaQuery>;
    falsy: Array<MediaQuery>;
}>;
