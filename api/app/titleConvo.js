const { Configuration, OpenAIApi } = require('openai');
const _ = require('lodash');

const proxyEnvToAxiosProxy = (proxyString) => {
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
  try {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_KEY
    });
    const openai = new OpenAIApi(configuration);
    const completion = await openai.createChatCompletion(
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are a title-generator with one job: giving a conversation, detect the language and titling the conversation provided by a user in title case, using the same language.'
          },
          {
            role: 'user',
            content: `In 5 words or less, summarize the conversation below with a title in title case using the language the user writes in. Don't refer to the participants of the conversation nor the language. Do not include punctuation or quotation marks. Your response should be in title case, exclusively containing the title. Conversation:\n\nUser: "${text}"\n\n${model}: "${JSON.stringify(
              response?.text
            )}"\n\nTitle: `
          }
        ],
        temperature: 0,
        presence_penalty: 0,
        frequency_penalty: 0,
      },
      { proxy: proxyEnvToAxiosProxy(process.env.PROXY || null) }
    );

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
