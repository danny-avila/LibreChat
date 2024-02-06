glur
====

[![Build Status](https://travis-ci.org/nodeca/glur.svg?branch=master)](https://travis-ci.org/nodeca/glur)
[![NPM version](https://img.shields.io/npm/v/glur.svg)](https://www.npmjs.org/package/glur)

> Fast Gaussian Blur in pure JavaScript, via IIR filer. Speed does not depend on
> blur radius.

__[demo 1](http://nodeca.github.io/glur/demo)__,
__[demo 2](http://nodeca.github.io/glur/demo/mono16.html)__.


Install
-------

```bash
npm install glur --save
```


API
---

`require('glur')(src, width, height, radius)`

- __src__ - typed array with image RGBA data (will be updated with blured image).
- __width__ - image width.
- __height__ - image height.
- __radius__ - blur radius.

`require('glur/mono16')(src, width, height, radius)` - the same as above, but
input data is grayscale Uint16Array. Can be useful to calculate unsharp mask via
brightness/ligthness channel.


Authors
-------

- Andrey Tupitsin [@anrd83](https://github.com/andr83)
- Alexander Rodin [@a-rodin](https://github.com/a-rodin)
- Vitaly Puzrin [@puzrin](https://github.com/puzrin)


References
----------

- [IIR Gaussian Blur Filter Implementation using Intel® Advanced Vector Extensions](https://software.intel.com/en-us/articles/iir-gaussian-blur-filter-implementation-using-intel-advanced-vector-extensions) -
  very good article with technical details for programmers.


Licence
-------

[MIT](https://github.com/nodeca/glur/blob/master/LICENSE)
