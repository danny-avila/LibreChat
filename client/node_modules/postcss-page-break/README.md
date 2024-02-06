# postcss-page-break 

[![NPM Package][npm-img]][npm]
[![Build Status][ci-img]][ci]
[![License: MIT][mit-img]][mit]

[PostCSS] plugin to fallback `break-` properties with `page-break-` alias.

[!['Can I use' table](https://caniuse.bitsofco.de/image/multicolumn.png)](https://caniuse.com/#feat=multicolumn)

[PostCSS]: https://github.com/postcss/postcss
[npm-img]: https://img.shields.io/npm/v/postcss-page-break.svg
[npm]:     https://www.npmjs.org/package/postcss-page-break
[ci-img]:  https://travis-ci.org/shrpne/postcss-page-break.svg
[ci]:      https://travis-ci.org/shrpne/postcss-page-break
[mit-img]: https://img.shields.io/badge/License-MIT-yellow.svg
[mit]:     https://github.com/shrpne/postcss-page-break/blob/master/LICENSE

```css
/* before */
.foo {
  break-inside: avoid;
  break-after: page;
}

/* after */
.foo {
  page-break-inside: avoid;
  break-inside: avoid;
  page-break-after: always;
  break-after: page;
}
```

Available fallbacks:
```
break-inside: auto        =>  page-break-inside: auto
break-inside: avoid       =>  page-break-inside: avoid
break-inside: avoid-page  =>  page-break-inside: avoid
break-inside: inherit     =>  page-break-inside: inherit
break-inside: initial     =>  page-break-inside: initial
break-inside: unset       =>  page-break-inside: unset

break-before: auto        =>  page-break-before: auto;
break-before: avoid       =>  page-break-before: avoid;
break-before: avoid-page  =>  page-break-before: avoid;
break-before: page        =>  page-break-before: always;
break-before: always      =>  page-break-before: always;
break-before: left        =>  page-break-before: left;
break-before: right       =>  page-break-before: right;
break-before: recto       =>  page-break-before: recto;
break-before: verso       =>  page-break-before: verso;
break-before: inherit     =>  page-break-before: inherit;
break-before: initial     =>  page-break-before: initial;
break-before: unset       =>  page-break-before: unset;

break-after: auto         =>  page-break-after: auto;
break-after: avoid        =>  page-break-after: avoid;
break-after: avoid-page   =>  page-break-after: avoid;
break-after: page         =>  page-break-after: always;
break-after: always       =>  page-break-after: always;
break-after: left         =>  page-break-after: left;
break-after: right        =>  page-break-after: right;
break-after: recto        =>  page-break-after: recto;
break-after: verso        =>  page-break-after: verso;
break-after: inherit      =>  page-break-after: inherit;
break-after: initial      =>  page-break-after: initial;
break-after: unset        =>  page-break-after: unset;
```

## Installation
```bash
npm install --save-dev postcss postcss-page-break
```


## Usage

```js
postcss([ require('postcss-page-break') ])
```

See [PostCSS] docs for examples for your environment (webpack, gulp, grunt).
