import fs from 'fs';
import path from 'path';

async function readKeysFromFile(filePath: string): Promise<string[]> {
  const languageModule = await import(filePath);
  const keys = Object.keys(languageModule.default);
  return keys;
}

async function compareKeys(baseKeys: string[], keysFromOtherFile: string[]): Promise<string[]> {
  const missingKeys = baseKeys.filter((key) => !keysFromOtherFile.includes(key));
  return missingKeys;
}

async function main(baseFilePath: string, languagesDir: string) {
  const baseKeys = await readKeysFromFile(baseFilePath);

  const files = fs.readdirSync(languagesDir);
  for (const file of files) {
    const ext = path.extname(file);
    if (ext !== '.ts' && ext !== '.tsx') {
      continue;
    } // Ensure it's a TypeScript file

    const compareFilePath = path.resolve(languagesDir, file);
    if (compareFilePath === baseFilePath) {
      continue;
    } // Skip the base file

    try {
      const keysFromOtherFile = await readKeysFromFile(compareFilePath);
      const missingKeys = await compareKeys(baseKeys, keysFromOtherFile);
      if (missingKeys.length > 0) {
        console.log(`Missing Keys in ${file}:`, missingKeys);
      }
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
    }
  }
}

// Set the directory containing language files and specify the path to the base (English) language file.
const languagesDir = './client/src/localization/languages';
const baseFilePath = path.resolve(languagesDir, 'Fa.ts');

main(baseFilePath, languagesDir).catch(console.error);
