# PostCSS Attribute Case Insensitive [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-attribute-case-insensitive.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/case-insensitive-attributes.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Attribute Case Insensitive] enables support for [Case Insensitive Attribute] matching in selectors.

```pcss
[frame=hsides i] {
	border-style: solid none;
}

/* becomes */

[frame=hsides],[frame=Hsides],[frame=hSides],[frame=HSides],[frame=hsIdes],[frame=HsIdes],[frame=hSIdes],[frame=HSIdes],[frame=hsiDes],[frame=HsiDes],[frame=hSiDes],[frame=HSiDes],[frame=hsIDes],[frame=HsIDes],[frame=hSIDes],[frame=HSIDes],[frame=hsidEs],[frame=HsidEs],[frame=hSidEs],[frame=HSidEs],[frame=hsIdEs],[frame=HsIdEs],[frame=hSIdEs],[frame=HSIdEs],[frame=hsiDEs],[frame=HsiDEs],[frame=hSiDEs],[frame=HSiDEs],[frame=hsIDEs],[frame=HsIDEs],[frame=hSIDEs],[frame=HSIDEs],[frame=hsideS],[frame=HsideS],[frame=hSideS],[frame=HSideS],[frame=hsIdeS],[frame=HsIdeS],[frame=hSIdeS],[frame=HSIdeS],[frame=hsiDeS],[frame=HsiDeS],[frame=hSiDeS],[frame=HSiDeS],[frame=hsIDeS],[frame=HsIDeS],[frame=hSIDeS],[frame=HSIDeS],[frame=hsidES],[frame=HsidES],[frame=hSidES],[frame=HSidES],[frame=hsIdES],[frame=HsIdES],[frame=hSIdES],[frame=HSIdES],[frame=hsiDES],[frame=HsiDES],[frame=hSiDES],[frame=HSiDES],[frame=hsIDES],[frame=HsIDES],[frame=hSIDES],[frame=HSIDES] {
	border-style: solid none;
}
```

## Usage

Add [PostCSS Attribute Case Insensitive] to your project:

```bash
npm install postcss postcss-attribute-case-insensitive --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssAttributeCaseInsensitive = require('postcss-attribute-case-insensitive');

postcss([
	postcssAttributeCaseInsensitive(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Attribute Case Insensitive] runs in all Node environments, with special
instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

## Options

### preserve

The `preserve` option determines whether the original notation
is preserved. By default, it is not preserved.

```js
postcssAttributeCaseInsensitive({ preserve: true })
```

```pcss
[frame=hsides i] {
	border-style: solid none;
}

/* becomes */

[frame=hsides],[frame=Hsides],[frame=hSides],[frame=HSides],[frame=hsIdes],[frame=HsIdes],[frame=hSIdes],[frame=HSIdes],[frame=hsiDes],[frame=HsiDes],[frame=hSiDes],[frame=HSiDes],[frame=hsIDes],[frame=HsIDes],[frame=hSIDes],[frame=HSIDes],[frame=hsidEs],[frame=HsidEs],[frame=hSidEs],[frame=HSidEs],[frame=hsIdEs],[frame=HsIdEs],[frame=hSIdEs],[frame=HSIdEs],[frame=hsiDEs],[frame=HsiDEs],[frame=hSiDEs],[frame=HSiDEs],[frame=hsIDEs],[frame=HsIDEs],[frame=hSIDEs],[frame=HSIDEs],[frame=hsideS],[frame=HsideS],[frame=hSideS],[frame=HSideS],[frame=hsIdeS],[frame=HsIdeS],[frame=hSIdeS],[frame=HSIdeS],[frame=hsiDeS],[frame=HsiDeS],[frame=hSiDeS],[frame=HSiDeS],[frame=hsIDeS],[frame=HsIDeS],[frame=hSIDeS],[frame=HSIDeS],[frame=hsidES],[frame=HsidES],[frame=hSidES],[frame=HSidES],[frame=hsIdES],[frame=HsIdES],[frame=hSIdES],[frame=HSIdES],[frame=hsiDES],[frame=HsiDES],[frame=hSiDES],[frame=HSiDES],[frame=hsIDES],[frame=HsIDES],[frame=hSIDES],[frame=HSIDES] {
	border-style: solid none;
}
[frame=hsides i] {
	border-style: solid none;
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#case-insensitive-attributes
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-attribute-case-insensitive

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Attribute Case Insensitive]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-attribute-case-insensitive
[Case Insensitive Attribute]: https://www.w3.org/TR/selectors4/#attribute-case
