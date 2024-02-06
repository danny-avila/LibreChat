<p align="center">
  <a href="https://codepen.io/aholachek/pen/ERRpEj">
  <img src="./example-assets/rft-logo.gif" width='500px' alt='react-flip-toolkit animated logo' />
  </a>
</p>

[![Minified & Gzipped size](https://badgen.net/bundlephobia/minzip/react-flip-toolkit)](https://bundlephobia.com/result?p=react-flip-toolkit)
[![MIT license](https://badgen.net/npm/license/react-flip-toolkit)](http://opensource.org/licenses/MIT)
[![npm version](https://badgen.net/npm/v/react-flip-toolkit)](https://npmjs.org/package/react-flip-toolkit 'View this project on npm')

**Comparison with other React FLIP libraries**

| Feature                                                                        | [`react-flip-move`](https://github.com/joshwcomeau/react-flip-move) | [`react-overdrive`](https://github.com/berzniz/react-overdrive) | `react-flip-toolkit` |
| ------------------------------------------------------------------------------ | :-----------------------------------------------------------------: | :-------------------------------------------------------------: | :------------------: |
| Animate position                                                               |                                 ✅                                  |                               ✅                                |          ✅          |
| Animate scale                                                                  |                                 ❌                                  |                               ✅                                |          ✅          |
| Animate opacity                                                                |                                 ❌                                  |                               ✅                                |          ✅          |
| [Animate parent's size without warping children](#nested-scale-transforms) |                                 ❌                                  |                               ❌                                |          ✅          |
| Use real FLIP instead of cloning & crossfading                                 |                                 ✅                                  |                               ❌                                |          ✅          |
| [Use springs for animations](https://codesandbox.io/s/react-flip-toolkit-spring-settings-explorer-vjrsh)                                                     |                                 ❌                                  |                               ❌                                |          ✅          |
| Support spring-based stagger effects                                           |                                 ❌                                  |                               ❌                                |          ✅          |
| [Usable with frameworks other than React](packages/flip-toolkit)               |                                 ❌                                  |                               ❌                                |          ✅          |

## Quick start

`npm install react-flip-toolkit` or `yarn add react-flip-toolkit`

1. Wrap all animated children with a single `Flipper` component that has a `flipKey` prop that changes every time animations should happen.

2. Wrap elements that should be animated with `Flipped` components that have a `flipId` prop matching them across renders.


## Table of Contents

- [Forkable Examples](#forkable-examples)
  - [Simple Example: An Expanding Div](#simple-example-an-expanding-div)
  - [Simple Example: Two Divs](#simple-example-two-divs)
  - [Simple Example: List Shuffle](#simple-example-list-shuffle)
  - [List Transitions](#list-transitions)
  - [Stagger Effects](#stagger-effects)
  - [Spring Customizations](#spring-customizations)
  - [Nested Scale Transforms](#nested-scale-transforms)
  - [Route-based Animations With React Router](#route-based-animations-with-react-router)
  - [More examples](#more-examples)
- [The Components](#the-components)
  - [`Flipper`](#flipper)
    - [Basic Props](#basic-props)
    - [Advanced Props](#advanced-props)
  - [`Flipped`](#flipped)
    - [Wrapping a React Component](#wrapping-a-react-component)
    - [Basic props](#basic-props)
    - [Callback props](#callback-props)
    - [Transform props](#transform-props)
    - [Advanced props](#advanced-props)
  - [`Spring`](#spring)
- [Library details](#library-details)
- [Troubleshooting](#troubleshooting)
  - [Problem #1: Nothing is happening](#problem-1-nothing-is-happening)
  - [Problem #2: Things look weird / animations aren't behaving](#problem-2-things-look-weird--animations-arent-behaving)
  - [Problem #3: It's still not working](#problem-3-its-still-not-working)
- [Performance](#performance)
  - [`Memoization`](#memoization)
  - [`will-change:transform`](#will-changetransform)

## Forkable Examples

### Simple Example: An Expanding Div

<a href="https://codesandbox.io/s/8130rn9q2">
<img src="./example-assets/square.gif" height="200px" alt="animated square" />
</a>

[Fork this example on Code Sandbox](https://codesandbox.io/s/8130rn9q2)


```jsx
import React, { useState } from 'react'
import { Flipper, Flipped } from 'react-flip-toolkit'

const AnimatedSquare = () => {
  const [fullScreen, setFullScreen] = useState(false)
  const toggleFullScreen = () => setFullScreen(prevState => !prevState)

  return (
    <Flipper flipKey={fullScreen}>
      <Flipped flipId="square">
        <div
          className={fullScreen ? 'full-screen-square' : 'square'}
          onClick={toggleFullScreen}
        />
      </Flipped>
    </Flipper>
  )
}
```

### Simple Example: Two Divs

<a href="https://codesandbox.io/s/74q85nq1qq">
<img src="./example-assets/2squares.gif" height="200px" alt="2 animated squares" />
</a>

[Fork this example on Code Sandbox](https://codesandbox.io/s/74q85nq1qq)

```jsx
import React, { useState } from 'react'
import { Flipper, Flipped } from 'react-flip-toolkit'

const Square = ({ toggleFullScreen }) => (
  <Flipped flipId="square">
    <div className="square" onClick={toggleFullScreen} />
  </Flipped>
)

const FullScreenSquare = ({ toggleFullScreen }) => (
  <Flipped flipId="square">
    <div className="full-screen-square" onClick={toggleFullScreen} />
  </Flipped>
)

const AnimatedSquare = () => {
  const [fullScreen, setFullScreen] = useState(false)
  const toggleFullScreen = () => setFullScreen(prevState => !prevState)

  return (
    <Flipper flipKey={fullScreen}>
      {fullScreen ? (
        <FullScreenSquare toggleFullScreen={toggleFullScreen} />
      ) : (
        <Square toggleFullScreen={toggleFullScreen} />
      )}
    </Flipper>
  )
}
```

### Simple Example: List Shuffle

<a href="https://codesandbox.io/s/14v8o5xy44">
<img src="./example-assets/listshuffle.gif" height="60px" alt="shuffling a list" />
</a>

[Fork this example on Code Sandbox](https://codesandbox.io/s/14v8o5xy44)

```jsx
import React, { useState } from 'react'
import { Flipper, Flipped } from 'react-flip-toolkit'
import shuffle from 'lodash.shuffle'

const ListShuffler = () => {
  const [data, setData] = useState([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const shuffleList = () => setData(shuffle(data))

  return (
    <Flipper flipKey={data.join('')}>
      <button onClick={shuffleList}> shuffle</button>
      <ul className="list">
        {data.map(d => (
          <Flipped key={d} flipId={d}>
            <li>{d}</li>
          </Flipped>
        ))}
      </ul>
    </Flipper>
  )
}
```

### List Transitions

Add some interest to a dynamic list of cards by animating changes to cards' sizes and positions.

<a href="https://codesandbox.io/s/list-transitions-ju549">
<img src="./example-assets/listanimations.gif" height="200px" alt='animated list' />
</a>

[Fork this example on Code Sandbox](https://codesandbox.io/s/list-transitions-ju549)

### Stagger Effects

The `react-flip-toolkit` library offers spring-driven stagger configurations so that you can achieve complex sequenced effects.

For the most basic stagger effect, you can simply add a `stagger` boolean prop to your `Flipped` element:

```jsx
<Flipped flipId={`element-${i}`} stagger>
  <AnimatedListItem/>
</Flipped>
```

<a href="https://codesandbox.io/s/wnnxl223n8">
<img src="./example-assets/list-transition.gif" height="300px" alt='animation for the selected state of a list item' />
</a>

[Fork this example on Code Sandbox](https://codesandbox.io/s/wnnxl223n8)


### Spring Customizations

`react-flip-toolkit` uses springs for animations. To customize the spring, you can pass in a preset name:

```jsx
// spring preset can be one of: "stiff", "noWobble", "gentle", "veryGentle", or "wobbly"
<Flipper flipKey='foo' spring='wobbly'>
  {/* Flipped components go here...*/}
</Flipper>
```

or a custom spring config:

```jsx
<Flipper flipKey='foo' spring={{ stiffness: 280, damping: 22 }} >
  {/* Flipped components go here...*/}
</Flipper>
```
[View all spring options in the interactive explorer](https://codesandbox.io/s/react-flip-toolkit-spring-settings-explorer-vjrsh)


### Nested Scale Transforms

<a href="https://codesandbox.io/s/github/aholachek/react-stripe-menu">
<img src="./example-assets/stripe-menu.gif" height="300px" alt="stripe menu" />
</a>

- [Fork this example on Code Sandbox](https://codesandbox.io/s/github/aholachek/react-stripe-menu)
- [Fork Github repo](https://github.com/aholachek/react-stripe-menu)


Interesting animations often involve scale transforms in addition to simple translate transforms. The problem with scale animations has to do with children &mdash; if you scale a div up 2x, you will warp any children it has by scaling them up too, creating a weird-looking animation. That's why this library allows you to wrap the child with a `Flipped` component that has an `inverseFlipId` to counteract the transforms of the parent:

```jsx
<Flipped flipId={id}>
  <div>
    <Flipped inverseFlipId={id} scale>
      <div>some text that will not be warped</div>
    </Flipped>
  </div>
</Flipped>
```

By default, both the scale and the translation transforms of the parent will be counteracted (this allows children components to make their own FLIP animations without being affected by the parent).
But for many use cases, you'll want to additionally specify the `scale` prop to limit the adjustment to the scale and allow the positioning to move with the parent.

Note: the DOM element with the inverse transform should lie flush against its parent container for the most seamless animation.

That means any layout styles &mdash; padding, flexbox, etc&mdash;should be applied to the inverted container (the element wrapped with a `Flipped` component with an `inverseFlipId`) rather than the parent `Flipped` container.



### Route-based Animations With React Router

<a href="https://github.com/aholachek/react-flip-toolkit-router-example">
  <img src="./example-assets/compressed-demo.gif" width='500px' alt='React-flip-toolkit with React-Router' />
</a>

[Fork Github repo](https://github.com/aholachek/react-flip-toolkit-router-example)


`react-flip-toolkit` works great with client-side routers to provide route-driven transitions:

```jsx
<Route
  render={({ location, search }) => {
    return (
      <Flipper
        flipKey={`${location.pathname}-${location.search}`}
      >
      {/* Child routes that contain Flipped components go here...*/}
      </Flipper>
    )
  }}
/>
```

### More examples

- [Guitar shop](https://react-flip-toolkit-demos.surge.sh/guitar)
- [React-flip-toolkit logo](https://codepen.io/aholachek/pen/ERRpEj)
- [Using Portals](https://react-flip-toolkit-demos.surge.sh/portal)

## The Components

### `Flipper`

The parent wrapper component that contains all the elements to be animated. You'll often need only one of these per page, but sometimes it will be more convenient to have multiple `Flipper` regions of your page concerned with different transitions.

```jsx
<Flipper flipKey={someKeyThatChanges}>{/* children */}</Flipper>
```

#### Basic Props

| prop                    |  default   | type                       | details                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | :--------: | :------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| flipKey **(required)**  |     -      | `string`, `number`, `bool` | Changing this tells `react-flip-toolkit` to transition child elements wrapped in `Flipped` components.                                                                                                                                                                                                                                                                                                          |
| children **(required)** |     -      | `node`                     | One or more element children                                                                                                                                                                                                                                                                                                                                                                                    |
| spring                  | `noWobble` | `string` or `object`       | Provide a string referencing one of the spring presets &mdash; `noWobble` (default), `veryGentle`, `gentle`, `wobbly`, or `stiff`, OR provide an object with stiffness and damping parameters. [Explore the spring setting options here](https://codesandbox.io/s/react-flip-toolkit-spring-settings-explorer-vjrsh). The prop provided here will be the spring default that can be overrided on a per-element basis on the `Flipped` component. |
| applyTransformOrigin    |   `true`   | `bool`                     | Whether or not `react-flip-toolkit` should apply a transform-origin of "0 0" to animating children (this is generally, but not always, desirable for FLIP animations)                                                                                                                                                                                                                                           |
| element                 |   `div`    | `string`                   | If you'd like the wrapper element created by the `Flipped` container to be something other than a `div`, you can specify that here.                                                                                                                                                                                                                                                                             |
| className               |     -      | `string`                   | A class applied to the wrapper element, helpful for styling.                                                                                                                                                                                                                                                                                                                                                    |
| staggerConfig           |     -      | `object`                   | Provide configuration for staggered `Flipped` children. The config object might look something like the code snippet below:                                                                                                                                                                                                                                                                                     |

```js
staggerConfig={{
  // the "default" config will apply to staggered elements without explicit keys
      default: {
        // default direction is forwards
        reverse: true,
        // default is .1, 0 < n < 1
        speed: .5
      },
  // this will apply to Flipped elements with the prop stagger='namedStagger'
    namedStagger : { speed: .2 }
  }}
```

#### Advanced Props

| prop                    | default | type       | details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | :-----: | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| decisionData            |    -    | `any`      | Sometimes, you'll want the animated children of `Flipper` to behave differently depending on the state transition &mdash; maybe only certain `Flipped` elements should animate in response to a particular change. By providing the `decisionData` prop to the `Flipper` component, you'll make that data available to the `shouldFlip` and `shouldInvert` methods of each child `Flipped` component, so they can decided for themselves whether to animate or not.                                                                                                                                                                                                                                    |
| debug                   | `false` | `boolean`  | This experimental prop will pause your animation right at the initial application of FLIP-ped styles. That will allow you to inspect the state of the animation at the very beginning, when it should look similar or identical to the UI before the animation began.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| portalKey               |    -    | `string`   | In general, the `Flipper` component will only apply transitions to its descendents. This allows multiple `Flipper` elements to coexist on the same page, but it will prevent animations from working if you use [portals](https://reactjs.org/docs/portals.html). You can provide a unique `portalKey` prop to `Flipper` to tell it to scope element selections to the entire document, not just to its children, so that elements in portals can be transitioned.                                                                                                                                                                                                                                     |
| onStart              |    -    | `function` | This callback prop will be called before any of the individual FLIP animations have started. It receives as arguments the HTMLElement of the Flipper and the decisionData object described elsewhere.                                                                                                                                                                                                                                                                                                                                                                        |
| onComplete              |    -    | `function` | This callback prop will be called when all individual FLIP animations have completed. Its single argument is a list of `flipId`s for the `Flipped` components that were activated during the animation. If an animation is interrupted, `onComplete` will be still called right before the in-progress animation is terminated.                                                                                                                                                                                                                                                                                                                                                                        |
| handleEnterUpdateDelete |    -    | `function` | By default, `react-flip-toolkit` finishes animating out exiting elements before animating in new elements, with updating elements transforming immediately. You might want to have more control over the sequence of transitions &mdash; say, if you wanted to hide elements, pause, update elements, pause again, and finally animate in new elements. Or you might want transitions to happen simultaneously. If so, provide the function `handleEnterUpdateDelete` as a prop. [The best way to understand how this works is to check out this interactive example.](https://codesandbox.io/s/4q7qpkn8q0) `handleEnterUpdateDelete` receives the following arguments every time a transition occurs: |

```js
handleEnterUpdateDelete({
  // this func applies an opacity of 0 to entering elements so
  // they can be faded in - it should be called immediately
  hideEnteringElements,
  // calls `onAppear` for all entering elements
  animateEnteringElements,
  //calls `onExit` for all exiting elements
  // returns a promise that resolves when all elements have exited
  animateExitingElements,
  // the main event: `FLIP` animations for updating elements
  // this also returns a promise that resolves when
  // animations have completed
  animateFlippedElements
})
```

### `Flipped`

Wraps an element that should be animated.

E.g. in one component you can have

```jsx
<Flipped flipId="coolDiv">
  <div className="small" />
</Flipped>
```

and in another component somewhere else you can have

```jsx
<Flipped flipId="coolDiv">
  <div className="big" />
</Flipped>
```

and they will be tweened by `react-flip-toolkit`.

The `Flipped` component produces no markup, it simply passes some props down to its wrapped child.

#### Wrapping a React Component

If you want to wrap a React component rather than a JSX element like a `div`, you can provide a render prop and then apply the `flippedProps` directly to the wrapped element in your component:

```jsx
<Flipped>
  {flippedProps => <MyCoolComponent flippedProps={flippedProps} />}
</Flipped>

const MyCoolComponent = ({ flippedProps }) => <div {...flippedProps} />
```

You can also simply provide a regular React component as long as that component spreads unrecognized props directly onto the wrapped element (this technique works well for wrapping styled components):

```jsx
<Flipped>
  <MyCoolComponent />
</Flipped>

const MyCoolComponent = ({ knownProp, ...rest }) => <div {...rest} />
```

#### Basic props

| prop                                                   |  default   | type                  | details                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | :--------: | :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| children **(required)**                                |     -      | `node` or `function`  | Wrap a single element, React component, or render prop child with the `Flipped` component                                                                                                                                                                                                                                                                                                                                                               |
| flipId **(required unless inverseFlipId is provided)** |     -      | `string`              | Use this to tell `react-flip-toolkit` how elements should be matched across renders so they can be animated.                                                                                                                                                                                                                                                                                                                                            |
| inverseFlipId                                          |     -      | `string`              | Refer to the id of the parent `Flipped` container whose transform you want to cancel out. If this prop is provided, the `Flipped` component will become a limited version of itself that is only responsible for cancelling out its parent transform. It will read from any provided `transform` props and will ignore all other props (besides `inverseFlipId`.) [Read more about canceling out parent transforms here.](#practical-scale-transitions) |
| transformOrigin                                        |  `"0 0"`   | `string`              | This is a convenience method to apply the proper CSS `transform-origin` to the element being FLIP-ped. This will override `react-flip-toolkit`'s default application of `transform-origin: 0 0;` if it is provided as a prop.                                                                                                                                                                                                                           |
| spring                                                 | `noWobble` | `string` or `object`  | Provide a string referencing one of the spring presets &mdash; `noWobble` (default), `veryGentle`, `gentle`, `wobbly`, or `stiff`, OR provide an object with stiffness and damping parameters. [Explore the spring setting options here.](https://codepen.io/aholachek/full/bKmZbV/)                                                                                                                                                                               |
| stagger                                                |  `false`   | `boolean` or `string` | Provide a natural, spring-based staggering effect in which the spring easing of each item is pinned to the previous one's movement. Provide `true` to stagger the element with all other staggered elements. If you want to get more granular, you can provide a string key and the element will be staggered with other elements with the same key.                                                                                                    |
| delayUntil                                               |  `false`   | `string` (flipId) | Delay an animation by providing a reference to another `Flipped` component that it should wait for before animating (the other `Flipped` component should have a stagger delay as that is the only use case in which this prop is necessary.)                                                                                                    |

#### Callback props

<p>
<a href="https://codesandbox.io/s/q787wz5lx4">
  <img src="./example-assets/enter-update-delete.gif" height="300px" alt='animation of a sentence transforming into another sentence' />
</a>
</p>

The above animation uses `onAppear` and `onExit` callbacks for fade-in and fade-out animations.

| prop             | arguments                           | details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | :---------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| onAppear         | `element`, `index`, `{previous: decisionData, current: decisionData }`                  | Called when the element first appears in the DOM. It is provided a reference to the DOM element being transitioned as the first argument, and the index of the element relative to all appearing elements as the second. Note: If you provide an `onAppear` prop, the default opacity of the element will be set to 0 to allow you to animate it in without any initial flicker. If you don't want any opacity animation, just set the element's opacity to 1 immediately in your `onAppear` function. |
| onStart          | `element`, `{previous: decisionData, current: decisionData }`                          | Called when the FLIP animation for the element starts. It is provided a reference to the DOM element being transitioned as the first argument.                                                                                                                                                                                                                                                                                                                                                         |
| onStartImmediate | `element`, `{previous: decisionData, current: decisionData }`                          | Similar to `onStart`, but guaranteed to run for all FLIP-ped elements on the initial tick of the FLIP animation, before the next frame has rendered, even if the element in question has a stagger delay. It is provided a reference to the DOM element being transitioned as the first argument.                                                                                                                                                                                                      |
| onSpringUpdate   | `springValue`                       | Called with the current spring value (normally between 0 - 1 but might briefly go over or under that range depending on the level of "bounciness" of the spring). Useful if you'd like to tween other, non-FLIP animations in concert with a FLIP transition.                                                                                                                                                                                                                                          |
| onComplete       | `element`,`{previous: decisionData, current: decisionData }`                          | Called when the FLIP animation completes. It is provided a reference to the DOM element being transitioned as the first argument. (If transitions are interruped by new ones, `onComplete` will still be called.)                                                                                                                                                                                                                                                                                      |
| onExit           | `element`, `index`, `removeElement`, `{previous: decisionData, current: decisionData }` | Called when the element is removed from the DOM. It must call the `removeElement` function when the exit transition has completed.                                                                                                                                                                                                                                                                                                                                                                     |

#### Transform props

By default the FLIP-ped elements' translate, scale, and opacity properties are all transformed. However, certain effects require more control so if you specify any of these props, _only the specified attribute(s) will be tweened_:

| prop      |  type  | details                             |
| --------- | :----: | :---------------------------------- |
| translate | `bool` | Tween `translateX` and `translateY` |
| scale     | `bool` | Tween `scaleX` and `scaleY`         |
| opacity   | `bool` |                                     |

#### Advanced props

Functions to control when FLIP happens

| prop         | arguments                                     | details                                                                                                                                                                                                                                              |
| ------------ | :-------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shouldFlip   | `previousDecisionData`, `currentDecisionData` | A function provided with the current and previous `decisionData` props passed down by the `Flipper` component. Returns a `boolean` to indicate whether a `Flipped` component should animate at that particular moment or not.                        |
| shouldInvert | `previousDecisionData`, `currentDecisionData` | A function provided with the current and previous `decisionData` props passed down by the `Flipper` component. Returns a `boolean` indicating whether to apply inverted transforms to all `Flipped` children that request it via an `inverseFlipId`. |


### `Spring`

As a convenience, `react-flip-toolkit` exports a tiny function to access the same spring system used to create FLIP transitions.

[Fork example on CodeSandbox](https://codesandbox.io/s/react-flip-toolkit-spring-example-e6pyc)

```jsx
import { spring } from 'react-flip-toolkit'

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
  onComplete: () => console.log('done')
});
```

<a href="https://codesandbox.io/s/react-flip-toolkit-spring-example-e6pyc">
  <img src="./example-assets/spring.gif" alt="spring example" width="200px"/>
</a>

## Library details

<a href="https://www.browserstack.com/">
<img src="./example-assets/browserstack.png" alt="browserstack" width="140"/>
</a>

- Tested in latest Chrome, Firefox, Safari, Edge, and IE 11 with [Browserstack](https://www.browserstack.com/).
- For IE11 compatability, make sure you're polyfilling the `window.Promise` object.
- Requires React 16+
- Uses [Rematrix](https://github.com/jlmakes/rematrix) for matrix calculations and a simplified fork of [Rebound](https://github.com/facebook/rebound-js) for spring animations

## Troubleshooting

### Problem #1: Nothing is happening

- Make sure you're updating the `flipKey` attribute in the `Flipper` component whenever an animation should happen.
- If one of your `Flipped` components is wrapping another React component rather than a DOM element, [use a render prop to get the Flipped props](#wrapping-a-react-component) and pass down to the necessary DOM element.
- Is the element that's receiving props from `Flipped` visible in the DOM? `react-flip-toolkit` attempts to optimize performance by not animating elements that are off-screen or elements that have no width or height.
- `display:inline` elements cannot be animated. If you want an `inline` element to animate, set `display:inline-block`.

### Problem #2: Things look weird / animations aren't behaving

- **Check to make sure all `flipId`s are unique.** At any point, there can only be one element with a specified `flipId` on the page. If there are multiple `Flipped` elements on the page with the same id, the animation will break.
- **Make sure you are animating the element you want to animate and not, for instance, a wrapper div**. If you are animating an inline element like some text, but have wrapped it in a `div`, you're actually animating the div, which might have a much wider width that you'd expect at certain points, which will throw off the animation. Check to see if you need to add an `inline-block` style to the animated element.
- Make sure you don't have any **competing CSS transitions** on the element in question.
- **If you are animating an image**, try giving the image hard-coded dimensions and seeing if that fixes the problem. (If you are relying on the innate dimensions of the image, it might not have been fully rendered by the browser in time for the new image dimensions to be measured.)

### Problem #3: It's still not working

- Try out the `debug` prop. If you still can't figure out what's going wrong, you can add the [the `debug` prop](#props) directly on your `Flipper` component to pause transitions at the beginning.
- If you think something might actually be broken, or are completely stuck, feel free to make an issue.

## Performance

`React-flip-toolkit` does a lot of work under the hood to try to maximize the performance of your animations &mdash; for instance, off-screen elements won't be animated, and style updates are batched to prevent [layout thrashing](https://developers.google.com/web/fundamentals/performance/rendering/avoid-large-complex-layouts-and-layout-thrashing).
However, if you are building particularly complex animations&mdash;ones that involve dozens of elements or large images&mdash; there are some additional strategies you can use to ensure performant animations.

### `Memoization`

When you trigger a complex FLIP animation with `react-flip-toolkit`, `React` could be spending vital milliseconds doing unnecessary reconciliation work before allowing the animation to start. If you notice a slight delay between when the animation is triggered, and when it begins, this is probably the culprit. To short-circuit this possibly unnecessary work, try memoizing your component by using [`React.memo`](https://reactjs.org/docs/react-api.html#reactmemo) or [`PureComponent`](https://reactjs.org/docs/react-api.html#reactpurecomponent) for your animated elements, and seeing if you can refactor your code to minimize prop updates to animated children when an animation is about to occur.

### `will-change:transform`

```css
.box {
  will-change: transform;
}
```

This [CSS property](https://dev.opera.com/articles/css-will-change-property/) tells the browser to anticipate changes to an element. It should be used with caution, because it can increase browser resource usage. If you notice rendering issues in your animation, I would recommend trying it out and seeing if it increases the performance of the animation.
