import fs from 'fs';
import path from 'path';
import { storeEmbeddings, loadEmbeddings } from './embeddings';
import { translateKeyPhrase } from './anthropic';

const missingKeyMap = {};
const vectorStoreMap = {};

export async function processLanguageModule(moduleName: string, modulePath: string) {
  const filename = path.basename(moduleName, path.extname(moduleName));
  const promptFilePath = path.join(path.dirname(modulePath), '../prompts', `${filename}.md`);
  console.log(promptFilePath);

  if (!fs.existsSync(promptFilePath)) {
    console.error(`Prompt file not found for module: ${moduleName}`);
    return undefined;
  }

  const prompt = fs.readFileSync(promptFilePath, 'utf-8');
  await storeEmbeddings(modulePath);
  vectorStoreMap[moduleName] = await loadEmbeddings(modulePath);
  const baseKeys = Object.keys((await import(modulePath)).default);
  console.log(`Keys in module: ${moduleName}:`, baseKeys.length);
  missingKeyMap[moduleName] = 0;
  return prompt;
}

export async function processMissingKey({
  key,
  baselineTranslation,
  moduleName,
  translationPrompt,
}: {
  key: string;
  baselineTranslation: string;
  moduleName: string;
  translationPrompt: string;
}) {
  missingKeyMap[moduleName]++;
  const vectorStore = vectorStoreMap[moduleName];
  const context = await vectorStore.similaritySearch(key, 5);
  const translation = await translateKeyPhrase({
    key,
    baselineTranslation,
    translationPrompt,
    context,
  });
  console.log(`"${key}": "${translation}",\n`);
  return translation;
}
