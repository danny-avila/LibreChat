# Dedent

An ES6 string tag that strips indentation from multi-line strings.

## Usage

```js
import dedent from "dedent";

function usageExample() {
  const first = dedent`A string that gets so long you need to break it over
                       multiple lines. Luckily dedent is here to keep it
                       readable without lots of spaces ending up in the string
                       itself.`;

  const second = dedent`
    Leading and trailing lines will be trimmed, so you can write something like
    this and have it work as you expect:

      * how convenient it is
      * that I can use an indented list
         - and still have it do the right thing

    That's all.
  `;

  const third = dedent(`
    Wait! I lied. Dedent can also be used as a function.
  `);

  return first + "\n\n" + second + "\n\n" + third;
}
```

```js
> console.log(usageExample());
```

```
A string that gets so long you need to break it over
multiple lines. Luckily dedent is here to keep it
readable without lots of spaces ending up in the string
itself.

Leading and trailing lines will be trimmed, so you can write something like
this and have it work as you expect:

  * how convenient it is
  * that I can use an indented list
    - and still have it do the right thing

That's all.

Wait! I lied. Dedent can also be used as a function.
```

## Options

You can customize the options `dedent` runs with by calling its `withOptions` method with an object:

<!-- prettier-ignore -->
```js
import dedent from 'dedent';

dedent.withOptions({ /* ... */ })`input`;
dedent.withOptions({ /* ... */ })(`input`);
```

`options` returns a new `dedent` function, so if you'd like to reuse the same options, you can create a dedicated `dedent` function:

<!-- prettier-ignore -->
```js
import dedent from 'dedent';

const dedenter = dedent.withOptions({ /* ... */ });

dedenter`input`;
dedenter(`input`);
```

### `escapeSpecialCharacters`

JavaScript string tags by default add an extra `\` escape in front of some special characters such as `$` dollar signs.
`dedent` will escape those special characters when called as a string tag.

If you'd like to change the behavior, an `escapeSpecialCharacters` option is available.
It defaults to:

- `false`: when `dedent` is called as a function
- `true`: when `dedent` is called as a string tag

```js
import dedent from "dedent";

// "$hello!"
dedent`
  $hello!
`;

// "\$hello!"
dedent.withOptions({ escapeSpecialCharacters: false })`
  $hello!
`;

// "$hello!"
dedent.withOptions({ escapeSpecialCharacters: true })`
  $hello!
`;
```

For more context, see [https://github.com/dmnd/dedent/issues/63](🚀 Feature: Add an option to disable special character escaping).

## License

MIT
