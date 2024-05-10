import fs from 'fs';
import path from 'path';
import { storeEmbeddings, loadEmbeddings } from './embeddings';

const missingKeyMap = {};
const vectorStoreMap = {};

async function readKeysFromFile(filePath: string): Promise<string[]> {
  const languageModule = await import(filePath);
  const keys = Object.keys(languageModule.default);
  return keys;
}

async function compareKeys(baseKeys: string[], keysFromOtherFile: string[]): Promise<string[]> {
  return baseKeys.filter(key => !keysFromOtherFile.includes(key));
}

async function processLanguageModule(moduleName: string, modulePath: string) {
  await storeEmbeddings(modulePath);
  vectorStoreMap[moduleName] = await loadEmbeddings(modulePath);
  const baseKeys = await readKeysFromFile(modulePath);
  console.log(`Keys in module: ${moduleName}:`, baseKeys.length)
  missingKeyMap[moduleName] = 0;
}

async function processMissingKey(key: string, baselineTranslation: string, moduleName:string ) {
  missingKeyMap[moduleName]++;
  const vectorStore = vectorStoreMap[moduleName];
  const result = await vectorStore.similaritySearch(key, 5);
}

async function main(baseFilePath: string, languagesDir: string) {
  const baseKeys = await readKeysFromFile(baseFilePath);
  const baseModule = await import(baseFilePath);
  
  const files = fs.readdirSync(languagesDir);
  for (const file of files) {
    const ext = path.extname(file);
    if (ext !== '.ts' && ext !== '.tsx') continue;
    
    const compareFilePath = path.resolve(languagesDir, file);
    if (compareFilePath === baseFilePath) continue;
    
    await processLanguageModule(file, compareFilePath);

    try {
      const keysFromOtherFile = await readKeysFromFile(compareFilePath);
      const missingKeys = await compareKeys(baseKeys, keysFromOtherFile);
      if (missingKeys.length > 0) {
        for (const missingKey of missingKeys) {
          const baselineTranslation = baseModule.default[missingKey] || "No baseline translation available";
          await processMissingKey(missingKey, baselineTranslation, file);
        }
      }
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
    }
  }

  console.dir(missingKeyMap, {depth: null});
}

// Set the directory containing language files and specify the path to the base (English) language file.
const languagesDir = './client/src/localization/languages';
const baseFilePath = path.resolve(languagesDir, 'Eng.ts');

main(baseFilePath, languagesDir).catch(console.error);
