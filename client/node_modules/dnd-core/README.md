[![npm package](https://img.shields.io/npm/v/dnd-core.svg?style=flat-square)](https://www.npmjs.org/package/dnd-core)
[![Build Status](https://travis-ci.org/react-dnd/dnd-core.svg?branch=main)](https://travis-ci.org/react-dnd/dnd-core)
[![Test Coverage](https://codeclimate.com/github/react-dnd/dnd-core/badges/coverage.svg)](https://codeclimate.com/github/react-dnd/dnd-core)

# dnd-core

Drag and Drop stateful engine - no GUI.

This is a clean implementation of drag and drop primitives that does not depend on the browser.
It powers [React DnD](https://github.com/react-dnd/react-dnd) internally.

## Wat?

To give you a better idea:

- There is no DOM here
- We let you define drop target and drag source logic
- We let you supply custom underlying implementations (console, DOM via jQuery, React, React Native, _whatever_)
- We manage drag source and drop target interaction

This was written to support some rather complicated scenarios that were too hard to implement in [React DnD](https://github.com/react-dnd/react-dnd) due to its current architecture:

- [Mocking drag and drop interaction in tests](https://github.com/react-dnd/react-dnd/issues/55)
- [Full support for arbitrary nesting and handling drag sources and drop targets](https://github.com/react-dnd/react-dnd/issues/87)
- [Dragging multiple items at once](https://github.com/react-dnd/react-dnd/issues/14)
- [Even when source is removed, letting another drag source “represent it” (e.g. card disappeared from one Kanban list, reappeared in another one)](https://github.com/react-dnd/react-dnd/pull/64#issuecomment-76118757)

As it turns out, these problems are much easier to solve when DOM is thrown out of the window.

## What's the API like?

[Tests](https://github.com/react-dnd/dnd-core/tree/main/test) should give you some idea. You register drag sources and drop targets, connect a backend (you can use barebones `TestBackend` or implement a fancy real one yourself), and your drag sources and drop targets magically begin to interact.

![](http://i.imgur.com/6l8CpxZ.png)
