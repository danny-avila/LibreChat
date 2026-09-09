const fs = require('fs');
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { QuestionnaireValidationError } = require('@librechat/data-schemas');
require('~/db/models');
const { saveQuestionnaire, listQuestionnaires } = require('~/models');
const { silentExit } = require('./helpers');
const connect = require('./connect');

function argValue(name) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.replace(`--${name}=`, '') : undefined;
}

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Update the questionnaire!');
  console.purple('--------------------------');

  const fileValue = argValue('file');
  if (!fileValue) {
    console.orange('Usage: npm run update-questionnaire -- --file=<path/to/questionnaire.json>');
    console.orange('Options:');
    console.orange('  --id=<questionnaireId>  update an existing round instead of creating one');
    console.orange('  --status=draft|active|closed  (activating closes any other active round)');
    console.orange('See config/questionnaire.example.json for the expected shape.');
    silentExit(1);
  }

  const filePath = path.resolve(process.cwd(), fileValue);
  if (!fs.existsSync(filePath)) {
    console.red(`Error: File not found: ${filePath}`);
    silentExit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.red('Error: Could not parse JSON file: ' + error.message);
    silentExit(1);
  }

  const targetId = argValue('id');
  const status = argValue('status') ?? config.status;

  let result;
  try {
    result = await saveQuestionnaire({ ...config, status }, targetId);
  } catch (error) {
    if (error instanceof QuestionnaireValidationError) {
      console.red('Error: ' + error.message);
      silentExit(1);
    }
    console.red('Error: ' + error.message);
    console.error(error);
    silentExit(1);
  }

  console.green('Questionnaire saved successfully!');
  console.purple(`questionnaireId: ${result.questionnaireId}`);
  console.purple(`label: ${result.label}  (Q${result.quarter} ${result.year})`);
  console.purple(`status: ${result.status}`);
  console.purple(`title: ${result.title}`);
  console.purple(`questions: ${result.questions.length}`);
  console.purple(`from: ${result.displayFrom}`);
  console.purple(`to: ${result.displayTo || 'not specified'}`);
  console.purple(`repromptIntervalHours: ${result.repromptIntervalHours}`);

  const all = await listQuestionnaires();
  console.purple(`\nAll rounds (${all.length}):`);
  for (const round of all) {
    const marker = round.questionnaireId === result.questionnaireId ? '  <- saved' : '';
    console.log(
      `  [${round.status}] ${round.label ?? round.title} — ${round.questionnaireId}${marker}`,
    );
  }
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (err.message.includes('fetch failed')) {
    return;
  } else {
    process.exit(1);
  }
});
