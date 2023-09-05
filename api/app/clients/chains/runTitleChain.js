const { z } = require('zod');
const { createStructuredOutputChainFromZod } = require('langchain/chains/openai_functions');
const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} = require('langchain/prompts');

// Escaping curly braces is necessary for LangChain to correctly process the prompt
function escapeBraces(str) {
  return str
    .replace(/({{2,})|(}{2,})/g, (match) => `${match[0]}`)
    .replace(/{|}/g, (match) => `${match}${match}`);
}

function getSnippet(text) {
  let limit = 50;
  let splitText = escapeBraces(text).split(' ');

  if (splitText.length === 1 && splitText[0].length > limit) {
    return splitText[0].substring(0, limit);
  }

  let result = '';
  let spaceCount = 0;

  for (let i = 0; i < splitText.length; i++) {
    if (result.length + splitText[i].length <= limit) {
      result += splitText[i] + ' ';
      spaceCount++;
    } else {
      break;
    }

    if (spaceCount == 10) {
      break;
    }
  }

  return result.trim();
}

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
  title: z.string().describe('The title-cased title of the conversation in the given language.'),
});
const createTitleChain = async ({ llm, convo }) => {
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
  return createStructuredOutputChainFromZod(titleSchema, {
    prompt: titlePrompt,
    llm,
    // verbose: true,
  });
};

const runTitleChain = async ({ llm, text, convo }) => {
  let snippet = text;
  try {
    snippet = getSnippet(text);
  } catch (e) {
    console.log('Error processing text for titleChain');
    console.log(e);
  }
  const languageChain = await createLanguageChain({ llm });
  const titleChain = await createTitleChain({ llm, convo: escapeBraces(convo) });
  const { language } = await languageChain.run(snippet);
  return (await titleChain.run(language)).title;
};

module.exports = runTitleChain;
