const { PromptTemplate } = require('langchain/prompts');

const refinePromptTemplate = `Your job is to produce a final summary of the following conversation.
We have provided an existing summary up to a certain point: "{existing_answer}"
We have the opportunity to refine the existing summary
(only if needed) with some more context below.
------------
"{text}"
------------

Given the new context, refine the original summary of the conversation.
Do note who is speaking in the conversation to give proper context.
If the context isn't useful, return the original summary.

REFINED CONVERSATION SUMMARY:`;

const refinePrompt = new PromptTemplate({
  template: refinePromptTemplate,
  inputVariables: ["existing_answer", "text"],
});

module.exports = {
  refinePrompt,
};