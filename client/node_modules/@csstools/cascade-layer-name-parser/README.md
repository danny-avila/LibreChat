# Cascade Layer Name Parser

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/cascade-layer-name-parser.svg" height="20">][npm-url]
[<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

## Usage

Add [Cascade Layer Name Parser] to your project:

```bash
npm install @csstools/cascade-layer-name-parser @csstools/css-parser-algorithms @csstools/css-tokenizer --save-dev
```

[Cascade Layer Name Parser] depends on our CSS tokenizer and parser algorithms.
It must be used together with `@csstools/css-tokenizer` and `@csstools/css-parser-algorithms`.

```ts
import { parse } from '@csstools/cascade-layer-name-parser';

const layerNames = parse('layer-name, foo.bar');
layerNames.forEach((layerName) => {
	console.log(layerName.name()) // "foo.bar"
	console.log(layerName.segments()) // ["foo", "bar"]
});
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/cascade-layer-name-parser

[Cascade Layer Name Parser]: https://github.com/csstools/postcss-plugins/tree/main/packages/cascade-layer-name-parser
