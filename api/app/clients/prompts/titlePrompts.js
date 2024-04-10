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
        `Write a concise title for this conversation in the given language. Title in 5 Words or Less. No Punctuation or Quotation. Must be in Title Case, written in the given Language.
${convo}`,
      ),
      HumanMessagePromptTemplate.fromTemplate('Language: {language}'),
    ],
    inputVariables: ['language'],
  });

  return titlePrompt;
};

const titleInstruction =
  'a concise, 5-word-or-less title for the conversation, using its same language, with no punctuation. Apply title case conventions appropriate for the language. For English, use AP Stylebook Title Case. Never directly mention the language name or the word "title"';
const titleFunctionPrompt = `In this environment you have access to a set of tools you can use to generate the conversation title.
  
You may call them like this:
<function_calls>
<invoke>
<tool_name>$TOOL_NAME</tool_name>
<parameters>
<$PARAMETER_NAME>$PARAMETER_VALUE</$PARAMETER_NAME>
...
</parameters>
</invoke>
</function_calls>

Here are the tools available:
<tools>
<tool_description>
<tool_name>submit_title</tool_name>
<description>
Submit a brief title in the conversation's language, following the parameter description closely.
</description>
<parameters>
<parameter>
<name>title</name>
<type>string</type>
<description>${titleInstruction}</description>
</parameter>
</parameters>
</tool_description>
</tools>`;

/**
 * Parses titles from title functions based on the provided prompt.
 * @param {string} prompt - The prompt containing the title function.
 * @returns {string} The parsed title. "New Chat" if no title is found.
 */
function parseTitleFromPrompt(prompt) {
  const titleRegex = /<title>(.+?)<\/title>/;
  const titleMatch = prompt.match(titleRegex);

  if (titleMatch && titleMatch[1]) {
    const title = titleMatch[1].trim();

    // // Capitalize the first letter of each word; Note: unnecessary due to title case prompting
    // const capitalizedTitle = title.replace(/\b\w/g, (char) => char.toUpperCase());

    return title;
  }

  return 'New Chat';
}

module.exports = {
  langPrompt,
  titleInstruction,
  createTitlePrompt,
  titleFunctionPrompt,
  parseTitleFromPrompt,
};
