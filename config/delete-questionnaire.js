const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { QuestionnaireValidationError } = require('@librechat/data-schemas');
require('~/db/models');
const { listQuestionnaires, getQuestionnaireById, deleteQuestionnaire } = require('~/models');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

function argValue(name) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.replace(`--${name}=`, '') : undefined;
}

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Delete the questionnaire!');
  console.purple('--------------------------');

  try {
    const targetId = argValue('id');
    const force = process.argv.includes('--force');

    const all = await listQuestionnaires();
    if (all.length === 0) {
      console.yellow('No questionnaire found to delete.');
      silentExit(0);
    }

    if (!targetId) {
      console.purple(`Rounds (${all.length}):`);
      for (const round of all) {
        console.log(
          `  [${round.status}] ${round.label ?? round.title} — ${round.questionnaireId} (${round.responseCount} responses)`,
        );
      }
      console.orange('\nUsage: npm run delete-questionnaire -- --id=<questionnaireId>');
      console.orange('  --force  also discard existing responses');
      silentExit(1);
    }

    const questionnaire = await getQuestionnaireById(targetId);
    if (!questionnaire) {
      console.red(`No questionnaire found with id "${targetId}".`);
      silentExit(1);
    }

    const summary = all.find((round) => round.questionnaireId === targetId);

    console.purple('Questionnaire to delete:');
    console.log(`Label: ${questionnaire.label ?? '(none)'}`);
    console.log(`Status: ${questionnaire.status}`);
    console.log(`Title: ${questionnaire.title}`);
    console.log(`Questions: ${questionnaire.questions.length}`);
    console.log(`Responses: ${summary?.responseCount ?? 0}`);
    console.log(`Display From: ${questionnaire.displayFrom}`);
    console.log(`Display To: ${questionnaire.displayTo || 'Not specified'}`);

    const confirmDelete = await askQuestion('Do you want to delete this questionnaire? (y/N): ');
    if (confirmDelete.toLowerCase() !== 'y') {
      console.yellow('Questionnaire deletion cancelled.');
      silentExit(0);
    }

    try {
      await deleteQuestionnaire(targetId, { force });
      console.green('Questionnaire deleted successfully!');
    } catch (error) {
      if (error instanceof QuestionnaireValidationError) {
        console.red('Error: ' + error.message);
        console.orange('Re-run with --force to delete it and its responses anyway.');
        silentExit(1);
      }
      throw error;
    }
  } catch (error) {
    console.red('Error: ' + error.message);
    console.error(error);
    silentExit(1);
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
