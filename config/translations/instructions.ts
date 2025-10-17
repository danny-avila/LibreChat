import path from 'path';
import fs from 'fs';

const baseDirPath = './client/src/localization/languages';
const promptsDirPath = './client/src/localization/prompts/instructions';

async function ensureDirectoryExists(directory: string) {
  return fs.promises
    .access(directory)
    .catch(() => fs.promises.mkdir(directory, { recursive: true }));
}

// Helper function to generate Markdown from an object, recursively if needed
function generateMarkdownFromObject(obj: object, depth = 0): string {
  if (typeof obj !== 'object' || obj === null) {
    return String(obj);
  }

  const indent = ' '.repeat(depth * 2);
  return Object.entries(obj)
    .map(([key, value]) => {
      if (typeof value === 'object') {
        return `\n${indent}- **${key}**:${generateMarkdownFromObject(value, depth + 1)}`;
      }
      return `${key === 'english' ? '\n' : ''}${indent}- **${key}**: ${value}`;
    })
    .join('\n');
}

async function generatePromptForFile(filePath: string, fileName: string) {
  const modulePath = path.resolve(filePath); // Ensuring path is correctly resolved
  const fileModule = await import(modulePath); // Dynamically importing the file as a module
  let comparisonsMarkdown = '';

  if (fileModule.comparisons) {
    comparisonsMarkdown = generateMarkdownFromObject(fileModule.comparisons);
  } else {
    comparisonsMarkdown = 'No comparisons object found.';
  }

  // Creating markdown content
  const promptContent = `# Instructions for Translation

Write a prompt that is mindful of the nuances in the language with respect to its English counterpart, which serves as the baseline for translations. Here are the comparisons between the language translations and their English counterparts:

${comparisonsMarkdown}

Please consider the above comparisons to enhance understanding and guide improvements in translations.

Provide insights or suggestions that could help refine the translation process, focusing on cultural and contextual relevance.

Please craft a prompt that can be used to better inform future translations to this language.

Write this prompt in the translated language, with all its nuances detected, not in the English.
`;

  return promptContent;
}

async function createPromptsForTranslations() {
  await ensureDirectoryExists(promptsDirPath);

  const files = await fs.promises.readdir(baseDirPath);

  for (const file of files) {
    if (!file.includes('Eng.ts')) {
      // Ensure English or base file is excluded
      const filePath = path.join(baseDirPath, file);
      const promptContent = await generatePromptForFile(filePath, file);
      const outputFilePath = path.join(promptsDirPath, `${path.basename(file, '.ts')}.md`);

      await fs.promises.writeFile(outputFilePath, promptContent);
      console.log(`Prompt created for: ${file}`);
    }
  }
}

createPromptsForTranslations().then(() => console.log('Prompts generation completed.'));
