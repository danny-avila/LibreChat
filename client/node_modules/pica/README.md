pica - high quality image resize in browser
===========================================

[![CI](https://github.com/nodeca/pica/actions/workflows/ci.yml/badge.svg)](https://github.com/nodeca/pica/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/pica.svg)](https://www.npmjs.org/package/pica)

> Resize images in browser without pixelation and reasonably fast.
> Autoselect the best of available technologies: webworkers,
> webassembly, createImageBitmap, pure JS.

[__demo__](http://nodeca.github.io/pica/demo/)


With pica you can:

- Reduce upload size for large images, saving upload time.
- Saves server resources on image processing.
- Generate thumbnails in browser.
- ...

**Note. If you need File/Blob resize (from form's file input), consider use
[image-blob-reduce](https://github.com/nodeca/image-blob-reduce).** It has
additional machinery to process orientation, keep EXIF metadata and so on.


Migration from pica v6 to pica v7
---------------------------------

Multiply `unsharpAmount` by 2, divide `unsharpThreshold` by 2, example:

 - `pica@6`: `pica.resize(a, b, { unsharpAmount: 80, unsharpThreshold: 2 })`
 - `pica@7`: `pica.resize(a, b, { unsharpAmount: 160, unsharpThreshold: 1 })`


Prior to use
------------

Here is a short list of problems you can face:

- Loading image:
  - Due to JS security restrictions, you can process images
    from the same domain or local files only. If you load images from
    remote domain use proper `Access-Control-Allow-Origin` header.
  - iOS has a memory limits for canvas elements, that may cause
    problems in some cases, [more details](https://github.com/nodeca/pica/wiki/iOS-Memory-Limit).
  - If your source data is jpeg image, it can be rotated. Consider use
    [image-blob-reduce](https://github.com/nodeca/image-blob-reduce).
- Saving image:
  - Some ancient browsers do not support `canvas.toBlob()` method.
    Use `pica.toBlob()`, it includes required shim.
  - For jpeg source, it's a good idea to keep `exif` data. Consider use
    [image-blob-reduce](https://github.com/nodeca/image-blob-reduce).
- Quality
  - JS canvas does not support access to info about gamma correction.
    Bitmaps have 8 bits per channel. That causes some quality loss,
    because with gamma correction precision could be 12 bits per
    channel.
  - Precision loss will not be noticeable for ordinary images like
    kittens, selfies and so on. But we don't recommend this library
    for resizing professional quality images.


Install
-------

```sh
npm install pica
```


Use
---

```js
const pica = require('pica')();

// Resize from Canvas/Image to another Canvas
pica.resize(from, to)
  .then(result => console.log('resize done!'));

// Resize & convert to blob
pica.resize(from, to)
  .then(result => pica.toBlob(result, 'image/jpeg', 0.90))
  .then(blob => console.log('resized to canvas & created blob!'));
```


API
---

### new Pica(config)

Create resizer instance with given config (optional):

- __tile__ - tile width/height. Images are processed by regions,
  to restrict peak memory use. Default 1024.
- __features__ - list of features to use. Default is
  `[ 'js', 'wasm', 'ww' ]`. Can be `[ 'js', 'wasm', 'cib', 'ww' ]`
  or `[ 'all' ]`. Note, `cib` is buggy in Chrome and not supports default
  `mks2013` filter.
- __idle__ - cache timeout, ms. Webworkers create is not fast.
  This option allow reuse webworkers effectively. Default 2000.
- __concurrency__ - max webworkers pool size. Default is autodetected
  CPU count, but not more than 4.
- __createCanvas__ - function which returns a new canvas, used internally
   by pica.
   Default returns a [\<canvas\> element](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API),
   but this function could return an [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
   instead (to run pica in a Service Worker). Function signature: createCanvas(width: number, height: number): Canvas


__Important!__ Latest browsers may support resize via [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap).
This feature is supported (`cib`) but disabled by default and not recommended
for use. So:

- `createImageBitmap()` is used for non-blocking image decode (when available,
  without downscale).
- It's resize feature is blocked by default pica config. Enable it only on your
  own risk. Result with enabled `cib` will depend on your browser. Result
  without `cib` will be predictable and good.


### .resize(from, to, options) -> Promise

Resize image from one canvas (or image) to another. Sizes are
taken from source and destination objects.

- __from__ - source, can be `Canvas`, `Image` or `ImageBitmap`.
- __to__ - destination canvas, its size is supposed to be non-zero.
- __options__ - quality (number) or object:
  - __quality__ (deprecated, use `.filter` instead) - 0..3.
  - __filter__ - filter name (Default - `mks2013`). See [resize_filter_info.js](https://github.com/nodeca/pica/blob/master/lib/mm_resize/resize_filter_info.js) for details. `mks2013` does both resize and sharpening, it's optimal and not recommended to change.
  - __unsharpAmount__ - >=0. Default = `0` (off). Usually
    value between 100 to 200 is good. Note, `mks2013` filter already does
    optimal sharpening.
  - __unsharpRadius__ - 0.5..2.0. By default it's not set. Radius of Gaussian
    blur. If it is less than 0.5, Unsharp Mask is off. Big values are clamped
    to 2.0.
  - __unsharpThreshold__ - 0..255. Default = `0`. Threshold for
    applying unsharp mask.
  - __cancelToken__ - Promise instance. If defined, current
    operation will be terminated on rejection.

Result is Promise, resolved with `to` on success.

__(!)__ If you need to process multiple images, do it
sequentially to optimize CPU & memory use. Pica already knows
how to use multiple cores (if browser allows).


### .toBlob(canvas, mimeType [, quality]) -> Promise

Convenience method, similar to `canvas.toBlob()`, but with
promise interface & polyfill for old browsers.


### .resizeBuffer(options) -> Promise

Supplementary method, not recommended for direct use. Resize
Uint8Array with raw RGBA bitmap (don't confuse with
jpeg / png  / ... binaries). It does not use tiles & webworkers.
Left for special cases when you really need to process raw
binary data (for example, if you decode jpeg files "manually").

- __options:__
  - __src__ - Uint8Array with source data.
  - __width__ - src image width.
  - __height__ - src image height.
  - __toWidth__ - output width, >=0, in pixels.
  - __toHeight__ - output height, >=0, in pixels.
  - __quality__ (deprecated, use `.filter` instead) - 0..3.
  - __filter__ - filter name (Default - `mks2013`). See [resize_filter_info.js](https://github.com/nodeca/pica/blob/master/lib/mm_resize/resize_filter_info.js) for details. `mks2013` does both resize and sharpening, it's optimal and not recommended to change.
  - __unsharpAmount__ - >=0. Default = `0` (off). Usually
    value between 100 to 200 is good. Note, `mks2013` filter already does
    optimal sharpening.
  - __unsharpRadius__ - 0.5..2.0. Radius of Gaussian blur.
    If it is less than 0.5, Unsharp Mask is off. Big values are
    clamped to 2.0.
  - __unsharpThreshold__ - 0..255. Default = `0`. Threshold
    for applying unsharp mask.
  - __dest__ - Optional. Output buffer to write data,
    if you don't wish `pica` to create new one.

Result is Promise, resolved with resized rgba buffer.


### What is "quality"

Pica has presets to adjust speed/quality ratio.
Simply use `quality` option param:

- 0 - Box filter, window 0.5px
- 1 - Hamming filter, window 1.0px
- 2 - Lanczos filter, window 2.0px
- 3 - Lanczos filter, window 3.0px

In real world you will never need to change default (max)
quality. All this variations were implemented to better
understand resize math :)


### Unsharp mask

After scale down image can look a bit blured. It's good idea to sharpen it
a bit. Pica has built-in "unsharp mask" filter (off by default).
Set `unsharpAmount` to positive number to activate the filter.

Filter's parameters are similar to ones from Photoshop.
We recommend to start with `unsharpAmount = 160`,
`unsharpRadius = 0.6` and `unsharpThreshold = 1`.
There is [a correspondence between UnsharpMask parameters
in popular graphics software](https://github.com/nodeca/pica/wiki/Unsharp-mask-params-in-popular-softare).


Browser support
----------------

We didn't have time to test all possible combinations, but in general:

- Top level API should work in all browsers,
  supporting [canvas](http://caniuse.com/#feat=canvas)
  and [typed arrays](http://caniuse.com/#feat=typedarrays).
- [Webworkers](http://caniuse.com/#feat=webworkers),
  [WebAssembly](http://webassembly.org/) and
  [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap)
  are not required, but they will be used if available.
- If you plan to use only pure math core,
  then [typed arrays support](http://caniuse.com/#feat=typedarrays) will be enough.

__Note.__ Though you can run this package on `node.js`, browsers
are the main target platform. On server side we recommend to use
[sharp](https://github.com/lovell/sharp).


References
----------

You can find these links useful:

- discussions on stackoverflow:
  [1](http://stackoverflow.com/questions/943781/),
  [2](http://stackoverflow.com/questions/18922880/),
  [3](http://stackoverflow.com/questions/2303690/).
- chromium skia sources:
  [image_operations.cc](http://src.chromium.org/svn/trunk/src/skia/ext/image_operations.cc),
  [convolver.cc](http://src.chromium.org/svn/trunk/src/skia/ext/convolver.cc).


pica for enterprise
-------------------

Available as part of the Tidelift Subscription.

The maintainers of pica and thousands of other packages are working with Tidelift to deliver commercial support and maintenance for the open source packages you use to build your applications. Save time, reduce risk, and improve code health, while paying the maintainers of the exact packages you use. [Learn more.](https://tidelift.com/subscription/pkg/npm-pica?utm_source=npm-pica&utm_medium=referral&utm_campaign=enterprise&utm_term=repo)
