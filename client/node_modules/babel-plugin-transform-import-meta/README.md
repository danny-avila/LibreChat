# babel-plugin-transform-import-meta

Transforms import.meta for nodejs environments. This plugin replaces any occurrence of `import.meta.url`.

```js
console.log(import.meta.url);
```

With this

```js
console.log(require('url').pathToFileURL(__filename).toString());
```

## Installation

Install this package

```javascript
npm install --save-dev babel-plugin-transform-import-meta
```

And configure it

```json
{
  "plugins": [
    "babel-plugin-transform-import-meta"
  ]
}
```

# Settings

## ES6 modules

It's possible to use ES6 modules for the output. Useful to delegate module transformation to other plugins.

```json
{
  "plugins": [
    ["babel-plugin-transform-import-meta", { "module": "ES6" }]
  ]
}
```

## Credits

Based on a previous project "babel-plugin-import-meta" by The Polymer Authors
