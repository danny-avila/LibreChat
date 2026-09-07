import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { expect } from '@playwright/test';
import type { Cookie } from '@playwright/test';
import type Result from 'lighthouse/types/lhr/lhr';

const exec = promisify(execFile);

export async function auditPage({
  url,
  cookies,
  configPath = path.resolve(__dirname, 'lighthouserc.cjs'),
}: {
  url: string;
  cookies: Cookie[];
  configPath?: string;
}): Promise<Result[]> {
  const env = {
    ...process.env,
    LIGHTHOUSE_URL: url,
    LIGHTHOUSE_COOKIE: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
  };
  const cli = require.resolve('@lhci/cli/src/cli.js');
  const config = `--config=${configPath}`;
  const run = (command: string) => exec(process.execPath, [cli, command, config], { env });
  const directory = path.resolve('.lighthouseci');
  try {
    console.log((await run('collect')).stdout);
  } finally {
    // LHCI embeds extraHeaders in reports; keep disposable session cookies out of artifacts.
    for (const file of fs.existsSync(directory) ? fs.readdirSync(directory) : []) {
      if (!/\.(json|html)$/.test(file)) continue;
      const filename = path.join(directory, file);
      const content = fs.readFileSync(filename, 'utf8');
      fs.writeFileSync(
        filename,
        env.LIGHTHOUSE_COOKIE ? content.replaceAll(env.LIGHTHOUSE_COOKIE, '[redacted]') : content,
      );
    }
  }
  const reports = fs.readdirSync(directory).filter((file) => /^lhr-.*\.json$/.test(file));
  expect(reports.length, 'Lighthouse must produce reports').toBeGreaterThan(0);
  const results = reports.map(
    (file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as Result,
  );
  for (const report of results) {
    console.log(
      `${report.finalDisplayedUrl}: LCP ${report.audits['largest-contentful-paint'].displayValue}`,
    );
    const requests = report.audits['network-requests'].details;
    if (requests?.type === 'table') {
      console.table(
        requests.items
          .filter((item) => typeof item.url === 'string' && item.url.includes('/api/'))
          .map((item) => ({
            url: item.url,
            startMs: item.networkRequestTime,
            endMs: item.networkEndTime,
            status: item.statusCode,
          })),
      );
    }
    expect(report.runtimeError, 'Lighthouse navigation must succeed').toBeUndefined();
  }
  console.log(
    'Inspect .lighthouseci HTML/JSON and e2e/lighthouse/README.md. Reuse loaded user/config data; overlap independent reads without bypassing authorization.',
  );
  console.log((await run('assert')).stdout);
  return results;
}
