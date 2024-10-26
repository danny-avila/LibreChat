import fs from 'fs';
import path from 'path';
import main from './main';

async function scanDirectory(baseFilePath: string, languagesDir: string) {
  const files = fs.readdirSync(languagesDir);
  for (const file of files) {
    const ext = path.extname(file);
    if (ext !== '.ts' && ext !== '.tsx') {
      continue;
    }

    const compareFilePath = path.resolve(languagesDir, file);
    if (compareFilePath === baseFilePath) {
      continue;
    }

    await main(baseFilePath, compareFilePath);
  }
}

const languagesDir = './client/src/localization/languages';
const baseFilePath = path.resolve(languagesDir, 'Fa.ts');

scanDirectory(baseFilePath, languagesDir).catch(console.error);
