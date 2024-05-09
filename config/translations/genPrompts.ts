const fs = require('fs');
const path = require('path');

const baseDirPath = 'client/src/localization/languages';
const promptsDirPath = 'client/src/localization/prompts';
const baseFilePath = path.join(baseDirPath, 'english.ts'); // Assuming 'english.ts' is the baseline file

function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function readKeys(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const objString = fileContent.match(/export default\s+({[\s\S]*?});\s*$/)[1];
    return Object.keys(eval('(' + objString + ')'));
  } catch (error) {
    console.error('Error reading keys from file:', error.message);
    return [];
  }
}

function generatePromptMarkdown(missingKeys) {
  let comparisons = missingKeys.map(key => `- \`${key}\`: Key missing in translation`).join('\n');
  if (missingKeys.length === 0) {
    comparisons = 'All keys are present in the translation file.';
  }

  return `# Translation Prompt

Write a prompt that is mindful of the nuances in the language with respect to its English counterpart, which serves as the baseline for translations. Here are the comparisons between the language translations and their English counterparts:

${comparisons}

Please consider the above comparisons to enhance understanding and guide improvements in translations. Provide insights or suggestions that could help refine the translation process, focusing on cultural and contextual relevance.

Please craft a prompt that can be used to better inform future translations to this language. Write this prompt in the translated language, with all its nuances detected, not in the English.
`;
}

function createPromptsForAllLanguages() {
  const baseKeys = readKeys(baseFilePath);
  const files = fs.readdirSync(baseDirPath);

  ensureDirectoryExists(promptsDirPath);

  files.forEach(file => {
    if (file.toLowerCase() !== 'english.ts') { // Skipping the English file
      const filePath = path.join(baseDirPath, file);
      const compareKeys = readKeys(filePath);
      const missingKeys = baseKeys.filter(key => !compareKeys.includes(key));
      const promptContent = generatePromptMarkdown(missingKeys);
      const outputFilePath = path.join(promptsDirPath, `${path.basename(file, '.ts')}.md`);

      fs.writeFileSync(outputFilePath, promptContent);
      console.log(`Prompt created for: ${file}`);
    }
  });
}

createPromptsForAllLanguages();
