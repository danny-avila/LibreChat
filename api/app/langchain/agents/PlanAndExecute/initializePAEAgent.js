const { ChainStepExecutor, LLMPlanner, PlanOutputParser, PlanAndExecuteAgentExecutor } = require( "langchain/experimental/plan_and_execute");
const { LLMChain } = require('langchain/chains');
const { ChatAgent, AgentExecutor } = require('langchain/agents');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate
} = require('langchain/prompts');

const DEFAULT_STEP_EXECUTOR_HUMAN_CHAT_MESSAGE_TEMPLATE = `{chat_history}

Previous steps: {previous_steps}
Current objective: {current_step}
{agent_scratchpad}
You may extract and combine relevant data from your previous steps when responding to me.`;

const PLANNER_SYSTEM_PROMPT_MESSAGE_TEMPLATE = [
  `Let's first understand the problem and devise a plan to solve the problem.`,
  `Please output the plan starting with the header "Plan:"`,
  `and then followed by a numbered list of steps.`,
  `Please make the plan the minimum number of steps required`,
  `to answer the query or complete the task accurately and precisely.`,
  `Your steps should be general, and should not require a specific method to solve a step. If the task is a question,`,
  `the final step in the plan must be the following: "Given the above steps taken,`,
  `please respond to the original query."`,
  `At the end of your plan, say "<END_OF_PLAN>"`,
].join(" ");

const PLANNER_CHAT_PROMPT =
  /* #__PURE__ */ ChatPromptTemplate.fromPromptMessages([
    /* #__PURE__ */ SystemMessagePromptTemplate.fromTemplate(
      PLANNER_SYSTEM_PROMPT_MESSAGE_TEMPLATE
    ),
    /* #__PURE__ */ HumanMessagePromptTemplate.fromTemplate(`{input}`),
  ]);

const initializePAEAgent = async ({ tools: _tools, model: llm, pastMessages, ...rest }) => { //removed currentDateString
  const tools = _tools.filter((tool) => tool.name !== 'self-reflection');

  const memory = new BufferMemory({
    chatHistory: new ChatMessageHistory(pastMessages),
    // returnMessages: true, // commenting this out retains memory
    memoryKey: 'chat_history',
    humanPrefix: 'User',
    aiPrefix: 'Assistant',
    inputKey: 'input',
    outputKey: 'output'
  });

  const plannerLlmChain = new LLMChain({
    llm,
    prompt: PLANNER_CHAT_PROMPT,
    memory,
  });
  const planner = new LLMPlanner(plannerLlmChain, new PlanOutputParser());

  const agent = ChatAgent.fromLLMAndTools(llm, tools, {
    humanMessageTemplate: DEFAULT_STEP_EXECUTOR_HUMAN_CHAT_MESSAGE_TEMPLATE,
  });

  const stepExecutor = new ChainStepExecutor(
    AgentExecutor.fromAgentAndTools({ agent, tools, memory, ...rest })
  );

  return new PlanAndExecuteAgentExecutor({
    planner,
    stepExecutor,
  });
};

module.exports = {
  initializePAEAgent
};
