module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'node scripts/sort-imports.mts',
    'prettier --write',
    'eslint --fix',
    // Same invocation as the Static Checks CI job: warnings are failures there,
    // and changed files under config-ignored paths must not trip it.
    'eslint --config eslint.config.mjs --no-warn-ignored --max-warnings=0',
  ],
  '*.json': ['prettier --write'],
};
