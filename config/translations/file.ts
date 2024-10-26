import path from 'path';
import main from './main';

async function processFile(baseFilePath: string, compareFilename: string) {
  await main(baseFilePath, compareFilename);
}

const args = process.argv.slice(-1);

if (args.length !== 1) {
  console.log(process.argv, args);
  console.error('Usage: bun file.ts <compareFilename>');
  process.exit(1);
}

const languagesDir = './client/src/localization/languages';
const baseFilePath = path.resolve(languagesDir, 'Fa.ts');

const compareFilename = path.resolve(languagesDir, `${args[0]}.ts`);

processFile(baseFilePath, compareFilename).catch(console.error);
