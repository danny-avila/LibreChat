const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const taskJsonChecks = [
  {
    file: 'td-register-fixed.json',
    family: 'librechat-task',
    cpu: '512',
    memory: '1024',
    required: false,
  },
  {
    file: 'taskdef-manualfix2.json',
    family: 'librechat-task',
    cpu: '512',
    memory: '1024',
    required: true,
  },
];

const errors = [];

for (const check of taskJsonChecks) {
  const filePath = path.join(repoRoot, check.file);
  if (!fs.existsSync(filePath)) {
    if (check.required) {
      errors.push(`ERROR: required task definition file is missing: ${check.file}`);
    }
    continue;
  }

  const taskDef = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const cpu = String(taskDef.cpu);
  const memory = String(taskDef.memory);

  if (taskDef.family !== check.family || cpu !== check.cpu || memory !== check.memory) {
    errors.push(
      `ERROR: ${check.family} expected cpu=${check.cpu} memory=${check.memory} but found cpu=${cpu} memory=${memory} in ${check.file}`,
    );
  }
}

const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci-cd.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const workflowCpu = workflow.match(/^\s*TASK_CPU:\s*['"]?(\d+)['"]?\s*$/m)?.[1];
const workflowMemory = workflow.match(/^\s*TASK_MEMORY:\s*['"]?(\d+)['"]?\s*$/m)?.[1];

if (workflowCpu !== '512' || workflowMemory !== '1024') {
  errors.push(
    `ERROR: librechat-task expected cpu=512 memory=1024 but found cpu=${workflowCpu ?? 'missing'} memory=${workflowMemory ?? 'missing'} in .github/workflows/ci-cd.yml`,
  );
}

const ecsParamsPath = path.join(repoRoot, 'ecs-params.yml');
const ecsParams = fs.readFileSync(ecsParamsPath, 'utf8');
const ecsCpu = ecsParams.match(/^\s*cpu_limit:\s*(\d+)\s*$/m)?.[1];
const ecsMemory = ecsParams.match(/^\s*mem_limit:\s*(\d+)m\s*$/m)?.[1];
const ecsApiCpu = ecsParams.match(/^\s*cpu_shares:\s*(\d+)\s*$/m)?.[1];
const ecsApiMemory = ecsParams.match(/^\s*mem_limit:\s*(\d+)m\s*$/m)?.[1];

if (ecsCpu !== '512' || ecsMemory !== '1024' || ecsApiCpu !== '512' || ecsApiMemory !== '1024') {
  errors.push(
    `ERROR: librechat-task expected cpu=512 memory=1024 but found task cpu=${ecsCpu ?? 'missing'} memory=${ecsMemory ?? 'missing'} and service cpu=${ecsApiCpu ?? 'missing'} memory=${ecsApiMemory ?? 'missing'} in ecs-params.yml`,
  );
}

const scanExtensions = new Set(['.json', '.yml', '.yaml']);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!scanExtensions.has(path.extname(entry.name))) {
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes('rag_api-task')) {
      continue;
    }

    const cpu = content.match(/^\s*"cpu"\s*:\s*"?([0-9]+)"?\s*,?\s*$/m)?.[1]
      ?? content.match(/^\s*cpu_limit:\s*(\d+)\s*$/m)?.[1];
    const memory = content.match(/^\s*"memory"\s*:\s*"?([0-9]+)"?\s*,?\s*$/m)?.[1]
      ?? content.match(/^\s*mem_limit:\s*(\d+)m\s*$/m)?.[1];

    if (cpu !== '1024' || memory !== '2048') {
      errors.push(
        `ERROR: rag_api-task expected cpu=1024 memory=2048 but found cpu=${cpu ?? 'missing'} memory=${memory ?? 'missing'} in ${path.relative(repoRoot, fullPath)}`,
      );
    }
  }
}

walk(repoRoot);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log('ECS task sizing validation passed.');
