require('dotenv').config();

const fs = require( "fs");
const yaml = require( "js-yaml");
const { OpenAI } = require( "langchain/llms/openai");
const { JsonSpec } = require( "langchain/tools");
const { createOpenApiAgent, OpenApiToolkit } = require( "langchain/agents");

const run = async () => {
  let data;
  try {
    const yamlFile = fs.readFileSync("./app/langchain/demos/klarna.yaml", "utf8");
    data = yaml.load(yamlFile);
    if (!data) {
      throw new Error("Failed to load OpenAPI spec");
    }
  } catch (e) {
    console.error(e);
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    // Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  };
  const model = new OpenAI({ temperature: 0 });
  const toolkit = new OpenApiToolkit(new JsonSpec(data), model, headers);
  const executor = createOpenApiAgent(model, toolkit, { verbose: true });

  const input = `Find me some medium sized blue shirts`;
  console.log(`Executing with input "${input}"...`);

  const result = await executor.call({ input });
  console.log(`Got output ${result.output}`);

  console.log(
    `Got intermediate steps ${JSON.stringify(
      result.intermediateSteps,
      null,
      2
    )}`
  );
};

(async () => {
  await run();
})();