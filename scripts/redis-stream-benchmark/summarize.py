"""Summarize paired, serial runs. No third-party dependencies or pooled percentiles."""
import csv
import json
import itertools
import statistics
import sys
from pathlib import Path

root = Path(sys.argv[1])
bandwidth = len(sys.argv) > 2 and sys.argv[2] == 'bandwidth'
pattern = 'b*-r*/samples.jsonl' if bandwidth else 'd*-r*/samples.jsonl'
rows = [json.loads(line) for file in sorted(root.glob(pattern))
        for line in file.read_text().splitlines()]
keys = ['oneWayMs', 'streams', 'workload', 'windowMs', 'mode']
if bandwidth:
    keys.insert(0, 'upstreamBytesPerSecond')
metrics = ['measuredRttMs', 'elapsedMs', 'eventsPerSecond', 'deliveryP50Ms', 'deliveryP95Ms',
           'deliveryP99Ms', 'scheduledP99Ms', 'emitP99Ms', 'barrierP95Ms', 'terminalP95Ms',
           'evalCalls', 'transmittedScriptBytes', 'sentBytes', 'receivedBytes', 'redisCommands',
           'nodeCpuMs', 'redisCpuMs', 'heapDeltaBytes', 'peakHeapDeltaBytes',
           'peakRssDeltaBytes', 'redisMemoryDeltaBytes', 'eventLoopP99Ms', 'peakActiveEmissions']
if bandwidth:
    metrics.append('peakProxyQueuedBytes')
groups = {}
identities = set()
for row in rows:
    expected_events = (256 if row['workload'] == 'paced' else 1024) if bandwidth else (64 if row['workload'] == 'paced' else 256)
    if row['events'] != expected_events * row['streams']:
        raise ValueError('Sample event count does not match the selected profile')
    if not bandwidth and row.get('upstreamBytesPerSecond', 0) != 0:
        raise ValueError('Rate-limited samples cannot enter the latency-only summary')
    key = tuple(row[k] for k in keys)
    identity = (*key, row['repetition'])
    if identity in identities:
        raise ValueError(f'Duplicate sample: {identity}')
    identities.add(identity)
    groups.setdefault(key, []).append(row)
dimensions = [[0, 1, 5], [1, 16], ['paced', 'burst'], [0, 25], ['eval', 'warm-sha-diagnostic'], range(3)]
if bandwidth:
    dimensions = [[0, 1048576, 10485760], [1], [16], ['paced', 'burst'], [25], ['eval', 'warm-sha-diagnostic'], range(3)]
expected = set(itertools.product(*dimensions))
if identities != expected:
    raise ValueError(f'Invalid matrix: {len(expected - identities)} missing, {len(identities - expected)} unexpected samples')
summary = []
for key, group in sorted(groups.items()):
    item = dict(zip(keys, key))
    item['repeats'] = len(group)
    for metric in metrics:
        values = [r[metric] for r in group]
        item[metric] = statistics.median(values)
        item[metric + 'Min'] = min(values)
        item[metric + 'Max'] = max(values)
    summary.append(item)
(root / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
with (root / 'summary.csv').open('w') as f:
    writer = csv.DictWriter(f, fieldnames=[*keys, 'repeats', *metrics], extrasaction='ignore', lineterminator='\n')
    writer.writeheader()
    writer.writerows(summary)
print(f'{len(rows)} samples validated; {len(summary)} median groups. Per-run tail percentiles are not pooled.')
print(('upstream_Bps' if bandwidth else 'delay') + ' streams workload window eval_events/s sha_events/s eval_p99 sha_p99 sent_saved_pct')
for row in summary:
    if row['mode'] != 'eval':
        continue
    sha = next(r for r in summary if all(r[k] == row[k] for k in keys[:-1]) and r['mode'] == 'warm-sha-diagnostic')
    print(row['upstreamBytesPerSecond'] if bandwidth else row['oneWayMs'], row['streams'], row['workload'], row['windowMs'],
          round(row['eventsPerSecond']), round(sha['eventsPerSecond']),
          round(row['deliveryP99Ms'], 2), round(sha['deliveryP99Ms'], 2),
          round(100 * (1 - sha['sentBytes'] / row['sentBytes']), 1))
