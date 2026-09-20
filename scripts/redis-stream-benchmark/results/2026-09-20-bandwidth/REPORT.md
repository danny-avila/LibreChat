# Does ordered streaming need another Redis optimization?

## Recommendation

**No production change is justified as a requirement by the evidence we have.** Keep the merged
ordered EVAL implementation and default coalescing. Do not make a new executor a release dependency.

The follow-up does establish a conditional benefit: when an explicitly imposed upstream bandwidth
budget is low enough to constrain this workload, removing Lua bodies can reduce delivery lag.
That is not proof that a real deployment has this bottleneck, nor that the unsafe stable-cache
SHA diagnostic should be shipped. Live AWS/Azure validation is deferred at the maintainer's request.

## Experiment

This extends the earlier latency matrix rather than overwriting it. Same real manager, store,
transport, subscriber, midpoint durable barrier, and terminal path; synthetic provider traffic.

- Application source remains `5afee47dff90d09bdec5d192a6c5254d0c7846b2` (merged #16116).
- Checkout at measurement: `e8269bf6fd7983565db0706a6375f30e4e9ef697`, with benchmark-only changes.
  Every slice records the same harness source-diff SHA256:
  `deac0e12c0534277aa3c4e2d9134142648558805b5451b1d7a92d7b2c027918b`.
- 16 streams, coalescing 25 ms, injected one-way latency 1 ms. Measured idle PING RTT approximately
  2.6–2.9 ms. No TLS, replicas, Cluster, or cloud service is involved.
- Paced: 256 deltas per stream at 20 ms intervals, about five seconds of offered input.
- Burst: 1,024 deltas per stream, 16,384 total. This is longer than the first burst test, not a soak.
- Shared upstream budgets: unlimited, 1 MiB/s, 10 MiB/s. These are **sensitivity points**, not
  measured deployment limits or service-tier specifications. Downstream has latency only.
- 36 samples: 3 budgets × 2 workloads × 2 execution modes × 3 serial repetitions. Mode order
  reverses in the middle repetition. Warm-up and calibration are outside measured work.
- Node 24.16.0 / Redis 7.4.11. Same shared worker as the earlier evidence; no CPU pinning.

The shaper reserves serialization time across both client connections in bounded 16 KiB chunks.
A single FIFO drain preserves upstream TCP byte order. This is an application-level model: Node
timer jitter may release overdue chunks together, and socket buffering is not a physical network.
The fixture records queued bytes separately from application memory. Two simultaneous Redis
connections calibrate each limited slice with roughly 250 ms worth of upstream payload.
Calibration timing and raw measurements are included.

## Results

Medians of three per-run metrics; p99 values are not pooled across runs.

### Paced traffic

| Shared upstream budget | EVAL events/s | SHA diagnostic events/s | EVAL delivery p99 | SHA delivery p99 | Upstream bytes saved |
| ---------------------- | ------------: | ----------------------: | ----------------: | ---------------: | -------------------: |
| Unlimited              |           801 |                     801 |          30.26 ms |         30.10 ms |                66.4% |
| 1 MiB/s                |           653 |                     797 |       2,094.95 ms |         56.88 ms |                49.7% |
| 10 MiB/s               |           800 |                     801 |          37.50 ms |         33.76 ms |                66.4% |

At 1 MiB/s the result is repeatable: EVAL p99 ranged 2,094.66–2,095.82 ms across runs, versus
56.28–59.47 ms for the diagnostic. The unconstrained EVAL workload sends approximately 9.84 MB
in about five seconds, so deliberately limiting it to approximately 1.05 MB/s makes a queue
unsurprising. There is no claim that this link budget represents our users' actual deployments.

Under that constraint, the production backpressure/batching behavior also changes: median
logical Lua calls were 2,476 for EVAL and 4,144 for the diagnostic. Consequently, the byte saving
is not just a constant per-command subtraction. It is the outcome of the whole measured flow.
The low-budget paced proxy queue peaked around 2.27 MB for EVAL and 36 KB for SHA. Those numbers
are **fixture buffers**, not a proof of application memory growth or bounded memory.

### Bursts

| Shared upstream budget | EVAL events/s | SHA diagnostic events/s | EVAL delivery p99 | SHA delivery p99 | Upstream bytes saved |
| ---------------------- | ------------: | ----------------------: | ----------------: | ---------------: | -------------------: |
| Unlimited              |        52,334 |                  67,734 |          89.67 ms |         68.05 ms |                11.1% |
| 1 MiB/s                |         2,072 |                   2,328 |       1,933.44 ms |      1,741.45 ms |                11.1% |
| 10 MiB/s               |        19,348 |                  21,427 |         226.55 ms |        196.59 ms |                11.1% |

The unlimited burst ranges overlap: EVAL 52,090–70,977 events/s; SHA 52,276–68,619. Do not
advertise the median difference as a reliable gain. Rate-limited runs consistently favor the
lower-byte diagnostic, while batching already amortizes most script overhead. Both burst modes
issued 592 logical Lua commands. Raw CPU, memory, scheduling lag, and terminal metrics are retained
in the samples and summaries rather than reduced to a blanket speedup claim.

## Fixture failure and exclusions

The initial bandwidth fixture used independent per-chunk timers. One repetition failed with a
Redis reply-type mismatch (`durable.map is not a function`), consistent with timers allowing
command chunks to be forwarded out of order. This was a benchmark failure, not accepted evidence
of a production defect. All samples using that timer design were discarded from this report.
An intervening attempted patch failed to apply; its run was also excluded.

The final fixture uses one FIFO drain and has a dedicated real-Redis contract test: two clients
issue mixed-size commands concurrently, and every command reply and final list entry must match
its expected position. That test passed. All nine reportable slices were then rerun on the same
corrected harness. Every one of their 36 scenarios passed exact live-delivery and durable-log-order
assertions. No successful rows from the rejected fixture were mixed into these summaries.

## What would change the recommendation?

A real deployment showing sustained upstream saturation, Redis CPU capacity pressure attributable
to repeated script bodies, or a delivery-latency target the current implementation cannot meet
would justify a safe optimization prototype. We do not have those observations here. A synthetic
bottleneck can demonstrate sensitivity, but it cannot establish product need by itself.

Until then:

1. Keep direct EVAL for ordered streaming and the already merged atomic-claim optimization.
2. Do not ship this preloaded SHA diagnostic: it still has no safe cache-loss recovery design.
3. Retain the opt-in benchmark for regression/sensitivity testing. Further tests should answer
   a concrete capacity question, not become an endless prerequisite for an unneeded rewrite.
4. Defer live AWS/Azure work. It is not necessary to decide whether to leave working code alone.

## Validation and remaining scope

- 36 reportable bandwidth-profile scenarios passed, plus the earlier 144-scenario evidence.
- FIFO shaper contract and six two-client rate calibrations passed.
- Original latency summary still reproduces; missing, duplicate, wrong-dimension, and wrong-event-count matrices were tested and rejected.
- Focused redisScript, redisTelemetry, RedisJobStore, and RedisEventTransport unit suites: 101 passed.
- API `npx tsc --noEmit`, touched-file static gates, Bash syntax, backward-compatible latency smoke, and FIFO fixture contract: passed.
- This report does not claim zero regressions, cloud compatibility, failover correctness of the
  SHA diagnostic, or production soak results. All runtime changes are confined to manual tests.
- Cluster performance, actual service/network measurements, TLS, fault injection, long soak,
  local browser/Playwright, and local Lighthouse are not part of this follow-up. Cloud deferred.
