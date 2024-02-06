# `tailwindcss-animate`

> A Tailwind CSS plugin for creating beautiful animations.

```html
<!-- Add an animated fade and zoom entrance -->
<div class="animate-in fade-in zoom-in">...</div>

<!-- Add an animated slide to top-left exit -->
<div class="animate-out slide-out-to-top slide-out-to-left">...</div>

<!-- Control animation duration -->
<div class="... duration-300">...</div>

<!-- Control animation delay -->
<div class="... delay-150">...</div>

<!-- And so much more! -->
```

## Installation

Install the plugin from npm:

```sh
npm install -D tailwindcss-animate
```

Then add the plugin to your `tailwind.config.js` file:

```js
// @filename tailwind.config.js
module.exports = {
	theme: {
		// ...
	},
	plugins: [
		require("tailwindcss-animate"),
		// ...
	],
}
```

## Documentation

- [Basic Usage](#basic-usage)
  - [Changing animation delay](#changing-animation-delay)
  - [Changing animation direction](#changing-animation-direction)
  - [Changing animation duration](#changing-animation-duration)
  - [Changing animation fill mode](#changing-animation-fill-mode)
  - [Changing animation iteration count](#changing-animation-iteration-count)
  - [Changing animation play state](#changing-animation-play-state)
  - [Changing animation timing function](#changing-animation-timing-function)
  - [Prefers-reduced-motion](#prefers-reduced-motion)
- [Enter & Exit Animations](#enter-and-exit-animations)
  - [Adding enter animations](#adding-enter-animations)
  - [Adding exit animations](#adding-exit-animations)
  - [Changing enter animation starting opacity](#changing-enter-animation-starting-opacity)
  - [Changing enter animation starting rotation](#changing-enter-animation-starting-rotation)
  - [Changing enter animation starting scale](#changing-enter-animation-starting-scale)
  - [Changing enter animation starting translate](#changing-enter-animation-starting-translate)
  - [Changing exit animation ending opacity](#changing-exit-animation-ending-opacity)
  - [Changing exit animation ending rotation](#changing-exit-animation-ending-rotation)
  - [Changing exit animation ending scale](#changing-exit-animation-ending-scale)
  - [Changing exit animation ending translate](#changing-exit-animation-ending-translate)

### Basic Usage

#### Changing animation delay

Use the `delay-{amount}` utilities to control an element’s `animation-delay`.

```html
<button class="animate-bounce delay-150 duration-300 ...">Button A</button>
<button class="animate-bounce delay-300 duration-300 ...">Button B</button>
<button class="animate-bounce delay-700 duration-300 ...">Button C</button>
```

Learn more in the [animation delay](/docs/animation-delay.md) documentation.

#### Changing animation direction

Use the `direction-{keyword}` utilities to control an element’s `animation-delay`.

```html
<button class="animate-bounce direction-normal ...">Button A</button>
<button class="animate-bounce direction-reverse ...">Button B</button>
<button class="animate-bounce direction-alternate ...">Button C</button>
<button class="animate-bounce direction-alternate-reverse ...">Button C</button>
```

Learn more in the [animation direction](/docs/animation-direction.md) documentation.

#### Changing animation duration

Use the `duration-{amount}` utilities to control an element’s `animation-duration`.

```html
<button class="animate-bounce duration-150 ...">Button A</button>
<button class="animate-bounce duration-300 ...">Button B</button>
<button class="animate-bounce duration-700 ...">Button C</button>
```

Learn more in the [animation duration](/docs/animation-duration.md) documentation.

#### Changing animation fill mode

Use the `fill-mode-{keyword}` utilities to control an element’s `animation-fill-mode`.

```html
<button class="animate-bounce fill-mode-none ...">Button A</button>
<button class="animate-bounce fill-mode-forwards ...">Button B</button>
<button class="animate-bounce fill-mode-backwards ...">Button C</button>
<button class="animate-bounce fill-mode-both ...">Button C</button>
```

Learn more in the [animation fill mode](/docs/animation-fill-mode.md) documentation.

#### Changing animation iteration count

Use the `repeat-{amount}` utilities to control an element’s `animation-iteration-count`.

```html
<button class="animate-bounce repeat-0 ...">Button A</button>
<button class="animate-bounce repeat-1 ...">Button B</button>
<button class="animate-bounce repeat-infinite ...">Button C</button>
```

Learn more in the [animation iteration count](/docs/animation-iteration-count.md) documentation.

#### Changing animation play state

Use the `running` and `paused` utilities to control an element’s `animation-play-state`.

```html
<button class="animate-bounce running ...">Button B</button>
<button class="animate-bounce paused ...">Button A</button>
```

Learn more in the [animation play state](/docs/animation-play-state.md) documentation.

#### Changing animation timing function

Use the `ease-{keyword}` utilities to control an element’s `animation-timing-function`.

```html
<button class="animate-bounce ease-linear ...">Button A</button>
<button class="animate-bounce ease-in ...">Button B</button>
<button class="animate-bounce ease-out ...">Button C</button>
<button class="animate-bounce ease-in-out ...">Button C</button>
```

Learn more in the [animation timing function](/docs/animation-timing-function.md) documentation.

#### Prefers-reduced-motion

For situations where the user has specified that they prefer reduced motion, you can conditionally apply animations and transitions using the `motion-safe` and `motion-reduce` variants:

```html
<button class="motion-safe:animate-bounce ...">Button B</button>
```

### Enter & Exit Animations

### Adding enter animations

To give an element an enter animation, use the `animate-in` utility, in combination with some [`fade-in`](/docs/enter-animation-scale.md), [`spin-in`](/docs/enter-animation-rotate.md), [`zoom-in`](/docs/enter-animation-scale.md), and [`slide-in-from`](/docs/enter-animation-translate.md) utilities.

```html
<button class="animate-in fade-in ...">Button A</button>
<button class="animate-in spin-in ...">Button B</button>
<button class="animate-in zoom-in ...">Button C</button>
<button class="animate-in slide-in-from-top ...">Button D</button>
<button class="animate-in slide-in-from-left ...">Button E</button>
```

Learn more in the [enter animation](/docs/enter-animation.md) documentation.

### Adding exit animations

To give an element an exit animation, use the `animate-out` utility, in combination with some [`fade-out`](/docs/exit-animation-scale.md), [`spin-out`](/docs/exit-animation-rotate.md), [`zoom-out`](/docs/exit-animation-scale.md), and [`slide-out-from`](/docs/exit-animation-translate.md) utilities.

```html
<button class="animate-out fade-out ...">Button A</button>
<button class="animate-out spin-out ...">Button B</button>
<button class="animate-out zoom-out ...">Button C</button>
<button class="animate-out slide-out-from-top ...">Button D</button>
<button class="animate-out slide-out-from-left ...">Button E</button>
```

Learn more in the [exit animation](/docs/exit-animation.md) documentation.

#### Changing enter animation starting opacity

Set the starting opacity of an animation using the `fade-in-{amount}` utilities.

```html
<button class="animate-in fade-in ...">Button A</button>
<button class="animate-in fade-in-25 ...">Button B</button>
<button class="animate-in fade-in-50 ...">Button C</button>
<button class="animate-in fade-in-75 ...">Button C</button>
```

Learn more in the [enter animation opacity](/docs/enter-animation-opacity.md) documentation.

#### Changing enter animation starting rotation

Set the starting rotation of an animation using the `spin-in-{amount}` utilities.

```html
<button class="animate-in spin-in-1 ...">Button A</button>
<button class="animate-in spin-in-6 ...">Button B</button>
<button class="animate-in spin-in-75 ...">Button C</button>
<button class="animate-in spin-in-90 ...">Button C</button>
```

Learn more in the [enter animation rotate](/docs/enter-animation-rotate.md) documentation.

#### Changing enter animation starting scale

Set the starting scale of an animation using the `zoom-in-{amount}` utilities.

```html
<button class="animate-in zoom-in ...">Button A</button>
<button class="animate-in zoom-in-50 ...">Button B</button>
<button class="animate-in zoom-in-75 ...">Button C</button>
<button class="animate-in zoom-in-95 ...">Button C</button>
```

Learn more in the [enter animation scale](/docs/enter-animation-scale.md) documentation.

#### Changing enter animation starting translate

Set the starting translate of an animation using the `slide-in-from-{direction}-{amount}` utilities.

```html
<button class="animate-in slide-in-from-top ...">Button A</button>
<button class="animate-in slide-in-from-bottom-48 ...">Button B</button>
<button class="animate-in slide-in-from-left-72 ...">Button C</button>
<button class="animate-in slide-in-from-right-96 ...">Button C</button>
```

Learn more in the [enter animation translate](/docs/enter-animation-translate.md) documentation.

#### Changing exit animation ending opacity

Set the ending opacity of an animation using the `fade-out-{amount}` utilities.

```html
<button class="animate-out fade-out ...">Button A</button>
<button class="animate-out fade-out-25 ...">Button B</button>
<button class="animate-out fade-out-50 ...">Button C</button>
<button class="animate-out fade-out-75 ...">Button C</button>
```

Learn more in the [exit animation opacity](/docs/exit-animation-opacity.md) documentation.

#### Changing exit animation ending rotation

Set the ending rotation of an animation using the `spin-out-{amount}` utilities.

```html
<button class="animate-out spin-out-1 ...">Button A</button>
<button class="animate-out spin-out-6 ...">Button B</button>
<button class="animate-out spin-out-75 ...">Button C</button>
<button class="animate-out spin-out-90 ...">Button C</button>
```

Learn more in the [exit animation rotate](/docs/exit-animation-rotate.md) documentation.

#### Changing exit animation ending scale

Set the ending scale of an animation using the `zoom-out-{amount}` utilities.

```html
<button class="animate-out zoom-out ...">Button A</button>
<button class="animate-out zoom-out-50 ...">Button B</button>
<button class="animate-out zoom-out-75 ...">Button C</button>
<button class="animate-out zoom-out-95 ...">Button C</button>
```

Learn more in the [exit animation scale](/docs/exit-animation-scale.md) documentation.

#### Changing exit animation ending translate

Set the ending translate of an animation using the `slide-out-to-{direction}-{amount}` utilities.

```html
<button class="animate-out slide-out-to-top ...">Button A</button>
<button class="animate-out slide-out-to-bottom-48 ...">Button B</button>
<button class="animate-out slide-out-to-left-72 ...">Button C</button>
<button class="animate-out slide-out-to-right-96 ...">Button C</button>
```

Learn more in the [exit animation translate](/docs/exit-animation-translate.md) documentation.
