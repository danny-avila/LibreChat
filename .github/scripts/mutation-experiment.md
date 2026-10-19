# API mutation experiment

The experiment splits all selected API production files into 16 disjoint shards.
Each source file belongs to exactly one shard. Sorted paths stay together so a
shard usually covers nearby modules. New source files enter the plan automatically.

Jest finds tests related to each shard through its import graph, including tests
in other API folders. Tests that have no link to any selected API source file run
in every shard. This keeps source-inspection and contract tests in the experiment.
The resulting explicit test list is used for the baseline and mutation runs.
Stryker then uses per-test coverage to select tests for each mutant.
Selection depends on Jest's dependency graph. A test that loads a file dynamically
can have a relationship that the graph does not find.

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
