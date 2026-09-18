module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'node scripts/sort-imports.mts',
    'prettier --write',
    // The design rules read each primitive's `cva` variants through
    // @librechat/client, which resolves to packages/client/dist, so the metadata
    // has to exist before the fixing pass below reads it: run first, that pass
    // would classify against a stale build and report counts neither the runner
    // nor CI agrees with — and its failure aborts lint-staged before the runner
    // gets to rebuild. tsdown is ~1s when nothing changed.
    () => 'npm run --silent build:client-package',
    // Same invocation as the Static Checks CI job: warnings are failures there,
    // and changed files under config-ignored paths must not trip it.
    // --pass-on-unpruned-suppressions: fixing a design-rule violation recorded in
    // eslint-suppressions.json otherwise fails the commit that fixed it. Tighten the
    // recorded counts with `npm run lint:design:prune`.
    // One invocation, not a bare `eslint --fix` followed by this one: ESLint applies
    // suppressions after fixes, so a single run reports the post-fix state, while a
    // first run without the flag exits 2 on the suppression the fix just made unused
    // and lint-staged never reaches the command that tolerates it.
    'eslint --fix --config eslint.config.mjs --no-warn-ignored --max-warnings=0 --pass-on-unpruned-suppressions',
    // The runner is the CI mirror — same arguments — and rebuilds the metadata
    // itself when a staged change made it stale, so the commit and the lane
    // agree on what the rules classify.
    'node scripts/static-checks.mts --only eslint',
  ],
  '*.json': ['prettier --write'],
  // A commit that only lowers a recorded count, only narrows a rule, or only
  // changes the gate that reads them touches no source file at all, so the group
  // above never runs and the first thing to notice the capacity it freed would be
  // CI. This is the same check the lane runs — it reaches for the whole record on
  // any of these paths — which is what keeps the commit and the lane agreeing.
  '{eslint-suppressions.json,eslint.config.mjs,package.json,package-lock.json,packages/*/eslint-suppressions.json,packages/client/package.json,packages/client/tsdown.config.mjs,packages/client/tsconfig.json,scripts/static-checks.mts}':
    [() => 'node scripts/static-checks.mts --only suppressions'],
};
