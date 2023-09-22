const { z } = require('zod');
const { langPrompt, createTitlePrompt } = require('../prompts');
const { escapeBraces, getSnippet } = require('../output_parsers');
const { createStructuredOutputChainFromZod } = require('langchain/chains/openai_functions');

const langSchema = z.object({
  language: z.string().describe('The language of the input text (full noun, no abbreviations).'),
});

const createLanguageChain = ({ llm }) =>
  createStructuredOutputChainFromZod(langSchema, {
    prompt: langPrompt,
    llm,
    // verbose: true,
  });

const titleSchema = z.object({
  title: z.string().describe('The conversation title in title-case, in the given language.'),
});
const createTitleChain = ({ llm, convo }) => {
  const titlePrompt = createTitlePrompt({ convo });
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
    console.log('Error getting snippet of text for titleChain');
    console.log(e);
  }
  const languageChain = createLanguageChain({ llm });
  const titleChain = createTitleChain({ llm, convo: escapeBraces(convo) });
  const { language } = await languageChain.run(snippet);
  return (await titleChain.run(language)).title;
};

module.exports = runTitleChain;
