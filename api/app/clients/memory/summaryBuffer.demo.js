require('dotenv').config();
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { getBufferString, ConversationSummaryBufferMemory } = require('langchain/memory');

const chatPromptMemory = new ConversationSummaryBufferMemory({
  llm: new ChatOpenAI({ modelName: 'gpt-3.5-turbo', temperature: 0 }),
  maxTokenLimit: 10,
  returnMessages: true,
});

(async () => {
  await chatPromptMemory.saveContext({ input: 'hi my name\'s Danny' }, { output: 'whats up' });
  await chatPromptMemory.saveContext({ input: 'not much you' }, { output: 'not much' });
  await chatPromptMemory.saveContext(
    { input: 'are you excited for the olympics?' },
    { output: 'not really' },
  );

  // We can also utilize the predict_new_summary method directly.
  const messages = await chatPromptMemory.chatHistory.getMessages();
  console.log('MESSAGES\n\n');
  console.log(JSON.stringify(messages));
  const previous_summary = '';
  const predictSummary = await chatPromptMemory.predictNewSummary(messages, previous_summary);
  console.log('SUMMARY\n\n');
  console.log(JSON.stringify(getBufferString([{ role: 'system', content: predictSummary }])));

  // const { history } = await chatPromptMemory.loadMemoryVariables({});
  // console.log('HISTORY\n\n');
  // console.log(JSON.stringify(history));
})();
