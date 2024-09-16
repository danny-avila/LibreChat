import fs from 'fs';
import path from 'path';
import { processLanguageModule, processMissingKey } from './process';

export default async function main(baseFilePath: string, compareFilePath: string) {
  const prompt = await processLanguageModule(path.basename(compareFilePath), compareFilePath);

  if (prompt === undefined) {
    console.error(`Prompt not found for module: ${path.basename(compareFilePath)}`);
    return;
  }

  const baseModule = await import(baseFilePath);
  const baseKeys = Object.keys(baseModule.default);

  const compareModule = await import(compareFilePath);
  const compareKeys = Object.keys(compareModule.default);

  const missingKeys = baseKeys.filter((key) => !compareKeys.includes(key));
  if (missingKeys.length > 0) {
    const keyTranslations = {};
    for (const key of missingKeys) {
      const baselineTranslation = baseModule.default[key] || 'No baseline translation available';
      const result = await processMissingKey({
        key,
        baselineTranslation,
        translationPrompt: prompt,
        moduleName: path.basename(compareFilePath),
      });
      keyTranslations[key] = result;
    }

    const outputDir = path.dirname(compareFilePath);
    const outputFileName = `${path.basename(
      compareFilePath,
      path.extname(compareFilePath),
    )}_missing_keys.json`;
    const outputFilePath = path.join(outputDir, outputFileName);
    fs.writeFileSync(outputFilePath, JSON.stringify(keyTranslations, null, 2));
  }
}
