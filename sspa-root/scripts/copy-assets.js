#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source directory does not exist: ${src}`);
    return false;
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
  return true;
}

console.log('📦 Copying microfrontend assets...');

const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
ensureDir(distDir);
ensureDir(publicDir);

// Copy client microfrontend files
const clientSrc = path.join(__dirname, '..', '..', 'client', 'dist', 'spa');
const clientDistDest = path.join(distDir, 'client-dist');
const clientPublicDest = path.join(publicDir, 'client-dist');

let clientCopied = false;
if (copyDir(clientSrc, clientDistDest)) {
  copyDir(clientSrc, clientPublicDest);
  console.log('   ✅ Client microfrontend assets copied');
  clientCopied = true;
} else {
  console.log('   ❌ Client microfrontend build not found - run "npm run build:spa" in client folder first');
}

// Copy custom header microfrontend files  
const customSrc = path.join(__dirname, '..', '..', 'custom_microfrontend', 'dist');
const customDistDest = path.join(distDir, 'custom-header-dist');
const customPublicDest = path.join(publicDir, 'custom-header-dist');

let customCopied = false;
if (copyDir(customSrc, customDistDest)) {
  copyDir(customSrc, customPublicDest);
  console.log('   ✅ Custom header microfrontend assets copied');
  customCopied = true;
} else {
  console.log('   ❌ Custom header microfrontend build not found - run "npm run build" in custom_microfrontend folder first');
}

console.log('📁 Assets structure:');
console.log(`   ${distDir}/`);
console.log(`   ├── index.html`);
console.log(`   ├── assets/`);
console.log(`   ├── client-dist/ ${clientCopied ? '✅' : '❌'}`);
console.log(`   └── custom-header-dist/ ${customCopied ? '✅' : '❌'}`);
console.log(`   ${publicDir}/`);
console.log(`   ├── client-dist/ ${clientCopied ? '✅' : '❌'}`);
console.log(`   └── custom-header-dist/ ${customCopied ? '✅' : '❌'}`);