# babel-plugin-transform-vite-meta-env

<!-- prettier-ignore-start -->
[![Build Status](https://img.shields.io/github/workflow/status/OpenSourceRaidGuild/babel-vite/validate?logo=github&style=flat-square)](https://github.com/OpenSourceRaidGuild/babel-vite/actions?query=workflow%3Avalidate)
[![codecov](https://img.shields.io/codecov/c/github/OpenSourceRaidGuild/babel-vite.svg?style=flat-square)](https://codecov.io/gh/OpenSourceRaidGuild/babel-vite)
[![version](https://img.shields.io/npm/v/babel-plugin-transform-vite-meta-env.svg?style=flat-square)](https://www.npmjs.com/package/babel-plugin-transform-vite-meta-env)
[![downloads](https://img.shields.io/npm/dm/babel-plugin-transform-vite-meta-env.svg?style=flat-square)](http://www.npmtrends.com/babel-plugin-transform-vite-meta-env)
[![MIT License](https://img.shields.io/npm/l/babel-plugin-transform-vite-meta-env.svg?style=flat-square)](https://github.com/OpenSourceRaidGuild/babel-vite/blob/master/LICENSE.md)

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![Code of Conduct](https://img.shields.io/badge/code%20of-conduct-ff69b4.svg?style=flat-square)](https://github.com/OpenSourceRaidGuild/babel-vite/blob/master/CODE_OF_CONDUCT.md)
[![Discord](https://img.shields.io/discord/808364903822917662.svg?color=7389D8&labelColor=6A7EC2&logo=discord&logoColor=ffffff&style=flat-square)](https://discord.gg/grS89HWeYh)

[![Watch on GitHub](https://img.shields.io/github/watchers/OpenSourceRaidGuild/babel-vite.svg?style=social)](https://github.com/OpenSourceRaidGuild/babel-vite/watchers)
[![Star on GitHub](https://img.shields.io/github/stars/OpenSourceRaidGuild/babel-vite.svg?style=social)](https://github.com/OpenSourceRaidGuild/babel-vite/stargazers)
[![Tweet](https://img.shields.io/twitter/url/https/github.com/OpenSourceRaidGuild/babel-vite.svg?style=social)](https://twitter.com/intent/tweet?text=Check%20out%20babel-plugin-transform-vite-meta-env%20by%20OpenSourceRaidGuild%20https%3A%2F%2Fgithub.com%2FOpenSourceRaidGuild%2Fbabel-vite%20%F0%9F%91%8D)
<!-- prettier-ignore-end -->

> Please note: this plugin is intended to provide an approximation of some of Vite specific
> transformations when running the code in non-Vite environment, for example, running tests with a
> NodeJS based test runner.
>
> **The functionality within these transformations should not be relied upon in production.**

## Example

**In**

```
const mode = import.meta.env.MODE;
const baseUrl = import.meta.env.BASE_URL;
const nodeEnv = import.meta.env.NODE_ENV;
const dev = import.meta.env.DEV;
const prod = import.meta.env.PROD;
const viteVar = import.meta.env.VITE_VAR;
const other = import.meta.env.OTHER;
```

**Out**

```
const mode = process.env.MODE;
const baseUrl = '/';
const nodeEnv = process.env.NODE_ENV || 'test';
const dev = process.env.NODE_ENV !== 'production';
const prod = process.env.NODE_ENV === 'production';
const viteVar = process.env.env.VITE_VAR;
const other = undefined;
```

## Installation

```sh
npm install --save-dev babel-plugin-transform-vite-meta-env
```

## Usage

### With a configuration file (Recommended)

```json
{
  "plugins": ["babel-plugin-transform-vite-meta-env"]
}
```

### Via CLI

```sh
babel --plugins babel-plugin-transform-vite-meta-env script.js
```

### Via Node API

```javascript
require('@babel/core').transformSync('code', {
  plugins: ['babel-plugin-transform-vite-meta-env']
})
```
