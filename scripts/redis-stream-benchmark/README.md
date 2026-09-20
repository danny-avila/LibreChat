# Redis streaming evidence

This is an **opt-in benchmark**, not a production optimization. It measures synthetic provider
traffic through the real `GenerationJobManagerClass`, `RedisJobStore`, and
`RedisEventTransport`, including durable writes and a live subscriber. It never connects to a
configured `REDIS_URI`: the fixture starts its own Redis process with persistence disabled and
puts both application connections behind a loopback latency proxy.

## Reproduce

Use the repository's Node version and locked dependencies. Build data-provider and data-schemas
as usual before running the API tests. Supply a local Redis executable; no Redis service needs
to be running. The runner uses Bash, `realpath`, Python 3, npm, and the existing Jest tools.

```bash
REDIS_BENCH_BINARY="$(command -v redis-server)" \
  bash scripts/redis-stream-benchmark/run.sh .review/redis-stream-benchmark
```

Run slices **serially**, not alongside another benchmark, test suite, or build on the same host.
A smoke run exercises the fixture and assertions with fewer events:

```bash
RUN_REDIS_STREAM_BENCHMARK=true REDIS_BENCH_SMOKE=true \
REDIS_BENCH_BINARY="$(command -v redis-server)" \
REDIS_BENCH_OUTPUT="$PWD/.review/redis-stream-smoke" \
  npm exec --workspace=@librechat/api -- jest --runInBand --coverage=false \
    --testPathIgnorePatterns=node_modules \
    --testPathPatterns=redisStreaming.perf_benchmark.manual
```

The `.manual.spec.ts` suffix excludes the benchmark from default test runs. The environment
opt-in is also required. The whole matrix may take several minutes. Each slice starts and stops
its own server. Results contain no configured Redis endpoints or credentials.

## Matrix and measurement boundary

- Baseline: unchanged direct `EVAL` in the checked-out streaming implementation.
- Diagnostic: benchmark-only replacement of `eval` with preloaded `evalsha` on the same client.
  It retains the same Lua bodies, arguments, application batching, and caller awaits. **There is
  no NOSCRIPT fallback or ordering queue. It is not deployable and not a correctness design.**
- Coalescing: explicit `0` and `25` milliseconds.
- Concurrent streams: `1` and `16`, each with one subscribed consumer.
- Proxy delay per direction: `0`, `1`, and `5` milliseconds; each sample measures actual PING RTT.
- Paced input: 64 text deltas per stream, scheduled every 20 ms (synthetic 50 events/s).
- Burst input: 256 text deltas per stream, as fast as the manager accepts them.
- Each delta carries 64 text bytes plus its event envelope. One midpoint delta uses the real
  durable-event barrier, then each stream flushes pending work and publishes a terminal event.
- Three repetitions; execution-mode order reverses in the middle repetition. Warm-up and script
  preload are excluded. All event deliveries and durable log entries must match exactly in order.

The setup creates jobs, attaches subscribers, and seeds run-step state outside measurement.
Timed work begins at the provider schedule, includes manager calls, Redis work, terminal
publication and receipt, and ends when all deltas and terminal notifications arrive. Durable-log
verification runs after the timer stops. This is not an HTTP/SSE or LLM benchmark.

## Reading the metrics

- `eventsPerSecond`: delivered deltas divided by measured completion time. For paced input this
  is usually limited by the configured provider rate, not server capacity.
- `deliveryP99Ms`: issue-to-subscriber latency. `scheduledP99Ms` additionally captures time the
  synthetic provider falls behind its schedule; use both to avoid hiding producer backpressure.
- `emitP99Ms`, `barrierP95Ms`, `terminalP95Ms`: manager call, midpoint barrier, and terminal receipt
  timings. Low `emitP99Ms` with coalescing does not mean the event has already reached Redis.
- `sentBytes`/`receivedBytes`: actual plaintext bytes crossing the application's proxy connections,
  including protocol framing and subscriber traffic. No TLS, IP/TCP overhead, replication, or
  bandwidth cap is simulated. `transmittedScriptBytes` counts script bodies or SHA strings only.
- `evalCalls`: logical script invocations, before diagnostic substitution. Redis INFO
  `redisCommands` also includes Lua-internal commands and the INFO observation overhead; it is
  not a network round-trip count.
- CPU: Node process CPU includes Jest, manager, clients, and proxy; Redis process CPU comes from
  INFO deltas. Both are CPU milliseconds, not utilization percentages.
- Memory: Node heap/RSS sampled every 10 ms; Redis memory is end minus start, not a peak. These
  include allocator/GC effects, may be negative, and do **not** prove bounded memory under stalls.
- Summaries are medians of three per-run metrics, with min/max in JSON. Tail percentiles are not
  pooled. Three runs on a shared worker are exploratory evidence, not a statistical SLA.

`summarize.py` requires all 144 distinct samples and rejects incomplete or duplicate matrices.
It writes `summary.csv` and `summary.json`. Read the per-run `samples.jsonl` and `metadata.json`
for provenance and variability.

## Limits

No cache flush/failover occurs during timed measurement. The stable-cache diagnostic estimates
what removing script-body transmission could buy without charging the cost of a safe recovery
design. It does not demonstrate that such a design exists. This run does not measure Redis
Cluster, managed AWS/Azure services, TLS, bandwidth saturation, long generations, many replicas,
loss/retry ambiguity, or user-visible browser behavior. No production code is changed.

The first measured results and recommendation are in `results/2026-09-20/REPORT.md`.

## Local bandwidth sensitivity follow-up

Live AWS/Azure tests are deferred. To ask whether script transmission becomes material under
restricted bandwidth, the same harness supports a separate, explicitly synthetic profile:

```bash
REDIS_BENCH_BINARY="$(command -v redis-server)" \
  bash scripts/redis-stream-benchmark/run.sh .review/redis-bandwidth bandwidth
```

This profile uses 16 streams, 25 ms coalescing, 1 ms injected one-way latency, and shared
upstream budgets of unlimited, 1 MiB/s, and 10 MiB/s. Those budgets are sensitivity points,
**not measured production network limits**. Paced runs contain 256 events per stream (about
five seconds of offered input); bursts contain 1,024. Every configuration has three serial
repetitions. The profile has 36 samples and is summarized separately from the latency matrix.
It remains a short experiment, not a soak test.

A FIFO scheduler reserves upstream serialization time in chunks of at most 16 KiB across all
proxy connections. Responses/subscriber traffic have only the latency delay, no bandwidth cap.
The rate is an application-level approximation, not packet-level network emulation: Node timer
jitter can release overdue chunks together, and destination socket buffering is not modeled.
`peakProxyQueuedBytes` describes bytes waiting inside this fixture, **not** the application's
outstanding receipt queue or a production memory bound.

Before each rate-limited slice, two concurrent Redis connections transfer a combined payload
of approximately one quarter of the configured bytes/second budget. The observed duration must
be at least 90% of its serialized budget and below twice that budget plus 50 ms. Calibration
results are retained with the samples. This checks that the rate limit is shared and active;
it does not certify fidelity under arbitrary congestion.

The original latency-only profile and results are preserved. Harness changes are identified by
a source-diff hash in the new metadata alongside the checkout commit. Use the matching PR
revision to reproduce the experiment. A stable-cache SHA advantage under an imposed bottleneck
is evidence of sensitivity, not proof that our deployments need another execution mechanism.

Follow-up findings, exclusions, and raw samples are in
`results/2026-09-20-bandwidth/REPORT.md`. The standalone FIFO fixture regression can be run with
`--testPathPatterns=redisBandwidth.perf_benchmark.manual` using the same opt-in variables. The
original latency report remains a historical result; the follow-up is a separate profile.
