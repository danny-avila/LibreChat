# Changelog

## 4.11.1 (2023-10-03)

Full Changelog: [v4.11.0...v4.11.1](https://github.com/openai/openai-node/compare/v4.11.0...v4.11.1)

## 4.11.0 (2023-09-29)

Full Changelog: [v4.10.0...v4.11.0](https://github.com/openai/openai-node/compare/v4.10.0...v4.11.0)

### Features

* **client:** handle retry-after with a date ([#340](https://github.com/openai/openai-node/issues/340)) ([b6dd384](https://github.com/openai/openai-node/commit/b6dd38488ea7cc4c22495f16d027b7ffdb87da53))
* **package:** export a root error type ([#338](https://github.com/openai/openai-node/issues/338)) ([462bcda](https://github.com/openai/openai-node/commit/462bcda7140611afa20bc25de4aec6d4b205b37d))


### Bug Fixes

* **api:** add content_filter to chat completion finish reason ([#344](https://github.com/openai/openai-node/issues/344)) ([f10c757](https://github.com/openai/openai-node/commit/f10c757d831d90407ba47b4659d9cd34b1a35b1d))


### Chores

* **internal:** bump lock file ([#334](https://github.com/openai/openai-node/issues/334)) ([fd2337b](https://github.com/openai/openai-node/commit/fd2337b018ab2f31bcea8f9feda0ddaf755390c7))
* **internal:** update lock file ([#339](https://github.com/openai/openai-node/issues/339)) ([1bf84b6](https://github.com/openai/openai-node/commit/1bf84b672c386f8ca46bb8fc120eb8d8d48b3a82))
* **internal:** update lock file ([#342](https://github.com/openai/openai-node/issues/342)) ([0001f06](https://github.com/openai/openai-node/commit/0001f062728b0e2047d2bf03b9d947a4be0c7206))
* **internal:** update lock file ([#343](https://github.com/openai/openai-node/issues/343)) ([a02ac8e](https://github.com/openai/openai-node/commit/a02ac8e7f881551527a3cbcadad53b7e424650e8))

## 4.10.0 (2023-09-21)

Full Changelog: [v4.9.1...v4.10.0](https://github.com/openai/openai-node/compare/v4.9.1...v4.10.0)

### Features

* **api:** add 'gpt-3.5-turbo-instruct', fine-tune error objects, update documentation ([#329](https://github.com/openai/openai-node/issues/329)) ([e5f3852](https://github.com/openai/openai-node/commit/e5f385233737002b4bb47a94cba33da7fedfe64d))

## 4.10.0 (2023-09-21)

Full Changelog: [v4.9.1...v4.10.0](https://github.com/openai/openai-node/compare/v4.9.1...v4.10.0)

### Features

* **api:** add 'gpt-3.5-turbo-instruct', fine-tune error objects, update documentation ([#329](https://github.com/openai/openai-node/issues/329)) ([e5f3852](https://github.com/openai/openai-node/commit/e5f385233737002b4bb47a94cba33da7fedfe64d))

## 4.9.1 (2023-09-21)

Full Changelog: [v4.9.0...v4.9.1](https://github.com/openai/openai-node/compare/v4.9.0...v4.9.1)

### Documentation

* **README:** fix variable names in some examples ([#327](https://github.com/openai/openai-node/issues/327)) ([5e05b31](https://github.com/openai/openai-node/commit/5e05b31c132545ce166cea92c5f3e4410fd40711))

## 4.9.0 (2023-09-20)

Full Changelog: [v4.8.0...v4.9.0](https://github.com/openai/openai-node/compare/v4.8.0...v4.9.0)

### Features

* **client:** support importing node or web shims manually ([#325](https://github.com/openai/openai-node/issues/325)) ([628f293](https://github.com/openai/openai-node/commit/628f2935a8791625685f68f73db8f3759b8f4f91))

## 4.8.0 (2023-09-15)

Full Changelog: [v4.7.1...v4.8.0](https://github.com/openai/openai-node/compare/v4.7.1...v4.8.0)

### Features

* **errors:** add status code to error message ([#315](https://github.com/openai/openai-node/issues/315)) ([9341219](https://github.com/openai/openai-node/commit/93412197c67cb3fb203f35e3ae0a7c3fb173453e))

## 4.7.1 (2023-09-15)

Full Changelog: [v4.7.0...v4.7.1](https://github.com/openai/openai-node/compare/v4.7.0...v4.7.1)

### Documentation

* declare Bun 1.0 officially supported ([#314](https://github.com/openai/openai-node/issues/314)) ([a16e268](https://github.com/openai/openai-node/commit/a16e26863390235cb43e2fe0e569298a4f84c32f))

## 4.7.0 (2023-09-14)

Full Changelog: [v4.6.0...v4.7.0](https://github.com/openai/openai-node/compare/v4.6.0...v4.7.0)

### Features

* **client:** retry on 408 Request Timeout ([#310](https://github.com/openai/openai-node/issues/310)) ([1f98eac](https://github.com/openai/openai-node/commit/1f98eac5be956e56d75ef5456115165b45a4763c))
* make docs urls in comments absolute ([#306](https://github.com/openai/openai-node/issues/306)) ([9db3819](https://github.com/openai/openai-node/commit/9db381961e38d2280b0602447e7d91691b327bde))

## 4.6.0 (2023-09-08)

Full Changelog: [v4.5.0...v4.6.0](https://github.com/openai/openai-node/compare/v4.5.0...v4.6.0)

### Features

* **types:** extract ChatCompletionRole enum to its own type ([#298](https://github.com/openai/openai-node/issues/298)) ([5893e37](https://github.com/openai/openai-node/commit/5893e37406ff85331c85a3baa519ca3051a28e00))


### Bug Fixes

* fix module not found errors in Vercel edge ([#300](https://github.com/openai/openai-node/issues/300)) ([47c79fe](https://github.com/openai/openai-node/commit/47c79fee0fa715ad04410e73530829602736d85f))

## 4.5.0 (2023-09-06)

Full Changelog: [v4.4.0...v4.5.0](https://github.com/openai/openai-node/compare/v4.4.0...v4.5.0)

### Features

* **client:** add files.waitForProcessing() method ([#292](https://github.com/openai/openai-node/issues/292)) ([ef59010](https://github.com/openai/openai-node/commit/ef59010cab0c666fa8a437ec6e27800789aa8705))
* fixes tests where an array has to have unique enum values ([#290](https://github.com/openai/openai-node/issues/290)) ([a10b895](https://github.com/openai/openai-node/commit/a10b8956b3eaae7cdcb90329a8386a41219ca021))
* make docs more readable by eliminating unnecessary escape sequences ([#287](https://github.com/openai/openai-node/issues/287)) ([a068043](https://github.com/openai/openai-node/commit/a06804314d4815d420c97f6f965c926ea70d56df))


### Bug Fixes

* **client:** fix TS errors that appear when users Go to Source in VSCode ([#281](https://github.com/openai/openai-node/issues/281)) ([8dc59bc](https://github.com/openai/openai-node/commit/8dc59bcf924cc991747ca475c714d915e04c6012)), closes [#249](https://github.com/openai/openai-node/issues/249)
* **client:** handle case where the client is instantiated with a undefined baseURL ([#285](https://github.com/openai/openai-node/issues/285)) ([5095cf3](https://github.com/openai/openai-node/commit/5095cf340743e4627b4f0ad2f055ebe332824d23))
* **client:** use explicit file extensions in _shims imports ([#276](https://github.com/openai/openai-node/issues/276)) ([16fe929](https://github.com/openai/openai-node/commit/16fe929688d35c2ebe52c8cf1c1570bafda5f97e))


### Documentation

* **api:** update docstrings ([#286](https://github.com/openai/openai-node/issues/286)) ([664e953](https://github.com/openai/openai-node/commit/664e9532c8acfbf981e9a788ab40c111ebe2fda0))
* **readme:** add link to api.md ([#291](https://github.com/openai/openai-node/issues/291)) ([0d1cce2](https://github.com/openai/openai-node/commit/0d1cce26cdc6567c10c8d72bbc72a788ffb8f2be))

## 4.4.0 (2023-09-01)

Full Changelog: [v4.3.1...v4.4.0](https://github.com/openai/openai-node/compare/v4.3.1...v4.4.0)

### Features

* **package:** add Bun export map ([#269](https://github.com/openai/openai-node/issues/269)) ([16f239c](https://github.com/openai/openai-node/commit/16f239c6b4e8526371b01c511d2e0ebba4c5c8c6))
* re-export chat completion types at the top level ([#268](https://github.com/openai/openai-node/issues/268)) ([1a71a39](https://github.com/openai/openai-node/commit/1a71a39421828fdde7b8605094363a5047d2fdc9))
* **tests:** unskip multipart form data tests ([#275](https://github.com/openai/openai-node/issues/275)) ([47d3e18](https://github.com/openai/openai-node/commit/47d3e18a3ee987d04b958dad1a51821ad5472d54))
* **types:** fix ambiguous auto-import for chat completions params ([#266](https://github.com/openai/openai-node/issues/266)) ([19c99fb](https://github.com/openai/openai-node/commit/19c99fb268d6d6c7fc7aaa66475c35f45d12b4bd))


### Bug Fixes

* revert import change which triggered circular import bug in webpack ([#274](https://github.com/openai/openai-node/issues/274)) ([6534e36](https://github.com/openai/openai-node/commit/6534e3620d7e2983e98b42cf95fa966deab1ab1d))

## 4.3.1 (2023-08-29)

Full Changelog: [v4.3.0...v4.3.1](https://github.com/openai/openai-node/compare/v4.3.0...v4.3.1)

### Bug Fixes

* **types:** improve getNextPage() return type ([#262](https://github.com/openai/openai-node/issues/262)) ([245a984](https://github.com/openai/openai-node/commit/245a9847d1ba5bbe5262bc06b2f7bb7385cd3a9a))


### Chores

* **ci:** setup workflows to create releases and release PRs ([#259](https://github.com/openai/openai-node/issues/259)) ([290908c](https://github.com/openai/openai-node/commit/290908ce24dc6c31df18b2eb7808d5b495387454))

## [4.3.0](https://github.com/openai/openai-node/compare/v4.2.0...v4.3.0) (2023-08-27)


### Features

* **client:** add auto-pagination to fine tuning list endpoints ([#254](https://github.com/openai/openai-node/issues/254)) ([5f89c5e](https://github.com/openai/openai-node/commit/5f89c5e6b9088cc2e86405a32b60cae91c078ce1))
* **cli:** rewrite in JS for better compatibility ([#244](https://github.com/openai/openai-node/issues/244)) ([d8d7c05](https://github.com/openai/openai-node/commit/d8d7c0592bfad89669cd2f174e6207370cd7d3fb))


### Bug Fixes

* **stream:** declare Stream.controller as public ([#252](https://github.com/openai/openai-node/issues/252)) ([81e5de7](https://github.com/openai/openai-node/commit/81e5de7ba94c992cafa3d08e2697c8122382497a))


### Documentation

* **readme:** mention Azure support ([#253](https://github.com/openai/openai-node/issues/253)) ([294727a](https://github.com/openai/openai-node/commit/294727ad3543d91ef59df285ce1616c442d369db))


### Chores

* **internal:** add helper method ([#255](https://github.com/openai/openai-node/issues/255)) ([6d8cff0](https://github.com/openai/openai-node/commit/6d8cff00164c0f65ed40b941486f2e0d752feb1e))

## [4.2.0](https://github.com/openai/openai-node/compare/v4.1.0...v4.2.0) (2023-08-23)


### Features

* **types:** export RequestOptions type ([#240](https://github.com/openai/openai-node/issues/240)) ([ecf3bce](https://github.com/openai/openai-node/commit/ecf3bcee3c64a80a3cd901aa32d3db78d1364645))


### Chores

* **internal:** export HeadersInit type shim ([#241](https://github.com/openai/openai-node/issues/241)) ([cf9f672](https://github.com/openai/openai-node/commit/cf9f6729b5b232a37841c33db33b2519b54f19b2))
