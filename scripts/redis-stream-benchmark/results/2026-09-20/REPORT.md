# First Redis streaming evidence

## Decision

**Do not implement a new ordered-script executor on this evidence alone.** Script-body
transmission is a measurable bandwidth and Redis CPU cost, but removing it did not produce a
consistent throughput or delivery-latency improvement with the default coalescing behavior.
The next useful experiment is bandwidth-limited, deployment-representative traffic, not another
production rewrite. Keep the current ordered `EVAL` path while that question is measured.

This is a baseline and a diagnostic experiment, not a proposed safe `EVALSHA` implementation.
The diagnostic deliberately excludes cache loss, failover, and the cost of preserving order
through recovery. Successful ordered runs here say nothing about those missing failure modes.

## Provenance and scope

- Application source: `5afee47dff90d09bdec5d192a6c5254d0c7846b2`, merged #16116 on `dev`.
- Graph navigation: `dev` at `16a7e116efdd8301027f4bc858541cef0ce6c363`; that snapshot was behind
  the checkout. Source reads and runs used the newer application commit above. Graph caller
  edges located the emission flow; they were not used as behavioral or performance proof.
- Node 24.16.0, Redis 7.4.11, Intel Xeon Platinum 8488C worker, 16 available CPUs.
- 144 measured scenarios: 24 workload configurations, two execution modes, three repetitions.
  Separate smoke runs are excluded. Samples ran serially; the host was not a dedicated,
  CPU-pinned performance machine. Per-slice metadata includes host load averages.
- Median measured PING RTT by injected delay: **0.36 / 2.69 / 10.96 ms**.
- Actual manager, store, transport, and subscriber; synthetic provider input, no HTTP/browser/LLM.
- Coalescing 0/25 ms; 1/16 streams; paced 64 deltas at 20 ms intervals and burst 256 deltas per
  stream; 64 text bytes/delta; midpoint durable barrier and terminal publication.
- Job creation, subscription, run-step warm-up, script preloading, and teardown are not timed.
  Measurements include waiting for all deltas and terminal notifications. All runs assert exact
  live delivery and durable replay order and fail on missing/duplicate events or subscriber errors.

Every summary number below is a median of three per-run metrics. Full min/max values are in
`summary.json`. A median of per-run p99 values is not a pooled p99 or an SLA estimate.

## Default coalescing: 16 concurrent streams

### Paced input (synthetic provider offers 800 events/s total)

| Measured RTT group | EVAL events/s | Warm SHA events/s | EVAL delivery p99 | Warm SHA delivery p99 | Upstream bytes saved |
| ------------------ | ------------: | ----------------: | ----------------: | --------------------: | -------------------: |
| 0.36 ms            |           809 |               810 |          28.45 ms |              28.56 ms |                66.9% |
| 2.69 ms            |           806 |               806 |          30.32 ms |              30.12 ms |                66.8% |
| 10.96 ms           |           791 |               791 |          38.86 ms |              38.08 ms |                66.8% |

In the highest-RTT group, the request stream shrank from **2.446 MiB to 0.811 MiB** per measured
run. Redis CPU decreased from **27.29 ms to 24.05 ms**. The traffic reduction is real, but this
provider-paced workload did not become meaningfully faster. These throughput numbers are
provider-limited, not Redis capacity measurements.

### Burst input (4,096 deltas plus barriers/terminal work per run)

| Measured RTT group | EVAL events/s | Warm SHA events/s | EVAL delivery p99 | Warm SHA delivery p99 | Upstream bytes saved |
| ------------------ | ------------: | ----------------: | ----------------: | --------------------: | -------------------: |
| 0.36 ms            |        44,139 |            61,140 |          45.19 ms |              25.39 ms |                14.3% |
| 2.69 ms            |        40,177 |            53,665 |          47.74 ms |              28.71 ms |                14.3% |
| 10.96 ms           |        37,300 |            35,065 |          40.20 ms |              42.34 ms |                14.3% |

The low/mid-RTT medians look favorable, but their ranges overlap and CPU/GC variability is large.
For example, loopback EVAL throughput ranged **41,804–67,873 events/s**; diagnostic SHA ranged
**43,155–65,239**. Node CPU for those short runs ranged approximately **83–332 ms** and
**83–336 ms**, respectively. The highest-RTT result does not show a gain. These results do not
support advertising a reliable burst-speed improvement.

Existing batching amortizes script bodies: at the highest RTT the request stream shrank from
**2.069 MiB to 1.773 MiB**, while Redis CPU changed from **17.72 ms to 16.42 ms**. Both modes
issued **208 logical Lua invocations**. The corresponding paced configuration issued 1,104 in
both modes; caching changed bytes, not the application’s invocation count.

## Coalescing matters more than script caching in the RTT-limited case

At the highest RTT, a single stream without coalescing delivered a burst at **88 events/s** in
both modes, despite about **81% less upstream traffic** with SHA. With default coalescing,
the baseline delivered **4,085 events/s**. This compares the existing two batching settings,
not an optimization introduced by this branch. It also changes delivery latency and buffering;
it is not a recommendation to increase the coalescing window.

Without coalescing, the 16-stream high-RTT burst consumed **185.29 ms Redis CPU** using EVAL
versus **130.52 ms** with SHA, but throughput remained approximately **1,343 vs 1,334 events/s**.
Lower CPU/traffic is a potential capacity benefit; it is not evidence of lower user latency here.

There are counterexamples to a universal SHA speedup: loopback uncoalesced 16-stream burst
throughput was **15,050 vs 11,451 events/s**. Do not cherry-pick only favorable rows.

## Memory and correctness interpretation

Heap/RSS samples and Redis memory deltas are retained in the raw data. Their allocator/GC
variability and short duration do not establish a memory regression or prove bounded memory
under sustained load. In particular, negative end-minus-start values are not “negative cost.”
Node CPU and memory also include the Jest harness and the TCP delay proxy.

All 144 scenarios passed exact subscriber-order and durable-log-order checks, including the
midpoint durable barrier and terminal notification. This proves the measured stable-cache
experiment completed correctly for these inputs. It does **not** validate the diagnostic after
NOSCRIPT, lost replies, restart, promotion, resharding, or mixed-version rollout.

## Next experiment and stop/go criteria

1. Obtain representative deployment bandwidth constraints, stream concurrency, and provider
   event sizes/rates. The measurements above are fixtures, not production traffic observations.
2. Add bounded bandwidth shaping and run longer, isolated-process repetitions. Separate proxy
   CPU from application CPU and collect sustained queue/memory behavior before making capacity
   claims. Do not extrapolate this 16-stream worker run to an untested concurrency target.
3. Only prototype a safe cached/batched executor if a deployment-relevant case shows script
   transmission materially constraining throughput, latency, CPU capacity, or network cost.
4. Charge any candidate for its real recovery/ordering mechanism. A stable-cache diagnostic
   with no fallback is not an acceptable production baseline. Retain restart/promotion, stale
   generation, mixed-version, and exact-order contracts in that later design.

If representative deployments are RTT-limited with coalescing enabled and comfortable network
headroom, leave ordered EVAL alone. If bandwidth or CPU is limiting, the measured savings give a
specific reason to explore optimization, rather than assuming that fewer bytes always means
faster chats.

## Verification and exclusions

- Manual matrix: nine successful slice runs, 144 scenarios; smoke matrix also passed.
- Focused redisScript, redisTelemetry, RedisJobStore, RedisEventTransport unit suites: 101 passed.
- API `npx tsc --noEmit`: passed.
- Touched-file ESLint, Prettier, import sorting, circular-dependency checks: passed.
- Runner Bash syntax and summarizer Python syntax: passed; incomplete matrix rejected.
- Default Jest discovery excludes the manual benchmark: verified.
- No production source changes. No managed service or shared Redis instance was used.
- Not run for this evidence: Redis Cluster performance, AWS/Azure deployment tests, TLS,
  bandwidth saturation, long-duration soak, fault injection, browser/Playwright, or Lighthouse.
- No independent performance review or exact-head CI result is claimed here.

Raw data and reproduction instructions accompany this report; no production optimization or
merge-readiness conclusion should be inferred from the existence of the benchmark.
