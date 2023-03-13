const { Configuration, OpenAIApi } = require('openai');

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
  
  return proxyConfig
}
console.log(proxyEnvToAxiosProxy(process.env.PROXY || null))

const titleConvo = async ({ message, response, model }) => {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY
  });
  const openai = new OpenAIApi(configuration);
  const completion = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content:
          'You are a title-generator with one job: giving a conversation, detect the language and titling the conversation provided by a user in title case, using the same language.'
      },
      { role: 'user', content: `In 5 words or less, summarize the conversation below with a title in title case using the language the user writes in. Don't refer to the participants of the conversation by name. Do not include punctuation or quotation marks. Your response should be in title case, exclusively containing the title. Conversation:\n\nUser: "${message}"\n\n${model}: "${response}"\n\nTitle: ` },
    ]
  }, { proxy: proxyEnvToAxiosProxy(process.env.PROXY || null) });

  //eslint-disable-next-line
  return completion.data.choices[0].message.content.replace(/["\.]/g, '');
};

module.exports = titleConvo;
