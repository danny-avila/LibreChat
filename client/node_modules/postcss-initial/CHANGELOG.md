# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [4.0.1](https://github.com/maximkoretskiy/postcss-initial/compare/v4.0.0...v4.0.1) (2021-04-14)

## [4.0.0](https://github.com/maximkoretskiy/postcss-initial/compare/v3.0.2...v4.0.0) (2020-09-29)

## [4.0.0] - 2020-09-29

- Update deps
- Migrate to PostCSS v8 Thanks to @goto-bus-stop and @Semigradsky
- Fix initial false positive. Thanks to @goto-bus-stop

## [3.0.3] - 2020-07-14

- Update deps

## [3.0.2](https://github.com/maximkoretskiy/postcss-initial/compare/v3.0.1...v3.0.2) (2019-10-31)

## [3.0.1] - 2019-08-09

- Fix lodash.template vulnerability. See https://github.com/lodash/lodash/pull/4336

## [3.0.0] - 2018-08-16

- Upgrade PostCSS to 7.0.2. It breaks node@4 support. Thanks to @ansballard for contribution

## [2.0.0] - 2016-05-09

- Add yarn
- Update dependcies. Thanks to @Semigradsky

## [1.5.3] - 2016-11-30

- Add `.eslintrc` to `.npmignore` Thanks to @wtgtybhertgeghgtwtg for pr [#20](https://github.com/maximkoretskiy/postcss-initial/pull/20)

## [1.5.2] - 2016-07-20

Fix rules duplication in case when user added own fallback for rule.
See [#18](https://github.com/maximkoretskiy/postcss-initial/issues/18).
Thanks to @ChaosExAnima for suggestion and PR.

## [1.5.1] - 2016-04-09

Added support of multiple initial values in property. Thanks to @johnbender for issue and contribution.

## [1.5.0] - 2016-03-09

- Fix some props with inherit values to more specific values. Thnx @dzhiriki for issue.
- Update deps

## [1.4.1] - 2016-02-05

- Remove gulp from workflow, using npm-scrips only
- Update lodash.template@4
- Fix browser compatibility issues(font, orphans, widows, text-decoration). Thnx to @kinday for issue.

## [1.4] - 2015-11-08

- Added `replace` option. Thanks to @sylvainbaronnet

## [1.3] - 2015-08-27

Rename project to make it more universal (plugin name is **postcss-initial**)

## [1.2] - 2015-08-26

Rename project to fit standards (plugin name is **postcss-all-property**)

## [1.1.0] - 2015-08-25

Add reset: inherited option

## [1.0.1] - 2015-08-24

Proof of concept. Plugin still works =)(plugin name is **postcss-all-unset**)
