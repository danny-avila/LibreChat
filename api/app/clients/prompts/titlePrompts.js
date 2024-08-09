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
        `Write a concise title for this conversation in the given language.
Title in 5 Words or Less. No Punctuation or Quotation.
Must be in Title Case, written in the given Language.
Find an appropriate emoji to start the title.
Examples:
🌿 Sustainable Gardening Tips
🚀 Space Exploration Future Plans
🎨 Modern Art Movement Analysis
🏋️ Effective Workout Routines Explained
🍳 Quick Healthy Breakfast Ideas

${convo}`,
      ),
      HumanMessagePromptTemplate.fromTemplate('Language: {language}'),
    ],
    inputVariables: ['language'],
  });

  return titlePrompt;
};

const titleInstruction =
  'a concise, 5-word-or-less title for the conversation, using its same language, with no punctuation. Apply title case conventions appropriate for the language. Never directly mention the language name or the word "title"';
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

const genTranslationPrompt = (
  translationPrompt,
) => `In this environment you have access to a set of tools you can use to translate text.
  
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
<tool_name>submit_translation</tool_name>
<description>
Submit a translation in the target language, following the parameter description and its language closely.
</description>
<parameters>
<parameter>
<name>translation</name>
<type>string</type>
<description>${translationPrompt}
ONLY include the generated translation without quotations, nor its related key</description>
</parameter>
</parameters>
</tool_description>
</tools>`;

/**
 * Parses specified parameter from the provided prompt.
 * @param {string} prompt - The prompt containing the desired parameter.
 * @param {string} paramName - The name of the parameter to extract.
 * @returns {string} The parsed parameter's value or a default value if not found.
 */
function parseParamFromPrompt(prompt, paramName) {
  const paramRegex = new RegExp(`<${paramName}>([\\s\\S]+?)</${paramName}>`);
  const paramMatch = prompt.match(paramRegex);

  if (paramMatch && paramMatch[1]) {
    return paramMatch[1].trim();
  }

  if (prompt && prompt.length) {
    return `NO TOOL INVOCATION: ${prompt}`;
  }
  return `No ${paramName} provided`;
}

module.exports = {
  langPrompt,
  titleInstruction,
  createTitlePrompt,
  titleFunctionPrompt,
  parseParamFromPrompt,
  genTranslationPrompt,
};
