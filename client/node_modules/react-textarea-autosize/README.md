[![npm version](https://img.shields.io/npm/v/react-textarea-autosize.svg)](https://www.npmjs.com/package/react-textarea-autosize)
[![npm](https://img.shields.io/npm/dm/react-textarea-autosize.svg)](https://www.npmjs.com/package/react-textarea-autosize)

# react-textarea-autosize

Drop-in replacement for the textarea component which automatically resizes
textarea as content changes. A native React version of the popular
[jQuery Autosize](http://www.jacklmoore.com/autosize/)! Weighs
around <span class="weight">1.3KB</span> (minified & gzipped).

This module supports IE9 and above.

```javascript
import TextareaAutosize from 'react-textarea-autosize';

// If you use CommonJS syntax:
// var TextareaAutosize = require('react-textarea-autosize').default;

React.renderComponent(
  <div>
    <TextareaAutosize />
  </div>,
  document.getElementById('element'),
);
```

## Install

`npm install react-textarea-autosize`

## Demo

https://andarist.github.io/react-textarea-autosize/

## Props

### Special props:

| prop                | type      | description                                                                                                                                                                                                                                        |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxRows`           | `number`  | Maximum number of rows up to which the textarea can grow                                                                                                                                                                                           |
| `minRows`           | `number`  | Minimum number of rows to show for textarea                                                                                                                                                                                                        |
| `onHeightChange`    | `func`    | Function invoked on textarea height change, with height as first argument. The second function argument is an object containing additional information that might be useful for custom behaviors. Current options include `{ rowHeight: number }`. |
| `cacheMeasurements` | `boolean` | Reuse previously computed measurements when computing height of textarea. Default: `false`                                                                                                                                                         |

Apart from these, the component accepts all props that are accepted by `<textarea/>`, like `style`, `onChange`, `value`, etc.

## FAQ

### How to focus

Get a ref to inner textarea:

```js
<TextareaAutosize ref={(tag) => (this.textarea = tag)} />
```

And then call a focus on that ref:

```js
this.textarea.focus();
```

To autofocus:

```js
<TextareaAutosize autoFocus />
```

(all HTML attributes are passed to inner textarea)

### How to test it with jest and react-test-renderer if you need ref

Because [jest](https://github.com/facebook/jest) provides polyfills for DOM
objects by requiring [jsdom](https://github.com/tmpvar/jsdom) and
[react-test-renderer](https://www.npmjs.com/package/react-test-renderer) doesn't
provide refs for rendered components out of the box (calling ref callbacks with
`null`), you need to supply a mocked ref in your tests in you need it for your tests.
You can do it like this (more can be read
[here](https://github.com/facebook/react/issues/7740#issuecomment-247335106)):

```js
const tree = renderer
  .create(<TextareaAutosize />, {
    createNodeMock: () => document.createElement('textarea'),
  })
  .toJSON();
```
