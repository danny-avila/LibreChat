# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## 1.0.3 - 2022-04-04

- Lint codes.
- Fix docs.
- Update dependencies.

## [1.0.2] - 2019-12-31

- Refined some regex. (073832a8ef0a74503cc30cfe89489fbefbc1d160)
- Update docs. (6ebd08963b19bc8a0fceb062d17a11fe7eb70144)

## [1.0.0] - 2019-10-17

### Updated

- Update dependencies.

## [0.2.2] - 2018-06-11

### Fixed

- Fix util methods `padStart()` and `padEnd()`. (1ded7bb88e1712fe5b60801aca29a5df44a4ecbc)

## [0.2.0] - 2018-05-16

### Changed

- Now available give color argument as `ColorData` in MooColor constructor. #7
- Changes `random()` to static method. #6

### Removed

- Removed `random()` method. use static [`random()`](https://github.com/archco/moo-color/blob/master/docs/static.md#random) method instead.

## [0.1.3] - 2018-03-30

### Added

- Add default exports.

## [0.1.1] - 2018-03-02

### Added

- Add methods for manipulate. `complement()` and `invert()`. #2
- Add method `random()`. #5
- Write [docs](https://github.com/archco/moo-color/tree/master/docs#moocolor-api). #4

### Changed

- Improve formatter. #3
  - `toHex()`: Change argument `enableShort: boolean` to `mode: 'full'|'short'|'name'`.
  - `toRgb()`: add `mode: 'default'|'percent'` argument.

## [0.1.0]

First release.

[Unreleased]: https://github.com/archco/moo-color/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/archco/moo-color/compare/v1.0.0...v1.0.2
[1.0.0]: https://github.com/archco/moo-color/compare/v0.2.2...v1.0.0
[0.2.2]: https://github.com/archco/moo-color/compare/v0.2.0...v0.2.2
[0.2.0]: https://github.com/archco/moo-color/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/archco/moo-color/compare/v0.1.1...v0.1.3
[0.1.1]: https://github.com/archco/moo-color/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/archco/moo-color/compare/a4dfebd...v0.1.0
