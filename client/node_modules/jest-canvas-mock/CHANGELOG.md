# CHANGELOG

## Version 2.5.0

- feat: export a function to re-initialize mocks (#98)
- docs: fix some typos (#104)
- fix: copy & paste mistake: toBlob -> toDataURL (#101)
- chore: add Contributors LitoMore (#94)

## Version 2.4.0

- fix(window): avoid global.window redefinition (#91)
- feat: add translate, translateSelf, scale and scaleSelf to DOMMatrix (#83)
- optimize(Path2D): replace reassign-concat with for-push (#76)
- test: add test for vis @antv/g2plot (#79)
- fix(setLineDash): rename parameter value to segments (#74)
- fix(clip): delete clipping region with restore (#73)

## Version 2.3.0

- Added Prettier code style
- Deleted .npmignore and switched to `package.json` files field
- Added [CONTRIBUTING](./CONTRIBUTING.md) and [CODE_OF_CONDUCT](./CODE_OF_CONDUCT.md) docs
- Switched to `moo-color` for color parsing
- Added contributors to markdown document
  - New Contributor [@evanoc0](https://github.com/evanoc0)

## Version 2.2.0

- Bug: Slice canvas transform value when pushing (#50)
- Remove support for node 6 and 7
- switch babel env to target node 8
- add support for node 13
- update package versions
- fix lineWidth bug

## Version 2.1.1

- Feature: Support for ImageData instantiation using a source array (#45)

## Version 2.1.0

This minor version bump now has some major snapshot support but is backwards compatible.

Changes:

- Feature: Add `static` `CanvasRenderingContext2D` method: `#.__getEvents(ctx)`
  - Feature: Every successful modification of the `CanvasRenderingContext2D` state machine logs an `_event`
- Feature: Add `static` `CanvasRenderingContext2D` method: `#.__getPath(ctx)`
  - Feature: Every path call adds a `_path` item and can be accessed via `__getPath(ctx)`
  - Feature: `beginPath()` empties the `_path`
- Feature: Add `static` `CanvasRenderingContext2D` method: `#.__getDrawCalls(ctx)`
  - Feature: Every draw call adds a `_drawCall` item and can be accessed via `__getDrawCall(ctx)`
- Feature: Add `types/index.d.ts` file for tooling types (in jest environment)
- Feature: Support node 12
- Docs
  - Updated arc example
  - Added snapshot testing documentation
- Bug: `createLinearGradient` now accepts strings
- Bug: `createRadialGradient` now accepts strings
- Bug: `globalAlpha` now accepts `null` per `Number` coercion
- Feature: Faster finite values checks
- Feature: Add `_path` and `_events` to `Path2D`
- Testing: Add and test snapshot outputs

## Version 2.0.0

Just publish a stable version.

## Version 2.0.0-beta.1

### Class Instances

The Version 2.0.0-beta.1 of `jest-canvas-mock` is a complete overhaul of the mocking strategy entirely. Originally, the `canvas.getCanvas('2d')` method would return a single object that contained a set of methods without any property definitions. This caused problems for people who wanted to use `jest` to test and verify `instanceof` checks.

Now the following expectation works as expected.

```ts
const ctx = document.createElement('canvas').getContext('2d');

expect(ctx).toBeInstanceOf(CanvasRenderingContext2D);
```

### Bound Mock Functions

When each `CanvasRenderingContext2D` object is created, all the methods are properly mocked with the `jest.fn()` method, and bound to the instance. It's still possible to verify that a function was called on the context. The main difference now is that the methods actually perform runtime checks on the passed parameters.

The following example demonstrates that canvas methods can be called, and parameters are verified.

```ts
const PI_2 = Math.PI * 2;

// create a circle at 0,0 with radius 100
ctx.arc(0, 0, 100, 0, PI_2);
expect(ctx.arc).toBeCalledWith(0, 0, 100, 0, PI_2);

// negative radius values throw DOMException errors
expect(() => ctx.arc(0, 0, -10, 0, PI_2)).toThrow(DOMExpection);
```

### Parsing Colors and Fonts, Saving, Restoring

Another really big change is that the mocking strategy now attempts to conform to the html living specification. In order to do this, two packages were added as dependencies so that css colors and fonts can be more properly parsed. This is not perfect, and any problems with the color parser or font parser should be reported in the Issues tab.

This change comes with overhauled `ctx.save()` and `ctx.restore()` functions. These function calls work almost entirely as intended. For instance, `ctx.save()` actually pushes all the current property values to a stack, and this operation is undone when `ctx.restore()` is called. Take the following snippet of code as an example.

```ts
// create a context
const ctx = document.createElement('canvas').getContext('2d');

// save the current state of the canvas
ctx.save();

// set some color and font values
ctx.fillStyle = 'blue';
ctx.font = '12pt Times New Roman';

// now the fillStyle property parses the color
expect(ctx.fillStyle).toBe('#00F');

// font parsing also works as intended
expect(ctx.font).toBe('16px "Times New Roman"');

// restore the previously saved state
ctx.restore():

// the fillStyle was restored to default
expect(ctx.fillStyle).toBe('#000');

// the font was restored too
expect(ctx.font).toBe('10px sans-serif');
```

For all these reasons, the `jest-canvas-mock` package was bumped a major version to `2.0.0`.

### CanvasRenderingContext2D prototype

- Implemented Stack Properties for the following items:
  - `direction`
  - `fillStyle`
  - `filter`
  - `font`
  - `globalAlpha`
  - `globalCompositeOperation`
  - `imageSmoothingEnabled`
  - `imageSmoothingQuality`
  - `lineCap`
  - `lineDashOffset`
  - `lineDash` (via `getLineDash()` / `setLineDash()`)
  - `lineJoin`
  - `lineWidth`
  - `miterLimit`
  - `shadowBlur`
  - `shadowColor`
  - `shadowOffsetX`
  - `shadowOffsetY`
  - `stack`
  - `strokeStyle`
  - `textAlign`
  - `textBaseline`
  - `transform` (via `setTransform` etc.)
- function `constructor` binds the following functions
  - `setLineDash`
  - `getLineDash`
  - `setTransform`
  - `getTransform`
  - `getImageData`
  - `save`
  - `restore`
  - `createPattern`
  - `createRadialGradient`
  - `addHitRegion`
  - `arc`
  - `arcTo`
  - `beginPath`
  - `clip`
  - `closePath`
  - `scale`
  - `stroke`
  - `clearHitRegions`
  - `clearRect`
  - `fillRect`
  - `strokeRect`
  - `rect`
  - `resetTransform`
  - `translate`
  - `moveTo`
  - `lineTo`
  - `bezierCurveTo`
  - `createLinearGradient`
  - `ellipse`
  - `measureText`
  - `rotate`
  - `drawImage`
  - `drawFocusIfNeeded`
  - `isPointInPath`
  - `isPointInStroke`
  - `putImageData`
  - `strokeText`
  - `fillText`
  - `quadraticCurveTo`
  - `removeHitRegion`
  - `fill`
  - `transform`
  - `scrollPathIntoView`
  - `createImageData`
- function `addHitRegion`
  - verifies `path` or `id` parameter is set, throws `DOMException` otherwise
  - verifies `fillRule` if set, throws `TypeError` if invalid
- function `arc`
  - throws `TypeError` if `arguments.length < 5`
  - throws `DOMException(IndexSizeError)` if values are finite, but radius is negative
- function `arcTo`
  - throws `TypeError` if `arguments.length < 5`
  - throws `DOMException(IndexSizeError)` if values are finite, but radius is negative
- function `beginPath` (empty noOp stub)
  - if path length eventually needs to be verified, this can be changed
- function `bezierCurveTo`
  - throws `TypeError` if `arguments.length < 6`
- readonly property `canvas`
  - returns the parent `HTMLCanvasElement`
- function `clearHitRegions` (empty noOp stub)
- function `clearRect`
  - throws `TypeError` if `arguments.length < 4`
- function `clip`
  - if `fillRule` is provided, throws `TypeErorr` if `FillRule` is invalid
  - if `path` is provided, throws `TypeError` if path is not `instanceof` `Path2D`
- function `closePath` (added noOp stub)
- function `createImageData`
  - throws `TypeError` if `arguments.length === 1` and parameter is not `instanceof` `ImageData`
  - throws `TypeError` if `arguments.length >= 2` and `width` is not finite
  - throws `TypeError` if `arguments.length >= 2` and `height` is not finite
  - returns `ImageData`
- function `createLinearGradient`
  - throws `TypeError` if `arguments.length < 4`
  - throws `TypeError` if `x0` is not finite
  - throws `TypeError` if `y0` is not finite
  - throws `TypeError` if `x1` is not finite
  - throws `TypeError` if `y1` is not finite
  - returns `CanvasGradient`
- function `createPattern`
  - throws `TypeError` if image is not supported in `jest-canvas-mock`
  - throws `TypeError` if `arguments.length < 4`
  - throws `DOMException('SyntaxError')` if image is detached
  - returns `CanvasPattern` if image is `HTMLImageElement`, `ImageBitmap`, `HTMLVideoElement`, `HTMLCanvasElement`
- function `createRadialGradient`
  - throws `TypeError` if `arguments.length < 4`
  - throws `TypeError` if `x0` is not finite
  - throws `TypeError` if `y0` is not finite
  - throws `TypeError` if `r0` is not finite
  - throws `TypeError` if `x1` is not finite
  - throws `TypeError` if `y1` is not finite
  - throws `TypeError` if `r1` is not finite
  - throws `DOMException('DataError')` if `r0` is negative
  - throws `DOMException('DataError')` if `r1` is negative
- computed property `currentTransform`
  - sets transform stack value if `value instanceof DOMMatrix`
  - returns new `DOMMatrix` with current transform values
- computed property `direction`
  - sets direction stack value when valid
  - returns current direction stack value
- function `drawFocusIfNeeded`
  - throws `TypeError` if `arguments.length === 0`
  - throws `TypeError` if `arguments.length === 2` and `path` is not instanceof `Path2D`
  - throws `TypeError` if `element` is not instanceof `Element`
- function drawImage
  - Valid arities are: [3, 5, 9] (throws `TypeError` if `arguments.length` is not valid)
  - throws `TypeError` if image is not supported by `jest-canvas-mock`
- function `ellipse`
  - throws `TypeError` if `arguments.length < 7`
  - throws `DOMException('IndexSizeError')` if `radiusX` is negative and all parameters are finite
  - throws `DOMException('IndexSizeError')` if `radiusY` is negative and all parameters are finite
- function `fill`
  - throws `TypeError` if `fillRule` is not valid `FillRule`
  - throws `TypeError` if `path` is not instanceof `Path2D`
- function `fillRect`
  - throws `TypeError` if `arguments.length < 4`
- computed property `fillStyle`
  - sets current `fillStyle` stack value if it's a valid css color, a `CanvasGradient` or a `CanvasPattern`
  - returns current `fillStyle` stack value
- function `fillText`
  - throws `TypeError` if `arguments.length < 3`
- computed property `filter`
  - sets the current `filter` stack value if it's a string
  - returns the current `filter` stack value
  - TODO: add custom parser for filter values to check validity
- computed property `font`
  - sets the current `font` stack value if it's a valid font
  - returns the current `font` stack value
- function `getImageData`
  - returns new `ImageData` with the same size as the parent `canvas`
- function `getLineDash`
  - returns the current `lineDash` stack value
- function `setLineDash`
  - throws `TypeError` if `lineDash` value is not a valid sequence
  - sets the current `lineDash` stack value
  - properly concatenates itself if the `lineDash` length is odd
- function `getTransform`
  - returns current `transform` stack value in the form of a `DOMMatrix`
- computed property `globalAlpha`
  - sets current `globalAlpha` stack value if `value` finite and between the inclusive range `[0 .. 1]`
  - returns the current `globalAlpha` stack value
- computed property `globalCompositeOperation`
  - sets the current `globalCompositeOperation` stack value if `value` is a valid GlobalCompositeOperation value
  - returns the current `globalCompositeOperation` stack value
- computed property `imageSmoothingEnabled`
  - sets current `imageSmoothingEnabled` stack value to `value` coerced to a boolean
  - returns current `imageSmoothingEnabled` stack value
- computed property `imageSmoothingQuality`
  - sets the `imageSmoothingQuality` stack value if value is a valid ImageSmoothingQuality value
  - returns the current `imageSmoothingQuality` stack value
- function `isPointInPath`
  - throws `TypeError` if `arguments.length < 2`
  - throws `TypeError` if provided `fillRule` is not a valid `FillRule`
  - TODO: Implement pathing operations and perform an actual `isPointInPath()` operation
  - always returns false
- function `isPointInStroke`
  - throws `TypeError` if `arguments.length < 2`
  - always returns false
- computed property `lineCap`
  - sets the current `lineCap` stack value if value is a valid `LineCap`
  - returns the current `lineCap` stack value
- computed property `lineDashOffset`
  - sets the current `lineDashOffset` stack value if value is finite
  - returns the current `lineDashOffset` stack value
- computed property `lineJoin`
  - sets the current `lineJoin` stack value if value is a valid `LineJoin`
  - returns the current `lineJoin` stack value
- function `lineTo`
  - throws `TypeError` if `arguments.length < 2`
- computed property `lineWidth`
  - sets the current `lineWidth` stack value if value is finite and greater than 0
  - returns the current `lineWidth` stack value
- function `measureText`
  - throws `TypeError` if `arguments.length < 1`
  - returns a `TextMetrics` object
- computed property `miterLimit`
  - sets the current `miterLimit` stack value if value is finite and greater than 0
  - returns the current `miterLimit` stack value
- function `moveTo`
  - throws `TypeError` if `arguments.length < 2`
- function `putImageData`
  - Valid arities are: [3, 7], throws `TypeError` if `arguments.length` is not valid arity
  - throws `TypeError` if `data` is not instanceof `ImageData`
- function `quadraticCurveTo`
  - throws `TypeError` if `arguments.length < 4`
- function `rect`
  - throws `TypeError` if `arguments.length < 4`
- function `removeHitRegion`
  - throws `TypeError` if `arguments.length < 1`
- function `resetTransform`
  - sets current `transform` stack value to the 2d identity matrix
- function `restore`
  - pops all the property stack values and decreases the stack index
- function `rotate`
  - throws `TypeError` if `arguments.length < 1`
  - rotates the current `transform` stack value if `angle` is finite
- function `save`
  - pushes the current property stack values to the next item on the stack
  - increases the stack index
- function `scale`
  - throws `TypeError` if `arguments.length < 2`
  - scales the current `transform` stack value if the `x` and `y` values are finite
- function `scrollPathIntoView` (empty noOp stub)
- function `setTransform`
  - if `arguments.length === 0` sets the current `transform` stack value to the 2d identity matrix
  - if `arguments.length == 1`
    - throws `TypeError` if value is not instanceof `DOMMatrix`
    - sets the current `transform` stack value to the provided matrix
  - throws `TypeError` if `arguments.length < 6`
  - coerces each parameter to a number via `Number()`
  - sets the current `transform` stack value if the provided values are all finite
- computed property `shadowBlur`
  - sets the current `shadowBlur` stack value if value is finite and greater than 0
  - returns the current `shadowBlur` stack value
- computed property `shadowColor`
  - sets the current `shadowColor` stack value if value is a valid css color
  - returns the current `shadowColor` stack value
- computed property `shadowOffsetX`
  - sets the current `shadowOffsetX` stack value if value is finite
  - returns the current `shadowOffsetX` stack value
- computed property `shadowOffsetY`
  - sets the current `shadowOffsetY` stack value if value is finite
  - returns the current `shadowOffsetY` stack value
- function `stroke`
  - throws `TypeError` if `path` is not instanceof `Path2D`
- function `strokeRect`
  - throws `TypeError` if `arguments.length < 4`
- computed property `strokeStyle`
  - sets current `fillStyle` stack value if it's a valid css color, a `CanvasGradient` or a `CanvasPattern`
  - returns current `fillStyle` stack value
- function `strokeText`
  - throws `TypeError` if `arguments.length < 3`
- computed property `textAlign`
  - sets the current `textAlign` stack value if value is a valid `TextAlign` value
  - returns the current `textAlign` stack value
- computed property `textBaseline`
  - sets the current `textBaseline` stack value if value is a valid `TextBaseline` value
  - returns the current `textBaseline` stack value
- function `transform`
  - throws `TypeError` if `arguments.length < 6`
  - coerces each value to number via `Number()`
  - performs a transform operation on the current `transform` stack value if every parameter is finite
- function `translate`
  - throws `TypeError` if `arguments.length < 2`
  - performs a translate operation on the current `transform` stack value if every parameter is finite

### Other Changes By File

- src/CanvasGradient.js
  - Added Class for `instanceof` checks
  - bound functions:
    - `addColorStop`
  - function `addColorStop`
    - throws `IndexSizeError` `DOMException` if resulting offset is not finite
    - throws `SyntaxError` when color cannot be parsed
- src/CanvasPattern.js
  - Added Class for `instanceof` checks
  - bound functions:
    - `setTransform`
  - function `setTransform`
    - throws `TypeError` if argument.length > 1 and parameter is not an object
- src/DOMMatrix.js
  - Added minimal `DOMMatrix` implementation
  - Added Class for `instanceof` checks
  - function `constructor`
    - constructs 3d matrix when parameter is ArrayLike and `length === 16`
    - constructs 2d matrix parameter is ArrayLike and `length === 6`
    - throws else if provided a first argument
    - constructs an identity 2d matrix if no arguments are passed
  - property `matrix.isIdentity`
    - returns `true` if matrix is an identity matrix
  - computed properties `a-f`
    - returns and sets values according to the HTML Living Specification
  - property `is2D`
    - returns `true` if matrix was constructed as a 2d matrix
  - TODO:
    - Make `m11-m44` computed properties
    - Perform `Number()` coercion in setters
- src/ImageBitmap.js
  - Added helper Class for `instanceof` checks
  - bound functions:
    - `close`
  - function `close`
    - "closes" the bitmap and causes `drawImage` function calls to fail
- src/ImageData.js
  - Added helper class for `instanceof` checks
  - computed readonly `width`, `height` and `data` properties
  - function `constructor`
    - throws `TypeError` if width is not finite
    - throws `TypeError` if width is `0`
    - throws `TypeError` if height is not finite
    - throws `TypeError` if height is `0`
    - creates an empty `Uint8ClampedArray` of `width * height * 4` size
- src/Path2D.js
  - Added helper class for `instanceof` checks
  - Borrows path function definitions from `CanvasRenderingContext2D` for convenience
    - `closePath` implemented from `CanvasRenderingContext2D`
    - `moveTo` implemented from `CanvasRenderingContext2D`
    - `lineTo` implemented from `CanvasRenderingContext2D`
    - `bezierCurveTo` implemented from `CanvasRenderingContext2D`
    - `quadraticCurveTo` implemented from `CanvasRenderingContext2D`
    - `arc` implemented from `CanvasRenderingContext2D`
    - `arcTo` implemented from `CanvasRenderingContext2D`
    - `ellipse` implemented from `CanvasRenderingContext2D`
    - `rect` implemented from `CanvasRenderingContext2D`
  - function `addPath`
    - throws `TypeError` if `arguments.length < 1`
    - throws `TypeError` if provided `path` is not `instanceof` `Path2D`
- src/TextMetrics.js
  - Added helper class for `instanceof` checks
  - Implemented data properties
    - `width`
    - `actualBoundingBoxLeft`
    - `actualBoundingBoxRight`
    - `fontBoundingBoxAscent`
    - `fontBoundingBoxDescent`
    - `actualBoundingBoxAscent`
    - `actualBoundingBoxDescent`
    - `emHeightAscent`
    - `emHeightDescent`
    - `hangingBaseline`
    - `alphabeticBaseline`
    - `ideographicBaseline`
  - function `constructor`
    - This function cannot normally be constructed
    - mocked to accept a `text` parameter
    - sets `width` property to `text.length`
