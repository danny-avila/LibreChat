# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v2.0.2](https://github.com/inspect-js/is-set/compare/v2.0.1...v2.0.2) - 2020-12-13

### Commits

- [Tests] migrate tests to Github Actions [`10a1a86`](https://github.com/inspect-js/is-set/commit/10a1a869d5f76921eed5bb7f1503be6f03eea8a2)
- [meta] do not publish github action workflow files [`9611423`](https://github.com/inspect-js/is-set/commit/9611423c4a6baa08a38f46ddafcca3ed4ea0ad97)
- [Dev Deps] update `eslint`, `@ljharb/eslint-config`, `aud`, `auto-changelog`, `es6-shim`, `object-inspect`, `tape` [`7d4d9b3`](https://github.com/inspect-js/is-set/commit/7d4d9b3ce8434a96c238cef62a7ce9ce79bd6079)
- [Tests] run `nyc` on all tests [`dff5fb6`](https://github.com/inspect-js/is-set/commit/dff5fb6cec206e51c6a7311fdb866bb0a0783b1a)
- [actions] add "Allow Edits" workflow [`6bed76a`](https://github.com/inspect-js/is-set/commit/6bed76af3119e489e622b3ea30807484dbb7fca9)
- [readme] remove travis badge [`ee9e740`](https://github.com/inspect-js/is-set/commit/ee9e74012ba35e86a4e92d7165548341d4323755)
- [Tests] add `core-js` tests [`9ef1b4e`](https://github.com/inspect-js/is-set/commit/9ef1b4ed0e55cec4154189247b6d7f6ad570e2f1)
- [Dev Deps] update `eslint`, `@ljharb/eslint-config`, `tape` [`5661354`](https://github.com/inspect-js/is-set/commit/5661354f7a9861998257fdacfa9975feae9415b8)
- [actions] switch Automatic Rebase workflow to `pull_request_target` event [`2cea69e`](https://github.com/inspect-js/is-set/commit/2cea69e16f64d7e706945010e03401a0a66507a3)
- [Dev Deps] update `es5-shim`, `tape` [`9e24b51`](https://github.com/inspect-js/is-set/commit/9e24b5158a0490c6b94deb31e76b06337eaafce6)
- [Dev Deps] update `auto-changelog`; add `aud` [`69ae556`](https://github.com/inspect-js/is-set/commit/69ae5561fe2408f301479dfa65dac0255e16952e)
- Fix typo in README.md, Map -&gt; Set [`5fe826a`](https://github.com/inspect-js/is-set/commit/5fe826a1e11bf810b7174e2dfaf893a5682511d4)
- [Tests] only audit prod deps [`c7c67f6`](https://github.com/inspect-js/is-set/commit/c7c67f6b1a32b2b24709d733a6681cbe1ec67640)
- [meta] normalize line endings [`6ef4ebd`](https://github.com/inspect-js/is-set/commit/6ef4ebdf090bdf1f42eb912b6af2cf31df4abaef)

## [v2.0.1](https://github.com/inspect-js/is-set/compare/v2.0.0...v2.0.1) - 2019-12-17

### Fixed

- [Refactor] avoid top-level return, because babel and webpack are broken [`#5`](https://github.com/inspect-js/is-set/issues/5) [`#4`](https://github.com/inspect-js/is-set/issues/4) [`#3`](https://github.com/inspect-js/is-set/issues/3) [`#78`](https://github.com/inspect-js/node-deep-equal/issues/78) [`#7`](https://github.com/es-shims/Promise.allSettled/issues/7) [`#12`](https://github.com/airbnb/js-shims/issues/12)

### Commits

- [actions] add automatic rebasing / merge commit blocking [`db358ba`](https://github.com/inspect-js/is-set/commit/db358ba503aa86fe2d375e188dcdfa7174a070c8)
- [Dev Deps] update `eslint`, `@ljharb/eslint-config`, `tape` [`13e5083`](https://github.com/inspect-js/is-set/commit/13e50834eacb1c1830feb598da70ca6d0c53d2f7)

## [v2.0.0](https://github.com/inspect-js/is-set/compare/v1.0.0...v2.0.0) - 2019-11-12

### Commits

- Initial commit [`0299bc8`](https://github.com/inspect-js/is-set/commit/0299bc8fce41dce4586ac2f79c73802ad6a72c3d)
- Tests [`dec24eb`](https://github.com/inspect-js/is-set/commit/dec24eb0b9f57f14be8eedd0e572f94f81572e82)
- readme [`9b16e7f`](https://github.com/inspect-js/is-set/commit/9b16e7ff417b5c7be9829f22e32249d737bb8f6e)
- implementation [`3da6156`](https://github.com/inspect-js/is-set/commit/3da6156dae02e71d541bc8a0d3b751734b98e06d)
- npm init [`89fdc8b`](https://github.com/inspect-js/is-set/commit/89fdc8b3d980f6ca414f71dff2af38ed102321a1)
- [meta] add `funding` field; create `FUNDING.yml` [`77f2be9`](https://github.com/inspect-js/is-set/commit/77f2be9f281439472f81a0378632bc5eeb25a79b)
- [meta] add `safe-publish-latest`, `auto-changelog` [`cef1b4c`](https://github.com/inspect-js/is-set/commit/cef1b4cef15c565e76e3d46e66087821c4c437ae)
- [Tests] add `npm run lint` [`2a8284c`](https://github.com/inspect-js/is-set/commit/2a8284c6d2265ecd5c98bd4a008a82f0b519cd0a)
- [Tests] use shared travis-ci configs [`d2e342f`](https://github.com/inspect-js/is-set/commit/d2e342f3b8477cc74bcab44297d20d10fcf3718b)
- Only apps should have lockfiles [`624072b`](https://github.com/inspect-js/is-set/commit/624072b92774aaa6d851837c882181995d88ece8)
- [Tests] add `npx aud` in `posttest` [`214247c`](https://github.com/inspect-js/is-set/commit/214247c3fcd61b164c18b56524cdc183fc485450)

## v1.0.0 - 2015-02-18

### Commits

- init [`2f11646`](https://github.com/inspect-js/is-set/commit/2f1164617bee9c05c0f7ffae8fca2feed13bade7)
