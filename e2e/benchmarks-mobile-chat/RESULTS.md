# Mobile Chat Performance Baseline

Captured September 2, 2026 from LibreChat `434fa377c` on an Apple M4 Max with
macOS 26.6, Node.js 24.16.0, Playwright 1.62.1, and Chromium at the iPhone 13
viewport (`390x844`). The production client was used.

The stress conversation contained 150 user/assistant turns (300 rows) with
prose, lists, code blocks, and tables. The continuation phase streamed three
additional rich Markdown replies. `busy` is Chromium main-thread task time
divided by elapsed wall time; it is a useful comparison proxy, not device CPU
utilization.

## Raw browser measurements

| Phase                   |      Wall | Main-thread busy |     Task |   Script |  Style | Long tasks (total/worst) | Heap at end | DOM nodes |
| ----------------------- | --------: | ---------------: | -------: | -------: | -----: | -----------------------: | ----------: | --------: |
| Empty chat idle         |  3,015 ms |            12.8% |   387 ms |   220 ms |  48 ms |                 65/65 ms |     58.5 MB |     2,021 |
| Load 300 rows           |  2,177 ms |            85.2% | 1,855 ms | 1,257 ms |  85 ms |               295/219 ms |    249.1 MB |   118,549 |
| Long chat idle          |  3,034 ms |            22.1% |   672 ms |     7 ms | 188 ms |                   0/0 ms |    328.4 MB |   120,289 |
| Four full scroll cycles |  3,765 ms |            89.9% | 3,386 ms | 1,123 ms | 330 ms |                   0/0 ms |    341.0 MB |   120,475 |
| Three continuations     | 11,691 ms |            83.8% | 9,797 ms | 3,540 ms | 981 ms |             1,941/272 ms |    353.9 MB |   127,342 |
| Typing after stress     |  1,229 ms |            58.8% |   723 ms |   162 ms | 106 ms |                   0/0 ms |    399.2 MB |   128,076 |

Heap figures are point-in-time values without forced garbage collection, so
they do not establish a memory leak.

## React Scan diagnostic

React Scan observed 44,641 render records while loading, 3,205 while scrolling,
207,051 during the three streamed continuations, and 1,336 while typing. The
settled long conversation produced only 26 render records during its
three-second idle phase. This points away from a continuous React rerender loop
as the source of settled-idle work, but shows a very large amount of React work
during streaming.

React Scan materially perturbed the workload. During continuation, Chromium
script time increased from 3,540 ms to 11,618 ms and task time increased from
9,797 ms to 13,856 ms. Its instrumented production-build timings were reported
as zero and many component names were minified. Therefore the raw run is the
performance baseline; React Scan is useful here only for comparative render
counts and for narrowing a follow-up development-build profile.

## Interpretation

This run supports the report that long LibreChat conversations can sustain high
frontend work while loading, scrolling, and streaming. It does not prove that
ordinary LibreChat use consumes more energy than other apps, and it cannot
measure iPhone thermals or Mobile Safari behavior.

The largest scaling signal is the document size: after progressive mounting
settles, all 300 rows remain mounted at roughly 120,000 DOM nodes. The current
progressive-row strategy optimizes the first commit but deliberately converges
to the complete DOM. A real-device Safari energy trace and a controlled A/B
against a bounded/virtualized message DOM are the next tests needed to connect
this browser result to phone heating.
