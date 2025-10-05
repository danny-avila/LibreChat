#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Source directory does not exist: ${src}`);
    return;
  }
  
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('🏗️  Building LibreChat SPA Architecture...');

try {
  // Build client microfrontend
  console.log('1️⃣  Building client microfrontend...');
  execSync('npm run build:spa', { 
    cwd: path.join(__dirname, '..', 'client'), 
    stdio: 'inherit' 
  });

  // Build custom header microfrontend
  console.log('2️⃣  Building custom header microfrontend...');
  execSync('npm run build', { 
    cwd: path.join(__dirname, '..', 'custom_microfrontend'), 
    stdio: 'inherit' 
  });

  // Build sspa-root (this will trigger postbuild script)
  console.log('3️⃣  Building sspa-root...');
  execSync('npm run build', { 
    cwd: path.join(__dirname, '..', 'sspa-root'), 
    stdio: 'inherit' 
  });

  console.log('✅ SPA build complete!');
  console.log('🚀 Run "npm run backend" to start the server with SPA architecture');
  console.log('🌐 The app will be available at http://localhost:3080');

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}