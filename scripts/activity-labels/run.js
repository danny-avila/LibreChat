/**
 * Activity-label eval runner: replays the corpus against the production wire
 * shape (system = instruction variant, user = SDK-built prompt, max_tokens
 * 256 — matching the traced production requests) and reports per-variant
 * quality: format violations, first-word register distribution, cross-batch
 * redundancy, latency, and cost.
 *
 * Sequences run their steps serially; each generated label chains into the
 * next step's `previousLabels`. Variants with `usePreviousLabels` see that
 * context in the prompt; every variant is MEASURED against it, so blind and
 * continuity variants share one redundancy metric.
 *
 * Usage:
 *   node scripts/activity-labels/run.js [--variants baseline,continuity]
 *     [--cases sandbox-probe-run,fib-rapid] [--samples 2] [--model id]
 *     [--concurrency 6] [--dry]
 */
const fs = require('fs');
const path = require('path');

const { cases, stepEntries } = require('./corpus');
const { variants } = require('./variants');
const { checkLabel } = require('./checks');
const { renderStepPrompt } = require('./prompt');
const { aggregate, markdownReport } = require('./report');

const ROOT = path.resolve(__dirname, '..', '..');
const RESULTS_DIR = path.join(__dirname, 'results');
const CHAR_LIMIT = 600;
const MAX_TOKENS = 256;

function parseArgs(argv) {
  const args = { samples: 1, concurrency: 6, model: 'claude-haiku-4-5', dry: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dry') {
      args.dry = true;
    } else if (key === '--variants') {
      args.variants = argv[++i].split(',');
    } else if (key === '--cases') {
      args.cases = argv[++i].split(',');
    } else if (key === '--samples') {
      args.samples = Number(argv[++i]);
    } else if (key === '--model') {
      args.model = argv[++i];
    } else if (key === '--concurrency') {
      args.concurrency = Number(argv[++i]);
    }
  }
  return args;
}

function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  const envPath = path.join(ROOT, '.env');
  const line = fs.existsSync(envPath)
    ? fs
        .readFileSync(envPath, 'utf8')
        .split('\n')
        .find((entry) => entry.startsWith('ANTHROPIC_API_KEY='))
    : undefined;
  if (!line) {
    throw new Error(
      `ANTHROPIC_API_KEY not set and not found in ${envPath}.\n` +
        'Pass it inline:  ANTHROPIC_API_KEY=sk-… node scripts/activity-labels/run.js',
    );
  }
  return line
    .slice('ANTHROPIC_API_KEY='.length)
    .trim()
    .replace(/^["']|["']$/g, '');
}

async function requestLabel({ apiKey, model, instruction, prompt }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: instruction,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (response.ok) {
      const json = await response.json();
      const label = (json.content ?? [])
        .map((block) => block.text ?? '')
        .join('')
        .trim()
        .replace(/^["']|["']$/g, '');
      return {
        label,
        latencyMs: Date.now() - started,
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      };
    }
    const body = await response.text();
    if (attempt < 3 && [429, 500, 529].includes(response.status)) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 15000)));
      continue;
    }
    return {
      error: `HTTP ${response.status}: ${body.slice(0, 160)}`,
      latencyMs: Date.now() - started,
    };
  }
}

/** One case chain: steps serial, labels feeding forward. */
async function runCase({ apiKey, model, variant, sample, testCase, dry, records }) {
  const chain = [];
  for (const step of testCase.steps) {
    const prompt = renderStepPrompt(step, {
      charLimit: CHAR_LIMIT,
      previousLabels: variant.usePreviousLabels ? chain : null,
      previousLabelCap: variant.previousLabelCap,
    });
    const stepId = step.id ?? testCase.id;
    if (dry) {
      records.push({ variant: variant.name, sample, caseId: testCase.id, stepId, prompt });
      continue;
    }
    const result = await requestLabel({ apiKey, model, instruction: variant.instruction, prompt });
    if (result.error) {
      records.push({
        variant: variant.name,
        sample,
        caseId: testCase.id,
        stepId,
        error: result.error,
      });
      continue;
    }
    const { flags, wordCount, firstWord } = checkLabel(result.label, {
      entries: stepEntries(step),
      previousLabels: chain,
    });
    chain.push(result.label);
    records.push({
      variant: variant.name,
      sample,
      caseId: testCase.id,
      stepId,
      label: result.label,
      production: step.productionLabel,
      flags,
      wordCount,
      firstWord,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  }
}

async function pool(tasks, size) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length > 0) {
      await queue.shift()();
    }
  });
  await Promise.all(workers);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const runVariants = args.variants
    ? variants.filter((variant) => args.variants.includes(variant.name))
    : variants;
  const runCases = args.cases ? cases.filter((c) => args.cases.includes(c.id)) : cases;
  if (runVariants.length === 0 || runCases.length === 0) {
    throw new Error('nothing selected — check --variants / --cases names');
  }
  const apiKey = args.dry ? '' : loadKey();
  const records = [];
  const tasks = [];
  for (const variant of runVariants) {
    for (let sample = 1; sample <= args.samples; sample++) {
      for (const testCase of runCases) {
        tasks.push(() =>
          runCase({ apiKey, model: args.model, variant, sample, testCase, dry: args.dry, records }),
        );
      }
    }
  }
  const totalSteps = runCases.reduce((sum, c) => sum + c.steps.length, 0);
  console.log(
    `${args.dry ? 'DRY RUN — rendering only' : `model ${args.model}`} · ${runVariants.length} variants × ${args.samples} samples × ${runCases.length} cases (${totalSteps} steps each pass)`,
  );
  const started = Date.now();
  await pool(tasks, args.concurrency);
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);

  if (args.dry) {
    for (const record of records.slice(0, 3)) {
      console.log(`--- ${record.variant} / ${record.caseId} / ${record.stepId} ---`);
      console.log(record.prompt);
      console.log('');
    }
    console.log(`rendered ${records.length} prompts (showing 3)`);
    return;
  }

  const aggregates = aggregate(records, args.model);
  const variantNames = runVariants.map((variant) => variant.name);
  const report = markdownReport({
    records,
    aggregates,
    runCases,
    variantNames,
    model: args.model,
    samples: args.samples,
  });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(
    path.join(RESULTS_DIR, `${stamp}.json`),
    JSON.stringify({ args, records }, null, 2),
  );
  fs.writeFileSync(path.join(RESULTS_DIR, 'latest.md'), report);

  console.log(report.split('## Per-case')[0]);
  console.log(`full per-case tables: scripts/activity-labels/results/latest.md`);
})().catch((error) => {
  console.error('ERR', error.message);
  process.exit(1);
});
