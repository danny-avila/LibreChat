#!/usr/bin/env node
/**
 * Restore a deleted directory from git history.
 *
 * Handles uncommitted deletions (restore from HEAD) and committed deletions
 * (restore from the parent of the deletion commit). Use --commit to pick a
 * specific revision instead of auto-detection.
 *
 *   Run:        npm run restore-deleted-dir -- path/to/dir
 *   Dry run:    npm run restore-deleted-dir -- path/to/dir --dry-run
 *   From commit: npm run restore-deleted-dir -- path/to/dir --commit abc1234
 *   History:    npm run restore-deleted-dir -- path/to/dir --list
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface CliOptions {
  path: string | null;
  commit: string | null;
  ref: string;
  dryRun: boolean;
  list: boolean;
  force: boolean;
  help: boolean;
}

interface DeletionRecord {
  hash: string;
  date: string;
  subject: string;
}

function git(args: string[], cwd: string): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? '';
    throw new Error(stderr || `git ${args.join(' ')} failed`);
  }

  return result.stdout.trimEnd();
}

function gitLines(args: string[], cwd: string): string[] {
  const output = git(args, cwd);
  return output === '' ? [] : output.split('\n');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    path: null,
    commit: null,
    ref: 'HEAD',
    dryRun: false,
    list: false,
    force: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--list') {
      options.list = true;
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--commit') {
      const value = argv[++i];
      if (!value) throw new Error('--commit requires a revision');
      options.commit = value;
      continue;
    }
    if (arg === '--ref') {
      const value = argv[++i];
      if (!value) throw new Error('--ref requires a revision');
      options.ref = value;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (options.path !== null) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    options.path = arg;
  }

  return options;
}

function printHelp(): void {
  console.log(`restore-deleted-dir — restore a deleted directory from git history

Usage:
  node scripts/restore-deleted-dir.mts <directory> [options]

Options:
  --commit <rev>   Restore from this revision (skips auto-detection)
  --ref <rev>      Search deletions from this revision (default: HEAD)
  --list           Show commits that deleted files under <directory>
  --dry-run        Print files that would be restored without changing anything
  --force          Restore even when the directory already exists on disk
  -h, --help       Show this help

Examples:
  npm run restore-deleted-dir -- src/components/OldFeature
  npm run restore-deleted-dir -- packages/api/src/legacy --dry-run
  npm run restore-deleted-dir -- client/src/hooks --commit HEAD~3
  npm run restore-deleted-dir -- api/old --list
`);
}

function normalizeDirPath(repoRoot: string, inputPath: string): string {
  const absolute = resolve(repoRoot, inputPath);
  const relativePath = relative(repoRoot, absolute);

  if (relativePath.startsWith('..') || relativePath === '') {
    throw new Error(`Path must be inside the repository: ${inputPath}`);
  }

  return relativePath.split('\\').join('/');
}

function pathSpec(dirPath: string): string {
  return dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
}

function pathExistsOnDisk(repoRoot: string, dirPath: string): boolean {
  return existsSync(join(repoRoot, dirPath));
}

function pathTrackedAt(repoRoot: string, revision: string, dirPath: string): boolean {
  const files = gitLines(['ls-tree', '-r', '--name-only', revision, '--', pathSpec(dirPath)], repoRoot);
  return files.length > 0;
}

function listDeletedCommits(repoRoot: string, ref: string, dirPath: string): DeletionRecord[] {
  const lines = gitLines(
    [
      'log',
      ref,
      '--diff-filter=D',
      '--format=%H%x09%ci%x09%s',
      '--',
      pathSpec(dirPath),
    ],
    repoRoot,
  );

  return lines.map((line) => {
    const [hash, date, ...subjectParts] = line.split('\t');
    return { hash, date, subject: subjectParts.join('\t') };
  });
}

function findDeletionCommit(repoRoot: string, ref: string, dirPath: string): string | null {
  const hash = git(
    ['log', ref, '--diff-filter=D', '--format=%H', '-1', '--', pathSpec(dirPath)],
    repoRoot,
  );
  return hash === '' ? null : hash;
}

function findLastCommitWithPath(repoRoot: string, ref: string, dirPath: string): string | null {
  const hash = git(['log', ref, '--format=%H', '-1', '--', pathSpec(dirPath)], repoRoot);
  return hash === '' ? null : hash;
}

function parentCommit(repoRoot: string, commit: string): string {
  return git(['rev-parse', `${commit}^`], repoRoot);
}

function listFilesAt(repoRoot: string, revision: string, dirPath: string): string[] {
  return gitLines(['ls-tree', '-r', '--name-only', revision, '--', pathSpec(dirPath)], repoRoot);
}

function restoreFiles(
  repoRoot: string,
  sourceRevision: string,
  files: string[],
  dryRun: boolean,
): void {
  if (files.length === 0) {
    throw new Error('No tracked files found to restore');
  }

  if (dryRun) {
    for (const file of files) {
      console.log(`  would restore: ${file}`);
    }
    return;
  }

  const chunkSize = 100;
  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    const result = spawnSync(
      'git',
      ['restore', '--source', sourceRevision, '--staged', '--worktree', '--', ...chunk],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );

    if (result.status !== 0) {
      const stderr = result.stderr?.trim() ?? '';
      throw new Error(stderr || 'git restore failed');
    }
  }

  for (const file of files) {
    console.log(`  restored: ${file}`);
  }
}

function resolveSourceRevision(
  repoRoot: string,
  options: CliOptions,
  dirPath: string,
): { revision: string; reason: string } {
  if (options.commit) {
    if (!pathTrackedAt(repoRoot, options.commit, dirPath)) {
      throw new Error(`No tracked files under "${dirPath}" at ${options.commit}`);
    }
    return { revision: options.commit, reason: `explicit commit ${options.commit}` };
  }

  const trackedAtHead = pathTrackedAt(repoRoot, options.ref, dirPath);
  const existsOnDisk = pathExistsOnDisk(repoRoot, dirPath);

  if (trackedAtHead && !existsOnDisk) {
    return {
      revision: options.ref,
      reason: `directory deleted from working tree but still present at ${options.ref}`,
    };
  }

  const deletionCommit = findDeletionCommit(repoRoot, options.ref, dirPath);
  if (deletionCommit) {
    const source = parentCommit(repoRoot, deletionCommit);
    return {
      revision: source,
      reason: `parent of deletion commit ${deletionCommit.slice(0, 7)}`,
    };
  }

  const lastCommit = findLastCommitWithPath(repoRoot, options.ref, dirPath);
  if (lastCommit) {
    return {
      revision: lastCommit,
      reason: `last commit containing the directory (${lastCommit.slice(0, 7)})`,
    };
  }

  throw new Error(`No git history found for "${dirPath}"`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.path) {
    printHelp();
    process.exit(1);
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = git(['rev-parse', '--show-toplevel'], resolve(scriptDir, '..'));
  const dirPath = normalizeDirPath(repoRoot, options.path);

  if (options.list) {
    const deletions = listDeletedCommits(repoRoot, options.ref, dirPath);
    if (deletions.length === 0) {
      console.log(`No deletion commits found for "${dirPath}" from ${options.ref}`);
      return;
    }

    console.log(`Deletion history for "${dirPath}" from ${options.ref}:\n`);
    for (const record of deletions) {
      console.log(`${record.hash.slice(0, 7)}  ${record.date}  ${record.subject}`);
    }
    return;
  }

  if (pathExistsOnDisk(repoRoot, dirPath) && !options.force) {
    throw new Error(
      `"${dirPath}" already exists. Use --force to restore tracked files anyway.`,
    );
  }

  const { revision, reason } = resolveSourceRevision(repoRoot, options, dirPath);
  const files = listFilesAt(repoRoot, revision, dirPath);

  console.log(`Restoring "${dirPath}" from ${revision.slice(0, 7)} (${reason})`);
  console.log(`${files.length} file(s)\n`);

  restoreFiles(repoRoot, revision, files, options.dryRun);

  if (options.dryRun) {
    console.log(`\nDry run complete. Re-run without --dry-run to restore.`);
  } else {
    console.log(`\nDone. Review changes with: git status -- "${dirPath}"`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
}
