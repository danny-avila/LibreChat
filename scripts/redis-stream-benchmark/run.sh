#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${REDIS_BENCH_BINARY:?Set REDIS_BENCH_BINARY to a local redis-server executable}"
binary=$(realpath "$REDIS_BENCH_BINARY")
output=$(realpath -m "${1:-.review/redis-stream-benchmark}")
profile=${2:-latency}
case "$profile" in
  latency) dimensions=(0 1 5);;
  bandwidth) dimensions=(0 1048576 10485760);;
  *) echo "Profile must be latency or bandwidth" >&2; exit 1;;
esac
mkdir -p "$output"
# Do not parallelize slices: they measure CPU and latency on the same host.
for dimension in "${dimensions[@]}"; do
  if [[ "$profile" == bandwidth ]]; then delay=1; budget=$dimension; prefix=b; else delay=$dimension; budget=0; prefix=d; fi
  for repetition in 0 1 2; do
    name="${prefix}${dimension}-r${repetition}"
    RUN_REDIS_STREAM_BENCHMARK=true REDIS_BENCH_SMOKE=false \
      REDIS_BENCH_PROFILE="$profile" \
      REDIS_BENCH_UPSTREAM_BYTES_PER_SECOND="$budget" \
      REDIS_BENCH_ONE_WAY_MS="$delay" \
      REDIS_BENCH_REPETITION="$repetition" \
      REDIS_BENCH_BINARY="$binary" \
      REDIS_BENCH_OUTPUT="$output/$name" \
      npm exec --workspace=@librechat/api -- jest --runInBand --coverage=false \
        --testPathIgnorePatterns=node_modules \
        --testPathPatterns=redisStreaming.perf_benchmark.manual > "$output/$name.log" 2>&1
    tail -12 "$output/$name.log"
  done
done
python3 scripts/redis-stream-benchmark/summarize.py "$output" "$profile"
