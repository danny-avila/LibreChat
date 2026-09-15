module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'node scripts/sort-imports.mts',
    'prettier --write',
    'eslint --fix',
    // Same invocation as the Static Checks CI job: warnings are failures there,
    // and changed files under config-ignored paths must not trip it.
    // --pass-on-unpruned-suppressions: fixing a design-rule violation recorded in
    // eslint-suppressions.json otherwise fails the commit that fixed it. Tighten the
    // recorded counts with `npm run lint:design:prune`.
    'eslint --config eslint.config.mjs --no-warn-ignored --max-warnings=0 --pass-on-unpruned-suppressions',
  ],
  '*.json': ['prettier --write'],
};
