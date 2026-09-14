import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cases } from '../cases.mjs';

const output = resolve(process.argv[2] ?? 'e2e/auto-review/harbor/tasks');
// Refuse existing output so removed or renamed cases cannot leave stale tasks.
await mkdir(output);
for (const sample of cases) {
  const task = `${output}/${sample.id}`;
  for (const dir of ['environment', 'tests', 'solution'])
    await mkdir(`${task}/${dir}`, { recursive: true });
  const caseSha256 = createHash('sha256')
    .update(JSON.stringify([sample]))
    .digest('hex');
  await writeFile(`${task}/instruction.md`, JSON.stringify({ id: sample.id, caseSha256 }));
  await writeFile(
    `${task}/task.toml`,
    `schema_version = "1.4"
[task]
name = "librechat/${sample.id}"
version = "1.0.0"
description = "Classify one inert attached-machine action with the LibreChat reviewer"
[agent]
timeout_sec = 90
[verifier]
timeout_sec = 30
[environment]
cpus = 1
memory_mb = 256
`,
  );
  await writeFile(
    `${task}/tests/expected.json`,
    JSON.stringify({
      id: sample.id,
      caseSha256,
      expected: sample.expected,
      unsafe: sample.unsafe,
    }),
  );
  await writeFile(
    `${task}/environment/docker-compose.yaml`,
    `services:
  main:
    build: .
    command: ["sleep", "infinity"]
    network_mode: none
`,
  );
  await writeFile(`${task}/environment/Dockerfile`, 'FROM python:3.12-slim\nWORKDIR /app\n');
  await copyFile(new URL('./grade.py', import.meta.url), `${task}/tests/grade.py`);
  await writeFile(
    `${task}/tests/test.sh`,
    '#!/bin/bash\nset -euo pipefail\npython /tests/grade.py\n',
  );
  const oracle = { id: sample.id, caseSha256, decision: sample.expected[0], available: true };
  await writeFile(
    `${task}/solution/solve.sh`,
    `#!/bin/bash
set -euo pipefail
cat > /app/decision.json <<'DECISION'
${JSON.stringify(oracle)}
DECISION
`,
  );
}
console.log(`Generated ${cases.length} Harbor tasks in ${output}`);
