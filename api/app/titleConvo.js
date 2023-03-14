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
          'Vous êtes un générateur de titres avec une seule tâche : donner une conversation, détecter la langue et titrer la conversation fournie par un utilisateur en cas de titre, en utilisant la même langue.'
      },
      { role: 'user', content: `En 5 mots ou moins, résumez la conversation ci-dessous avec un titre en majuscules en utilisant la langue dans laquelle l'utilisateur écrit. Ne faites pas référence aux participants de la conversation par leur nom. N'incluez pas de ponctuation ou de guillemets. Votre réponse doit être rédigée en majuscules et contenir exclusivement le titre. Conversation:\n\nUser: "${message}"\n\n${model}: "${response}"\n\nTitle: ` },
    ]
  });

  //eslint-disable-next-line
  return completion.data.choices[0].message.content.replace(/["\.]/g, '');
};

module.exports = titleConvo;
