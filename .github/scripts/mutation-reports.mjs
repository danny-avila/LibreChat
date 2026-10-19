import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

export function readShard(directory) {
  const manifest = readJson(join(directory, 'manifest.json'));
  const exitFile = join(directory, 'exit-code.txt');
  const exitText = existsSync(exitFile) ? readFileSync(exitFile, 'utf8').trim() : '';
  const exitCode = /^\d+$/.test(exitText) ? Number(exitText) : null;
  const fullReport = join(directory, 'mutation.json');
  const partialReport = join(
    directory,
    manifest.testSelection === 'jest-findRelatedTests'
      ? 'incremental-related.json'
      : 'incremental.json',
  );
  const report = existsSync(fullReport)
    ? readJson(fullReport)
    : existsSync(partialReport)
      ? readJson(partialReport)
      : null;
  return { manifest, exitCode, report, complete: exitCode === 0 && existsSync(fullReport) };
}

export function combine(shards) {
  if (!shards.length) {
    throw new Error('No shard manifests found');
  }
  const first = shards[0].manifest;
  const indexes = new Set();
  const assignedFiles = new Set();
  const files = {};
  const testFiles = {};
  let template;
  for (const { manifest, report } of shards) {
    const expectedId = `shard-${String(manifest.index).padStart(2, '0')}-of-${manifest.total}`;
    if (
      manifest.sourceHash !== first.sourceHash ||
      manifest.commit !== first.commit ||
      manifest.testSelection !== first.testSelection ||
      manifest.total !== first.total ||
      manifest.sourceFileCount !== first.sourceFileCount
    ) {
      throw new Error('Cannot merge different source versions, test selection, or shard plans');
    }
    if (
      !Number.isInteger(manifest.index) ||
      manifest.index < 1 ||
      manifest.index > first.total ||
      manifest.id !== expectedId ||
      indexes.has(manifest.index)
    ) {
      throw new Error('Invalid or duplicate shard');
    }
    indexes.add(manifest.index);
    for (const file of manifest.files) {
      if (assignedFiles.has(file)) {
        throw new Error(`Source file assigned twice: ${file}`);
      }
      assignedFiles.add(file);
    }
    if (!report) {
      continue;
    }
    if (
      template &&
      (report.schemaVersion !== template.schemaVersion ||
        report.framework?.version !== template.framework?.version)
    ) {
      throw new Error('Cannot merge different Stryker report versions');
    }
    template ??= report;
    const prefix = (id) => `${manifest.id}:${id}`;
    for (const [file, result] of Object.entries(report.files)) {
      if (!manifest.files.includes(file) || files[file]) {
        throw new Error(`Unexpected or duplicate report file: ${file}`);
      }
      files[file] = {
        ...result,
        mutants: result.mutants.map((mutant) => ({
          ...mutant,
          id: prefix(mutant.id),
          ...(mutant.killedBy && { killedBy: mutant.killedBy.map(prefix) }),
          ...(mutant.coveredBy && { coveredBy: mutant.coveredBy.map(prefix) }),
        })),
      };
    }
    for (const [file, result] of Object.entries(report.testFiles ?? {})) {
      if (testFiles[file] && testFiles[file].source !== result.source) {
        throw new Error(`Different test sources: ${file}`);
      }
      testFiles[file] ??= { ...result, tests: [] };
      testFiles[file].tests.push(...result.tests.map((test) => ({ ...test, id: prefix(test.id) })));
    }
  }
  if (indexes.size === first.total && assignedFiles.size !== first.sourceFileCount) {
    throw new Error('The shard manifests do not cover all planned source files');
  }
  const complete = indexes.size === first.total && shards.every((shard) => shard.complete);
  return {
    complete,
    expectedShards: first.total,
    availableShards: indexes.size,
    completedShards: shards.filter((shard) => shard.complete).length,
    sourceFileCount: first.sourceFileCount,
    report: template
      ? {
          ...template,
          files,
          testFiles,
          config: { ...template.config, mutate: [...assignedFiles].sort() },
        }
      : null,
  };
}

async function render(report, file, banner) {
  if (!report) {
    writeFileSync(
      file,
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>API mutation experiment</title><body>${banner}</body></html>`,
    );
    return;
  }
  // Stryker 10.0.0 is pinned. Reuse its standalone HTML renderer, including offline assets.
  const require = createRequire(import.meta.url);
  const core = dirname(require.resolve('@stryker-mutator/core/package.json'));
  const { HtmlReporter } = await import(
    pathToFileURL(join(core, 'dist/src/reporters/html-reporter.js')).href
  );
  await new HtmlReporter(
    { htmlReporter: { fileName: file } },
    { info() {}, debug() {} },
  ).generateReport(report);
  writeFileSync(file, readFileSync(file, 'utf8').replace('<body>', `<body>${banner}`));
}

const notice = (title, content) =>
  `<section style="font:16px/1.5 system-ui;padding:24px;background:#fff4d6;color:#17212e;border-bottom:2px solid #a56b00"><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(title)}</h1>${content}</section>`;

async function main(command, directory) {
  if (!directory) {
    throw new Error(
      'Usage: mutation-reports.mjs render <shard-directory> | merge <decrypted-shards-directory>',
    );
  }
  if (command === 'render') {
    const shard = readShard(directory);
    const title = `${shard.manifest.id}: ${shard.complete ? 'complete' : shard.report ? 'partial results' : 'no mutation results'}`;
    const banner = notice(
      title,
      `<p>This report covers one shard, not the whole API. ${shard.complete ? '' : 'The run did not finish. Any score below covers only reported mutants.'}</p><p><a href="run.log">Run log</a> · <a href="manifest.json">Assigned source files</a></p>`,
    );
    writeFileSync(
      join(directory, 'status.json'),
      `${JSON.stringify({ complete: shard.complete, exitCode: shard.exitCode, hasResults: Boolean(shard.report) }, null, 2)}\n`,
    );
    await render(shard.report, join(directory, 'index.html'), banner);
    return;
  }
  if (command !== 'merge') {
    throw new Error(`Unknown command: ${command}`);
  }
  const folders = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^shard-\d+-of-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const shards = folders.map((folder) => readShard(join(directory, folder)));
  const result = combine(shards);
  const title = result.complete
    ? 'API mutation experiment: complete'
    : 'API mutation experiment: incomplete';
  const links = folders
    .map(
      (folder, index) =>
        `<li><a href="${folder}/index.html">${folder}</a>: ${shards[index].complete ? 'complete' : shards[index].report ? 'partial' : 'no results'}</li>`,
    )
    .join('');
  const banner = notice(
    title,
    `<p>${result.completedShards} of ${result.expectedShards} shards completed. ${result.complete ? '' : '<strong>Any score below covers only available results. It is not a full API score.</strong>'}</p><ul>${links}</ul>`,
  );
  writeFileSync(
    join(directory, 'summary.json'),
    `${JSON.stringify({ ...result, report: undefined }, null, 2)}\n`,
  );
  if (result.report) {
    writeFileSync(join(directory, 'combined.json'), `${JSON.stringify(result.report)}\n`);
  }
  await render(result.report, join(directory, 'index.html'), banner);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv[2], process.argv[3]);
}
