echo "Removing node_modules and package-lock.json"
rm -rf node_modules/
rm package-lock.json

echo "Installing primary dependencies"

npm install

echo "Installing our fork-specific dependencies"
cd api/
npm install cheerio @e2b/code-interpreter better-sqlite3

cd ..
echo "Running ci"
npm ci

echo "Running frontend"
npm run frontend

echo "Running backend"
npm run backend