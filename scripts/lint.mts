import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dirname, extname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = '.js,.jsx,.ts,.tsx';
const SOURCE_EXTENSIONS = new Set(EXTENSIONS.split(','));
const EXCLUDED_DEFAULT_EXTENSIONS = ['**/*.cjs', '**/*.mjs'];
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'venv']);
const SOURCE_DIRECTORIES = [
  'api',
  'client',
  'e2e',
  'config',
  'baml_ts',
  'src',
  'packages/api',
  'packages/client',
  'packages/data-provider',
  'packages/data-schemas',
];

const cliArgs = process.argv.slice(2);
const fix = cliArgs.length === 1 && cliArgs[0] === '--fix';

if (cliArgs.length > 0 && !fix) {
  throw new Error(`Unsupported lint arguments: ${cliArgs.join(' ')}`);
}

const eslintPackagePath = fileURLToPath(import.meta.resolve('eslint/package.json'));
const eslintBin = resolve(dirname(eslintPackagePath), 'bin/eslint.js');

function hasLintableFile(directory: string): boolean {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      return true;
    }

    if (
      entry.isDirectory() &&
      !EXCLUDED_DIRECTORIES.has(entry.name) &&
      hasLintableFile(resolve(directory, entry.name))
    ) {
      return true;
    }
  }

  return false;
}

const rootFiles = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)))
  .map((entry) => entry.name);
for (const directory of SOURCE_DIRECTORIES) {
  if (!hasLintableFile(resolve(ROOT, directory))) {
    throw new Error(`No lintable files found in source partition: ${directory}`);
  }
}

const partitions = [
  ...(rootFiles.length > 0 ? [{ label: 'repository root', targets: rootFiles }] : []),
  ...SOURCE_DIRECTORIES.map((directory) => ({ label: directory, targets: [directory] })),
];

const failedPartitions: string[] = [];

for (const { label, targets } of partitions) {
  const ignoreArgs = EXCLUDED_DEFAULT_EXTENSIONS.flatMap((pattern) => [
    '--ignore-pattern',
    pattern,
  ]);
  const args = [
    eslintBin,
    '--ext',
    EXTENSIONS,
    ...ignoreArgs,
    ...(fix ? ['--fix'] : []),
    ...targets,
  ];
  process.stdout.write(`\n> eslint ${args.slice(1).join(' ')}\n`);

  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error != null) {
    throw result.error;
  }

  if (result.status !== 0) {
    failedPartitions.push(label);
  }
}

if (failedPartitions.length > 0) {
  process.stderr.write(`\nLint failed in: ${failedPartitions.join(', ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\nLint passed across ${partitions.length} source partitions.\n`);
}
