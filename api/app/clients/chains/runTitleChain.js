const { z } = require('zod');
const { langPrompt, createTitlePrompt, escapeBraces, getSnippet } = require('../prompts');
const { createStructuredOutputChainFromZod } = require('langchain/chains/openai_functions');

const langSchema = z.object({
  language: z.string().describe('The language of the input text (full noun, no abbreviations).'),
});

const createLanguageChain = ({ llm, callbacks }) =>
  createStructuredOutputChainFromZod(langSchema, {
    prompt: langPrompt,
    callbacks,
    llm,
    // verbose: true,
  });

const titleSchema = z.object({
  title: z.string().describe('The conversation title in title-case, in the given language.'),
});
const createTitleChain = ({ llm, convo, callbacks }) => {
  const titlePrompt = createTitlePrompt({ convo });
  return createStructuredOutputChainFromZod(titleSchema, {
    prompt: titlePrompt,
    callbacks,
    llm,
    // verbose: true,
  });
};

const runTitleChain = async ({ llm, text, convo, callbacks }) => {
  let snippet = text;
  try {
    snippet = getSnippet(text);
  } catch (e) {
    console.log('Error getting snippet of text for titleChain');
    console.log(e);
  }
  const languageChain = createLanguageChain({ llm, callbacks });
  const titleChain = createTitleChain({ llm, callbacks, convo: escapeBraces(convo) });
  const { language } = await languageChain.run(snippet);
  return (await titleChain.run(language)).title;
};

module.exports = runTitleChain;
