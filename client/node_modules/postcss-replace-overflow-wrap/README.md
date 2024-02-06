# PostCSS Replace Overflow Wrap [![CSS Standard Status][css-img]][css] [![Build Status][ci-img]][ci]

[PostCSS] plugin to replace overflow-wrap with word-wrap. May optionally retain both declarations.

[PostCSS]: https://github.com/postcss/postcss
[css-img]: https://jonathantneal.github.io/css-db/badge/css-text-overflow-wrap-property.svg
[css]:     https://jonathantneal.github.io/css-db/#css-text-overflow-wrap-property
[ci-img]:  https://travis-ci.org/MattDiMu/postcss-replace-overflow-wrap.svg
[ci]:      https://travis-ci.org/MattDiMu/postcss-replace-overflow-wrap


```css
/* before */
.foo {
    overflow-wrap: break-word;
}

/* after */
.foo {
    word-wrap: break-word;
}
```

```css
/* before, when the option { method: 'copy' } is passed */
.foo {
    overflow-wrap: break-word;
}

/* after */
.foo {
    word-wrap: break-word;
    overflow-wrap: break-word;
}
```

### Installation
`npm install --save-dev postcss postcss-replace-overflow-wrap`

For Postcss 7 or earlier use Version 3 or earlier:

`npm install --save-dev postcss-replace-overflow-wrap@3`


## Usage

```js
/* default usage, with no options (method = replace) */
postcss([ require('postcss-replace-overflow-wrap') ])
```

```js
/* add word-wrap, but keep overflow-wrap */
postcss([ require('postcss-replace-overflow-wrap') ])({ method: 'copy' })
```
See [PostCSS] docs for examples for your environment.
