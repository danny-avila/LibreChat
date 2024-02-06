# filenamify

> Convert a string to a valid safe filename

On Unix-like systems, `/` is reserved. On Windows, [`<>:"/\|?*`](http://msdn.microsoft.com/en-us/library/aa365247%28VS.85%29#naming_conventions) along with trailing periods are reserved.

## Install

```sh
npm install filenamify
```

## Usage

```js
import filenamify from 'filenamify';

filenamify('<foo/bar>');
//=> '!foo!bar!'

filenamify('foo:"bar"', {replacement: '🐴'});
//=> 'foo🐴bar🐴'
```

## API

### filenamify(string, options?)

Convert a string to a valid filename.

### filenamifyPath(path, options?)

Convert the filename in a path a valid filename and return the augmented path.

```js
import {filenamifyPath} from 'filenamify';

filenamifyPath('foo:bar');
//=> 'foo!bar'
```

#### options

Type: `object`

##### replacement

Type: `string`\
Default: `'!'`

String to use as replacement for reserved filename characters.

Cannot contain: `<` `>` `:` `"` `/` `\` `|` `?` `*`

##### maxLength

Type: `number`\
Default: `100`

Truncate the filename to the given length.

Only the base of the filename is truncated, preserving the extension. If the extension itself is longer than `maxLength`, you will get a string that is longer than `maxLength`, so you need to check for that if you allow arbitrary extensions.

Systems generally allow up to 255 characters, but we default to 100 for usability reasons.

## Browser-only import

You can also import `filenamify/browser`, which only imports `filenamify` and not `filenamifyPath`, which relies on `path` being available or polyfilled. Importing `filenamify` this way is therefore useful when it is shipped using `webpack` or similar tools, and if `filenamifyPath` is not needed.

```js
import filenamify from 'filenamify/browser';

filenamify('<foo/bar>');
//=> '!foo!bar!'
```

## Related

- [filenamify-cli](https://github.com/sindresorhus/filenamify-cli) - CLI for this module
- [filenamify-url](https://github.com/sindresorhus/filenamify-url) - Convert a URL to a valid filename
- [valid-filename](https://github.com/sindresorhus/valid-filename) - Check if a string is a valid filename
- [unused-filename](https://github.com/sindresorhus/unused-filename) - Get a unused filename by appending a number if it exists
- [slugify](https://github.com/sindresorhus/slugify) - Slugify a string
