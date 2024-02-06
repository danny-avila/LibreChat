import {type Options} from './filenamify.js';

/**
Convert the filename in a path a valid filename and return the augmented path.

@example
```
import {filenamifyPath} from 'filenamify';

filenamifyPath('foo:bar');
//=> 'foo!bar'
```
*/
export default function filenamifyPath(path: string, options?: Options): string;

export type {Options} from './filenamify.js';
