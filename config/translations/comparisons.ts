import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

async function main(baseFilePath: string, languagesDir: string) {
  const { default: baseLanguage } = await import(path.resolve(baseFilePath));
  const files = fs.readdirSync(languagesDir);

  for (const file of files) {
    const ext = path.extname(file);
    if (ext !== '.ts' && ext !== '.tsx') {
      continue;
    }

    const filePath = path.resolve(languagesDir, file);
    if (filePath === baseFilePath) {
      continue;
    }

    const { default: otherLanguage } = await import(filePath);
    const comparisons = {};

    for (const key in otherLanguage) {
      if (
        Object.prototype.hasOwnProperty.call(otherLanguage, key) &&
        Object.prototype.hasOwnProperty.call(baseLanguage, key)
      ) {
        comparisons[key] = {
          english: baseLanguage[key],
          translated: otherLanguage[key],
        };
      }
    }

    let fileContent = fs.readFileSync(filePath, 'utf8');
    const comparisonsObjRegex = /export const comparisons = {[\s\S]*?};/gm;
    const hasComparisons = comparisonsObjRegex.test(fileContent);
    const comparisonsExport = `\nexport const comparisons = ${JSON.stringify(
      comparisons,
      null,
      2,
    )};\n`;

    if (hasComparisons) {
      fileContent = fileContent.replace(comparisonsObjRegex, comparisonsExport);
    } else {
      fileContent = fileContent.trim() + comparisonsExport;
    }

    fs.writeFileSync(filePath, fileContent);
  }

  // Execute ESLint with the --fix option on the entire directory
  exec(`bunx eslint "${languagesDir}" --fix`, (error, stdout, stderr) => {
    if (error) {
      console.error('Error executing ESLint:', error);
      return;
    }
    if (stderr) {
      console.error('ESLint stderr:', stderr);
      return;
    }
    console.log('ESLint stdout:', stdout);
  });
}

const languagesDir = './client/src/localization/languages';
const baseFilePath = path.resolve(languagesDir, 'Eng.ts');

main(baseFilePath, languagesDir).catch(console.error);

// const prompt = `

// Write a prompt that is mindful of the nuances in the language with respect to its English counterpart, which serves as the baseline for translations. Here are the comparisons between the language translations and their English counterparts:

// ${comparisons}

// Please consider the above comparisons to enhance understanding and guide improvements in translations. Provide insights or suggestions that could help refine the translation process, focusing on cultural and contextual relevance.

// Please craft a prompt that can be used to better inform future translations to this language. Write this prompt in the translated language, with all its nuances detected, not in the English.
// `;
