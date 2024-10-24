import fs from 'fs';
import path from 'path';
import { processLanguageModule, processMissingKey } from './process';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const promises: Array<Promise<void>> = [];
  if (missingKeys.length > 0) {
    const keyTranslations = {};
    for (const key of missingKeys) {
      const baselineTranslation = baseModule.default[key] || 'No baseline translation available';
      const handleMissingKey = async () => {
        try {
          const result = await processMissingKey({
            key,
            baselineTranslation,
            translationPrompt: prompt,
            moduleName: path.basename(compareFilePath),
          });
          keyTranslations[key] = result;
        } catch (e) {
          console.error(`Error processing key: ${key}`, e);
        }
      };

      promises.push(handleMissingKey());
      await sleep(2000);
    }

    await Promise.all(promises);
    const outputDir = path.dirname(compareFilePath);
    const outputFileName = `${path.basename(
      compareFilePath,
      path.extname(compareFilePath),
    )}_missing_keys.json`;
    const outputFilePath = path.join(outputDir, outputFileName);
    fs.writeFileSync(outputFilePath, JSON.stringify(keyTranslations, null, 2));
  }
}
