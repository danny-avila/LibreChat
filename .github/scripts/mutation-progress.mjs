import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';

export function publicProgress(raw) {
  const line = raw.replace(/\u001b\[[0-9;]*m/g, '');
  const message = line.replace(/^\d{2}:\d{2}:\d{2} \(\d+\) (INFO|WARN|ERROR) /, '');
  let match;
  if (
    (match = /^Instrumenter Instrumented (\d+) source file\(s\) with (\d+) mutant\(s\)$/.exec(
      message,
    ))
  ) {
    return {
      phase: 'preparation',
      text: `Prepared ${match[1]} source files; ${match[2]} mutants.`,
    };
  }
  if (message.startsWith('DryRunExecutor Starting initial test run (')) {
    return { phase: 'baseline tests', text: 'Baseline tests started. No mutants are active yet.' };
  }
  if ((match = /^DryRunExecutor Initial test run succeeded\. Ran (\d+) tests in /.exec(message))) {
    return { phase: 'mutation testing', text: `Baseline passed: ${match[1]} tests.` };
  }
  if (
    /^DryRunExecutor (One or more tests failed in the initial test run:|One or more tests resulted in an error:|Initial test run timed out!)/.test(
      message,
    )
  ) {
    return { phase: 'baseline failure', text: 'Baseline failed. Details are in the private log.' };
  }
  if (/^ChildProcessProxy Child process \[pid \d+\] ran out of memory\./.test(message)) {
    return {
      phase: 'test runner restart',
      text: 'The test runner ran out of memory. Stryker may retry.',
    };
  }
  if (
    (match =
      /^Mutation testing (\d+)% \(elapsed: [^\r\n]*\) (\d+)\/(\d+) tested \((\d+) survived, (\d+) timed out\)$/.exec(
        line,
      ))
  ) {
    return {
      phase: 'mutation testing',
      text: `${match[1]}%: ${match[2]}/${match[3]} tested; ${match[4]} survived; ${match[5]} timed out.`,
    };
  }
  return null;
}

async function main(logFile) {
  if (!logFile) {
    throw new Error('Usage: mutation-progress.mjs <private-log-file>');
  }
  const log = createWriteStream(logFile, { mode: 0o600 });
  const logFinished = finished(log);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const started = Date.now();
  let lastProgress = started;
  let phase = 'preparation';
  console.log('Stryker started. Detailed output is being saved to the private log.');
  // A heartbeat means the output monitor is alive, not that tests are advancing.
  const heartbeat = setInterval(() => {
    const quietSeconds = Math.floor((Date.now() - lastProgress) / 1000);
    if (quietSeconds >= 30) {
      console.log(
        `Waiting in ${phase}: ${Math.floor((Date.now() - started) / 1000)}s elapsed; no new progress for ${quietSeconds}s.`,
      );
    }
  }, 30000);
  lines.on('line', (line) => {
    const progress = publicProgress(line);
    if (progress) {
      phase = progress.phase;
      lastProgress = Date.now();
      console.log(progress.text);
    }
  });
  process.stdin.pipe(log);
  try {
    await logFinished;
  } finally {
    clearInterval(heartbeat);
    lines.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv[2]);
}
