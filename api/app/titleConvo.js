const { Configuration, OpenAIApi } = require('openai');
const _ = require('lodash');

const proxyEnvToAxiosProxy = proxyString => {
  if (!proxyString) return null;

  const regex = /^([^:]+):\/\/(?:([^:@]*):?([^:@]*)@)?([^:]+)(?::(\d+))?/;
  const [, protocol, username, password, host, port] = proxyString.match(regex);
  const proxyConfig = {
    protocol,
    host,
    port: port ? parseInt(port) : undefined,
    auth: username && password ? { username, password } : undefined
  };

  return proxyConfig;
};

const titleConvo = async ({ model, text, response }) => {
  let title = 'New Chat';

  const request = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content:
          "You are a title-generator with one job: giving a conversation, detect the language and titling the conversation provided by a user, using the same language. The requirement are: 1. If possible, generate in 5 words or less, 2. Using title case, 3. must give the title using the language as the user said. 4. Don't refer to the participants of the conversation. 5. Do not include punctuation or quotation marks. 6. Your response should be in title case, exclusively containing the title. 7. don't say anything except the title."
      },
      {
        role: 'user',
        content: `User:\n "${text}"\n\n${model}: \n"${JSON.stringify(response?.text)}"\n\n`
      }
    ],
    temperature: 0,
    presence_penalty: 0,
    frequency_penalty: 0
  };

  // console.log('REQUEST', request);

  try {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_KEY
    });
    const openai = new OpenAIApi(configuration);
    const completion = await openai.createChatCompletion(request, {
      proxy: proxyEnvToAxiosProxy(process.env.PROXY || null)
    });

    //eslint-disable-next-line
    title = completion.data.choices[0].message.content.replace(/["\.]/g, '');
  } catch (e) {
    console.error(e);
    console.log('There was an issue generating title, see error above');
  }

  console.log('CONVERSATION TITLE', title);
  return title;
};

const throttledTitleConvo = _.throttle(titleConvo, 1000);

module.exports = throttledTitleConvo;
