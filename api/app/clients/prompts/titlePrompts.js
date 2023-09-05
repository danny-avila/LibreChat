const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} = require('langchain/prompts');

const langPrompt = new ChatPromptTemplate({
  promptMessages: [
    SystemMessagePromptTemplate.fromTemplate('Detect the language used in the following text.'),
    HumanMessagePromptTemplate.fromTemplate('{inputText}'),
  ],
  inputVariables: ['inputText'],
});

const createTitlePrompt = ({ convo }) => {
  const titlePrompt = new ChatPromptTemplate({
    promptMessages: [
      SystemMessagePromptTemplate.fromTemplate(
        `Write a concise title for this conversation in the given language. Title in 5 Words or Less. No Punctuation or Quotation. All first letters of every word must be capitalized (resembling title-case), written in the given Language.
${convo}`,
      ),
      HumanMessagePromptTemplate.fromTemplate('Language: {language}'),
    ],
    inputVariables: ['language'],
  });

  return titlePrompt;
};

module.exports = {
  langPrompt,
  createTitlePrompt,
};
