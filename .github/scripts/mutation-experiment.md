# API mutation experiment

The experiment splits all selected API production files into 16 disjoint shards.
Each source file belongs to exactly one shard. Sorted paths stay together so a
shard usually covers nearby modules. New source files enter the plan automatically.

Jest finds tests related to each shard through its import graph, including tests
in other API folders. The baseline uses that test list. For each mutant, Stryker's
`enableFindRelatedTests` option narrows the files again to the mutated source file.
Per-test coverage then selects test cases within those files. Jest does not need
to load every test file in the shard for each mutant.

The mutation-only dependency extractor adds literal module paths from typed Jest
calls, such as `jest.requireActual<typeof Module>('./module')`. Jest's default
extractor misses that syntax. It preserves the default dependency set and uses
the API workspace's TypeScript parser to distinguish calls from comments and strings.
Paths computed at runtime still cannot be inferred from the import graph. Related
test discovery is not a proof of full runtime coverage.

The manifest lists suites that have no link to the selected API source files.
They remain in the normal API test suite, but do not run during API mutation testing.
The current six suites exercise other workspaces, external libraries, or copied logic:

| Test file under `packages/api/src/`       | What it exercises                                   |
| ----------------------------------------- | --------------------------------------------------- |
| `app/AppService.spec.ts`                  | `AppService` from data-schemas                      |
| `app/AppService.interface.spec.ts`        | `AppService` from data-schemas                      |
| `files/encode/processAttachments.spec.ts` | Local copied categorization logic and data-provider |
| `agents/hitl/typeContract.spec.ts`        | SDK/data-provider type contracts                    |
| `cache/redisClients.tls.spec.ts`          | The external Redis client                           |
| `files/fileConfigRegex.spec.ts`           | data-provider and the external regex engine         |

The normal API CI integration-test exclusions still apply. No failing test is
excluded to make a baseline pass. This measures the API workspace's test suite;
it does not include the frontend, legacy backend, or other workspaces' suites.

## Run a shard locally

Run from the repository root after installing dependencies and building the
data-provider, data-schemas, and API workspaces:

```sh
export MUTATION_SHARD=1/16
node .github/scripts/mutation-shards.mjs manifest
npm run test:mutation:api
```

The output is under `reports/mutation/api-shards/shard-01-of-16/`.
The manifest records the commit, source fingerprint, source files, and test files.
Reports are ignored by Git. Without `MUTATION_SHARD`, the existing full API
experiment remains available.

Results use `incremental-related.json`. The old `incremental.json` cache is not
reused after changing test selection. Report merging rejects mixed test-selection
modes as well as mixed commits and source hashes.

## Check speed and result parity before scaling up

Run a bounded comparison with a fresh output directory:

```sh
node .github/scripts/mutation-benchmark.mjs reports/mutation/related-benchmark
```

The benchmark runs the same 11 mutants in two small source ranges against the same
eight-file test pool. One range exercises a typed Jest import; the other is covered
by tests in several folders. The native mode narrows files per mutant. The control
mode loads the whole pool. Each mode has a five-minute limit. Each mode starts with an empty incremental cache and saves partial results. Native mode runs first, so the control may benefit from warm caches.

The generated `index.html` links to logs and both mutation reports. `benchmark.json`
records the runtime version, source/test and configuration fingerprints, selected
files, wall times, and every mutant's classification. The command fails unless both
modes finish, all classifications match, and neither mode has a runner crash or
mutant execution error. These timings measure this sample only; they do not predict
the full API run.

### Compare a real shard

```sh
node .github/scripts/mutation-benchmark.mjs reports/mutation/shard-benchmark --profile shard
```

This profile uses shard 2/16's full test pool and fixed ranges in compaction,
request envelopes, and file matching. The current ranges create 39 mutants.
Each mode has a 15-minute limit, followed by up to 30 seconds for cleanup.
The command records the shard manifest and checks that all sampled files belong to it.
The HTML page refreshes every ten seconds. The terminal prints progress every 30 seconds.
An elapsed-time update alone does not mean another mutant finished.
Keep the host awake during the comparison. On macOS, prefix the command with
`caffeinate -i` to prevent idle sleep only while it runs. The stop timer cannot
execute while the host is asleep. A monitoring gap above one minute makes the
speed comparison unreliable; investigate sleep or suspension before using its timings.

Use `--jest-config /path/to/overrides.json` only for explicit local test settings.
Both modes receive the same overrides, which are recorded in `benchmark.json`.
For example, a local exclusion environment can apply an approved list of known
baseline failures without changing production tests. Keep the override file and
its referenced exclusion files with the private run evidence. This option does
not alter the CI test selection. A limited local run is not a full CI result.

## CI runs and private reports

The experiment branch runs up to four shard jobs at once. Each job uses one test
process with an 8 GB Node heap limit. A failed shard does not cancel the others.
Pushing a new experiment commit cancels the previous workflow run.
The job log shows preparation, baseline status, and mutation counts. During quiet
periods, a message every 30 seconds shows the last known phase and elapsed time.
That message confirms the output monitor is alive; it does not prove tests are advancing.
Each shard has a 45-minute Stryker limit. Four waves can take roughly three hours,
plus installation, builds, and queue time.

Each artifact contains an encrypted archive. The private key stays on the user's
machine. CI uploads no plaintext HTML, JSON, or Stryker log. A shard gets a status
page even when its baseline fails. An interrupted run gets a partial report only
if Stryker saved results before stopping.

After downloading the artifacts, decrypt each one with the matching private key:

```sh
openssl cms -decrypt -binary -inform DER \
  -in mutation-api.tar.gz.cms -inkey /path/to/private-key.pem \
  -out mutation-api.tar.gz
tar -tzf mutation-api.tar.gz
```

Check that archive paths stay inside the expected `shard-NN-of-16/` directory.
Extract all archives from one run into the same private directory, then combine:

```sh
node .github/scripts/mutation-reports.mjs merge /path/to/decrypted-shards
```

Open that directory's `index.html`. It links to each shard's HTML and shows the
combined results. The combined score is a full API score only when all 16 shards
finish. Missing, failed, and interrupted shards keep the page marked incomplete.
Do not average shard percentages; the combined report counts individual mutants.
The merge rejects mixed source versions, overlapping assignments, and duplicate
shards. It gives each shard's mutant and test IDs a prefix to preserve their links.

## Validate the experiment tooling

```sh
node --test .github/scripts/mutation-shards.test.mjs
node .github/scripts/mutation-shards.mjs matrix
```

The matrix command must match the workflow's shard list. The tests check source
assignment, test retention, report identity, and incomplete-result handling.
