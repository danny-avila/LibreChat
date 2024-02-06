multimath
=========

[![Build Status](https://travis-ci.org/nodeca/multimath.svg?branch=master)](https://travis-ci.org/nodeca/multimath)
[![NPM version](https://img.shields.io/npm/v/multimath.svg)](https://www.npmjs.org/package/multimath)

> Core to create fast image math in WebAssembly and JS.

`multimath` simplifies creation of small CPU-intensive webassembly modules
with fallback to JavaScript implementations.

- It cares about modules init, memory management and other things.
- Has built-in helpers to write webassembly code without additional runtimes.
- Use shared memory to chain webassembly calls without memory copy.

Built-in functions (curently - unsharp mask) are available as examples for your
extensions.


Install
-------

```bash
npm install multimath
```


Use
---

```js
const mm = require('multimath')()
             .use(require('multimath/lib/unsharp_mask'))
             .use(require('your_custom_module'))

// Simple sync call. Will use sync wasm compile. Ok for webworkers.
// Can freeze interface at first call if wasm source is too big.
mm.unsharp_mask(rgba_buffer, width, height);

// Async init, compile all modules at once in async way.
mm.init().then(() => {
  mm.unsharp_mask(rgba_buffer, width, height);
});
```


API
---


### new multimath(options)

Create library instance. Sugar - `multimath()` (without `new`).

```js
const mm = require('multimath')({
  // Options are not mandatory, but you can disable js or ww
  // implementations for testing
  js:   true,
  wasm: true
});
```


### .use(module)

Register new module, format is:

```js
{
  name:     String,    // default wasm module & function name to expose
  fn:       Function,  // JS implementation
  wasm_fn:  Function,  // WebAssembly glue
  wasm_src: String     // Base64 encoded WebAssembly module
}
```

See example implementation in `lib/` folder.


### .init() -> Promise

Optional. Compile all wasm modules in async way. May be useful in this cases:

1. If you have wasm module > 4K AND run multimath in the main thread (not in
   webworker). Some browsers prohibit sync wasm creation in this case.
2. If you have a lot of small modules and wish to init everything before run
   in the main thread, withoutinterface freeze.

Probably, you will never need to use this method. Note, 3K was file is
initialized in ~ 3ms.


### .<your_method>

All modules, loaded via `.use()`, pin their methods to current `Multimath`
instance. The best implementation will be selected automatically (depends on
browser features and constructor options);


### Development

Ways to go with your own modules:

- Use `./support/llvmasm_install.sh` to install llvm/binaryen tools. Or use it
  as base for your own.
- See `Makefile`
- See `./lib/unsharp_mask` as example and... of cause `./index.js`.

Also, see how [pica](https://github.com/nodeca/pica)
use this library.


Licence
-------

[MIT](https://github.com/nodeca/multimath/blob/master/LICENSE)
