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
          'You are a helpful title-generator with one job: titling in title case the conversation provided by a user. You do not reply with anything but a succinct title that summarizes the conversation in title case, ideally around 5 words or less. You do not refer to the participants of the conversation by name. Do not include punctuation or quotation marks. Your response should be in title case, exclusively containing the title.'
      },
      { role: 'user', content: `Please title this conversation: User:"${message}" ${model}:"${response}" Title:` },
    ]
  });

  return completion.data.choices[0].message.content;
};

module.exports = titleConvo;
