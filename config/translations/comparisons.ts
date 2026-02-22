import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

async function main(languagesDir: string) {
  const files = fs.readdirSync(languagesDir);

  for (const file of files) {
    const ext = path.extname(file);
    if (ext !== '.ts' && ext !== '.tsx') {
      continue;
    }

    const filePath = path.resolve(languagesDir, file);

    let fileContent = fs.readFileSync(filePath, 'utf8');
    const comparisonsObjRegex = /export const comparisons = {[\s\S]*?};/gm;

    if (comparisonsObjRegex.test(fileContent)) {
      // Remove the comparisons object
      fileContent = fileContent.replace(comparisonsObjRegex, '');

      // Remove any empty lines at the end of the file
      fileContent = fileContent.trim() + '\n';

      fs.writeFileSync(filePath, fileContent);
      console.log(`Removed comparisons from ${file}`);
    } else {
      console.log(`No comparisons found in ${file}`);
    }
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

main(languagesDir).catch(console.error);
