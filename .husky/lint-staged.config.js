module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'node scripts/sort-imports.mts',
    'prettier --write',
    'eslint --fix',
    'eslint',
  ],
  '*.json': ['prettier --write'],
};
