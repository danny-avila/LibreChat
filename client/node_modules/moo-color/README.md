# MooColor

[![Node.js CI](https://github.com/archco/moo-color/actions/workflows/node.js.yml/badge.svg)](https://github.com/archco/moo-color/actions/workflows/node.js.yml)
[![npm version](https://badge.fury.io/js/moo-color.svg)](https://www.npmjs.com/package/moo-color)
[![Downloads](https://img.shields.io/npm/dm/moo-color.svg)](https://www.npmjs.com/package/moo-color)

A javascript class that provides convenience for color parsing and manipulating.

## Install

``` sh
npm install moo-color
```

## Usage

``` js
import MooColor from 'moo-color';

const color = new MooColor('#f00');

color.whiten(10).toString('hwb'); // returns 'hwb(0, 10%, 0)'
```

## API

Please see [MooColor API](https://github.com/archco/moo-color/tree/master/docs#moocolor-api).

## Change Log

[CHANGELOG.md](https://github.com/archco/moo-color/blob/master/CHANGELOG.md)

## license

[MIT License](https://github.com/archco/moo-color/blob/master/LICENSE)
