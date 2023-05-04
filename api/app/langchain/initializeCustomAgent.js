const CustomZeroShotAgent = require('./customZeroShotAgent');
const { prefix, suffix } = require('./instructions');
const { LLMChain } = require('langchain/chains');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const { ZeroShotAgent, AgentExecutor, ZeroShotAgentOutputParser } = require('langchain/agents');
const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate
} = require('langchain/prompts');

const initializeCustomAgent = async ({ tools, model, pastMessages, currentDateString, ...rest }) => {
  const prompt = ZeroShotAgent.createPrompt(tools, {
    prefix: `Assistant is a large language model trained by OpenAI.\nKnowledge Cutoff: ${currentDateString}\nCurrent date: ${currentDateString}\n\n${prefix}`,
    suffix,
    inputVariables: ['input', 'chat_history', 'agent_scratchpad']
  });

  console.log('pastMessages', pastMessages);

  const chatPrompt = ChatPromptTemplate.fromPromptMessages([
    new SystemMessagePromptTemplate(prompt),
    HumanMessagePromptTemplate.fromTemplate(`{chat_history}
    Query: {input}
    {agent_scratchpad}`)
  ]);

  let longestToolName = '';
  for (const tool of tools) {
    if (tool.name.length > longestToolName.length) {
      longestToolName = tool.name;
    }
  }

  class CustomOutputParser extends ZeroShotAgentOutputParser {
    constructor(fields) {
      super(fields);
      this.finishToolNameRegex = /(?:the\s+)?final\s+answer[:\s]*\s*/i;
    }

    async parse(text) {
      const finalMatch = text.match(this.finishToolNameRegex);
      // if (text.includes(this.finishToolName)) {
      //   const parts = text.split(this.finishToolName);
      //   const output = parts[parts.length - 1].trim();
      //   return {
      //     returnValues: { output },
      //     log: text
      //   };
      // }

      if (finalMatch) {
        const output = text.substring(finalMatch.index + finalMatch[0].length).trim();
        return {
          returnValues: { output },
          log: text
        };
      }
      // const match = /Action: (.*)\nAction Input: (.*)/s.exec(text); // old
      // const match = /Action: ([\s\S]*?)(?:\nAction Input: ([\s\S]*?))?$/.exec(text); //old
      const match = /(?:Action(?: 1)?:) ([\s\S]*?)(?:\n(?:Action Input(?: 1)?:) ([\s\S]*?))?$/.exec(text); //new
      if (!match || (match && match[1].trim() === 'N/A') || (match && !match[2])) {
        const thought = text.replace(/[tT]hought:/, '').split('\n')[0].trim();
        return {
          tool: 'N/A',
          toolInput: 'None',
          log: thought
        };
      }

      if (match && match[1].trim().length > longestToolName.length) {
        console.log('\n\n<----------------------HIT PARSING ERROR---------------------->\n\n');

        let action, input, thought;
        let firstIndex = Infinity;
    
        for (const tool of tools) {
          const toolIndex = text.indexOf(tool);
          if (toolIndex !== -1 && toolIndex < firstIndex) {
            firstIndex = toolIndex;
            action = tool;
          }
        }
    
        if (action) {
          const actionEndIndex = text.indexOf('Action:', firstIndex + action.length);
          const inputText = text.slice(firstIndex + action.length, actionEndIndex !== -1 ? actionEndIndex : undefined).trim();
          const inputLines = inputText.split('\n');
          input = inputLines[0];
          if (inputLines.length > 1) {
            thought = inputLines.slice(1).join('\n');
          }
          return {
            tool: action,
            toolInput: input,
            log: thought || inputText
          };
        } else {
          console.log('No valid tool mentioned.');
          return {
            tool: 'self-reflection',
            toolInput: 'Hypothetical actions: \n"'+text+'"\n',
            log: 'Thought: I need to look at my hypothetical actions and try each one according to the requested format one at a time'
          };
        }
    
        // if (action && input) {
        //   console.log('Action:', action);
        //   console.log('Input:', input);
        // }
      }
    
    

      return {
        tool: match[1].trim(),
        toolInput: match[2].trim().replace(/^"+|"+$/g, '') ?? '',
        log: text
      };
    }
  }

  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    // returnMessages: true, // commenting this out retains memory
    memoryKey: 'chat_history',
    humanPrefix: 'User',
    aiPrefix: 'Assistant',
    inputKey: 'input',
    outputKey: 'output'
  });

  const llmChain = new LLMChain({
    prompt: chatPrompt,
    llm: model
  });

  const agent = new CustomZeroShotAgent({
    llmChain,
    outputParser: new CustomOutputParser(),
    allowedTools: tools.map((tool) => tool.name)
  });

  return AgentExecutor.fromAgentAndTools({ agent, tools, memory, ...rest });
};

module.exports = {
  initializeCustomAgent
};
