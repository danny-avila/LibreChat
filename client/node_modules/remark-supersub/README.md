# remark-supersub

[![CI/CD Status](https://github.com/Symbitic/remark-plugins/workflows/main/badge.svg)](https://github.com/Symbitic/remark-plugins/actions)
[![MIT License](https://img.shields.io/github/license/Symbitic/remark-plugins)](https://github.com/Symbitic/remark-plugins/blob/master/LICENSE.md)
[![stars](https://img.shields.io/github/stars/Symbitic/remark-plugins.svg)](https://github.com/Symbitic/remark-plugins)

[Remark](https://remark.js.org/) plugin for adding support for pandoc-style superscript and subscript syntax to Markdown.

Adds two new node types to [MDAST](https://github.com/syntax-tree/mdast): `superscript` and `subscript`.
When using [rehype](https://github.com/rehypejs/rehype), these will be stringified as `sup` and `sub` respectively.

## Install

This package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c):
Node 12+ is needed to use it and it must be `import`ed instead of `require`d.

[npm](https://docs.npmjs.com/cli/install):

```sh
npm install remark-supersub
```

## Syntax

```markdown
21^st^ Century

H~2~O
```

## AST

The example above will yield:

```javascript
{
  type: 'paragraph',
  children: [
    {
      type: 'text',
      value: '21'
    },
    {
      type: 'superscript',
      children: [{
        type: 'text',
        value: 'st'
      }]
    },
    {
      type: 'text',
      value: ' Century'
    }
  ]
}
...
{
  type: 'paragraph',
  children: [
    {
      type: 'text',
      value: 'H'
    },
    {
      type: 'subscript',
      children: [{
        type: 'text',
        value: '2'
      }]
    },
    {
      type: 'text',
      value: 'O'
    }
  ]
}
```

## Usage

```javascript
import { unified } from 'unified'
import markdown from 'remark-parse'
import html from 'rehype-stringify'
import remark2rehype from 'remark-rehype'
import supersub from 'remark-supersub'

unified()
  .use(markdown)
  .use(supersub)
  .use(remark2rehype)
  .use(html)
```

## License

[MIT](LICENSE.md) © Alex Shaw
