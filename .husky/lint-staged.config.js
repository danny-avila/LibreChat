module.exports = {
  '*.{js,jsx,ts,tsx}': ['npx prettier --write', 'eslint --fix', 'eslint'],
  '*.json': ['npx prettier --write'],
};
