#!/usr/bin/env bash
# Measures the escape rate. A single run proves nothing — this is a race.
#   ./measure.sh [runs]   (default 20)
cd "$(dirname "$0")"
N=${1:-20}
ok=0; esc=0
for _ in $(seq 1 "$N"); do
  if baml run -e 'main()' 2>&1 | tail -1 | grep -qx "8"; then ok=$((ok+1)); else esc=$((esc+1)); fi
done
echo "caught=$ok escaped=$esc of $N   (expected 8 = fine(1) + caught Bad{offset:7})"
