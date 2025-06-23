echo "Removing node_modules"
find ./ -type d -name node_modules -exec rm -rf {} \;

echo "Installing our fork-specific dependencies"
npm install cheerio @e2b/code-interpreter better-sqlite3 pg pdfkit --save

echo "Installing primary dependencies"
npm ci

echo "Running frontend"
npm run frontend