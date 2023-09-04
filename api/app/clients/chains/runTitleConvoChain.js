const { z } = require('zod');
const { createStructuredOutputChainFromZod } = require('langchain/chains/openai_functions');

const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} = require('langchain/prompts');

const langSchema = z.object({
  language: z.string().describe('The language of the input text (full noun, no abbreviations).'),
});

const langPrompt = new ChatPromptTemplate({
  promptMessages: [
    SystemMessagePromptTemplate.fromTemplate('Detect the language used in the following text.'),
    HumanMessagePromptTemplate.fromTemplate('{inputText}'),
  ],
  inputVariables: ['inputText'],
});

const createLanguageChain = async ({ llm }) => {
  return createStructuredOutputChainFromZod(langSchema, {
    prompt: langPrompt,
    llm,
    // verbose: true,
  });
};

const titleSchema = z.object({
  title: z.string().describe('The title of the conversation in the given language.'),
});
const createTitleChain = async ({ llm, convo }) => {
  const titlePrompt = new ChatPromptTemplate({
    promptMessages: [
      SystemMessagePromptTemplate.fromTemplate(
        `Write an extremely concise title for this conversation in the given language. Title in 5 Words or Less. No Punctuation or Quotation. All first letters of every word should be capitalized (resembling title-case), written in the given Language.
||> Conversation:
${convo}`,
      ),
      HumanMessagePromptTemplate.fromTemplate('Language: {language}'),
    ],
    inputVariables: ['language'],
  });
  return createStructuredOutputChainFromZod(titleSchema, {
    prompt: titlePrompt,
    llm,
    // verbose: true,
  });
};

const runTitleConvoChain = async ({ llm, text, convo }) => {
  const languageChain = await createLanguageChain({ llm });
  const titleChain = await createTitleChain({ llm, convo });

  const res = await languageChain.run(text);
  const { language } = res;
  const res2 = await titleChain.run(language);
  return res2.title;
};

module.exports = runTitleConvoChain;
