"""Summarize paired, serial runs. No third-party dependencies or pooled percentiles."""
import csv
import json
import statistics
import sys
from pathlib import Path

root = Path(sys.argv[1])
rows = [json.loads(line) for file in sorted(root.glob('d*-r*/samples.jsonl'))
        for line in file.read_text().splitlines()]
keys = ['oneWayMs', 'streams', 'workload', 'windowMs', 'mode']
metrics = ['measuredRttMs', 'elapsedMs', 'eventsPerSecond', 'deliveryP50Ms', 'deliveryP95Ms',
           'deliveryP99Ms', 'scheduledP99Ms', 'emitP99Ms', 'barrierP95Ms', 'terminalP95Ms',
           'evalCalls', 'transmittedScriptBytes', 'sentBytes', 'receivedBytes', 'redisCommands',
           'nodeCpuMs', 'redisCpuMs', 'heapDeltaBytes', 'peakHeapDeltaBytes',
           'peakRssDeltaBytes', 'redisMemoryDeltaBytes', 'eventLoopP99Ms', 'peakActiveEmissions']
groups = {}
identities = set()
for row in rows:
    key = tuple(row[k] for k in keys)
    identity = (*key, row['repetition'])
    if identity in identities:
        raise ValueError(f'Duplicate sample: {identity}')
    identities.add(identity)
    groups.setdefault(key, []).append(row)
if len(rows) != 144 or len(groups) != 48 or any(len(g) != 3 for g in groups.values()):
    raise ValueError(f'Incomplete matrix: {len(rows)} samples, {len(groups)} groups (expected 144/48)')
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
print('delay streams workload window eval_events/s sha_events/s eval_p99 sha_p99 sent_saved_pct')
for row in summary:
    if row['mode'] != 'eval':
        continue
    sha = next(r for r in summary if all(r[k] == row[k] for k in keys[:-1]) and r['mode'] == 'warm-sha-diagnostic')
    print(row['oneWayMs'], row['streams'], row['workload'], row['windowMs'],
          round(row['eventsPerSecond']), round(sha['eventsPerSecond']),
          round(row['deliveryP99Ms'], 2), round(sha['deliveryP99Ms'], 2),
          round(100 * (1 - sha['sentBytes'] / row['sentBytes']), 1))
