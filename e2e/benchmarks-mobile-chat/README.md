# Mobile Chat Performance Benchmark

Measures long-conversation behavior with Playwright's iPhone 13 descriptor: a
`390x664` browser viewport on a `390x844` screen. It uses a local production
build and the mock-model pipeline; no provider credentials or external model
calls are used.

The benchmark seeds 150 user/assistant turns (300 rendered message rows), then
captures six phases:

- sitting idle on an empty chat as a control;
- loading and progressively mounting the long transcript;
- sitting idle for three seconds after the transcript settles;
- repeated full-history scrolling;
- three streamed continuation turns with long Markdown responses;
- typing after the transcript grows to 306 rows.

Each scenario records Chromium `Performance` domain counters (main-thread task,
script, layout and style time), long tasks, heap size, and DOM node count. It
runs twice: first without react-scan for lower-overhead browser measurements,
then with react-scan to attribute render counts and duration to components.

This is a desktop-hosted Chromium measurement at an iPhone viewport, not a
physical-device battery or thermal measurement. Use it to reproduce and compare
frontend changes locally; confirm energy impact separately on a real iPhone.

## Run

Extract the pinned instrumentation bundle outside the repository so npm cannot
re-resolve LibreChat's dependencies, prepare the production client, then run
the benchmark:

```bash
mkdir -p /tmp/librechat-react-scan
npm pack react-scan@0.5.7 --pack-destination /tmp/librechat-react-scan
tar -xzf /tmp/librechat-react-scan/react-scan-0.5.7.tgz -C /tmp/librechat-react-scan
npm run e2e:prepare
REACT_SCAN_PATH=/tmp/librechat-react-scan/package/dist/auto.global.js \
  npx playwright test --config=e2e/playwright.config.mobile-chat-perf.ts
```

JSON snapshots are attached to the Playwright results under
`e2e/benchmarks/.test-results/mobile-chat`.
