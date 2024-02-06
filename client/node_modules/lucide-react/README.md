# Lucide React

Implementation of the lucide icon library for react applications.

> What is lucide? Read it [here](https://github.com/lucide-icons/lucide#what-is-lucide).

## Installation

```sh
yarn add lucide-react
```

or

```sh
npm install lucide-react
```

## How to use

It's built with ES modules so it's completely tree-shakable.
Each icon can be imported as a react component.

### Example

You can pass additional props to adjust the icon.

```js
import { Camera } from 'lucide-react';

const App = () => {
  return <Camera color="red" size={48} />;
};

export default App;
```

### Props

| name          | type     | default      |
| ------------- | -------- | ------------ |
| `size`        | _Number_ | 24           |
| `color`       | _String_ | currentColor |
| `strokeWidth` | _Number_ | 2            |

### Custom props

You can also pass custom props that will be added in the svg as attributes.

```js
const App = () => {
  return <Camera fill="red" />;
};
```

### Generic icon component

It is possible to create a generic icon component to load icons.

> :warning: The example below is importing all ES modules. This is **not** recommended when you using a bundler since your application build size will grow substantially.

```js
import * as icons from 'lucide-react';

const Icon = ({ name, color, size }) => {
  const LucideIcon = icons[name];

  return <LucideIcon color={color} size={size} />;
};

export default Icon;
```
