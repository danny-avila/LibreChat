const { Configuration, OpenAIApi } = require('openai');

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
          'You are a title-generator with one job: titling the conversation provided by a user in title case.'
      },
      { role: 'user', content: `In 5 words or less, summarize the conversation below with a title in title case. Don't refer to the participants of the conversation by name. Do not include punctuation or quotation marks. Your response should be in title case, exclusively containing the title. Title the conversation in the language the user writes in. Conversation:\n\nUser: "${message}"\n\n${model}: "${response}"\n\nTitle: ` },
    ]
  });

  //eslint-disable-next-line
  return completion.data.choices[0].message.content.replace(/["\.]/g, '');
};

module.exports = titleConvo;
