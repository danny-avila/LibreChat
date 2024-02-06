# flip-toolkit

[![Minified & Gzipped size](https://badgen.net/bundlephobia/minzip/flip-toolkit)](https://bundlephobia.com/result?p=flip-toolkit)
[![MIT license](https://badgen.net/npm/license/react-flip-toolkit)](http://opensource.org/licenses/MIT)
[![npm version](https://badgen.net/npm/v/flip-toolkit)](https://npmjs.org/package/flip-toolkit 'View this project on npm')

Using `Vue.js` ? Try [vue-flip-toolkit](https://github.com/mattrothenberg/vue-flip-toolkit).

## Basic Example

[**Fork this example on CodeSandbox**](https://codesandbox.io/s/5v1k1nwz8l)

```js
import { Flipper } from 'flip-toolkit'
const container = document.querySelector('.container')
const square = document.querySelector('.square')
const innerSquare = document.querySelector('.inner-square')

const flipper = new Flipper({ element: container })

// add flipped children to the parent
flipper.addFlipped({
  element: square,
  // assign a unique id to the element
  flipId: 'square',
  onStart: () => console.log('animation started!'),
  onSpringUpdate: springValue =>
    console.log(`current spring value: ${springValue}`),
  onComplete: () => console.log('animation completed!')
})

// to add an inverted child
// (so that the text doesn't warp)
// use this method with
// a reference to the parent element
flipper.addInverted({
  element: innerSquare,
  parent: square
})

square.addEventListener('click', () => {
  // record positions before they change
  flipper.recordBeforeUpdate()
  square.classList.toggle('big-square')
  // record new positions, and begin animations
  flipper.update()
})
```

To learn more about which configuration options are available, [check out the code for the `Flipper` class here](../react-flip-toolkit/src/FlipToolkit/Flipper.ts) or [read the docs for `react-flip-toolkit`](../react-flip-toolkit/README.md)

## Spring

`flip-toolkit` also exports a utility function, `spring`, that can be used to orchestrate non-FLIP animations.

[**Fork this example on CodeSandbox**](https://codesandbox.io/s/spring-example-6xw5p)

```js
import { spring } from "flip-toolkit";

const container = document.querySelector(".container");
const squares = [...container.querySelectorAll(".square")];

squares.forEach((el, i) => {
  spring({
    config: "wobbly",
    values: {
      translateY: [-15, 0],
      opacity: [0, 1]
    },
    onUpdate: ({ translateY, opacity }) => {
      el.style.opacity = opacity;
      el.style.transform = `translateY(${translateY}px)`;
    },
    delay: i * 25,
    onComplete: () => {
      // add callback logic here if necessary
    }
  });
});
```
