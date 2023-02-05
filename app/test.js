require('dotenv').config();
// docs https://github.com/transitive-bullshit/chatgpt-api

(async () => {
  const { ChatGPTAPI } = await import('chatgpt');

  const api = new ChatGPTAPI({ apiKey: process.env.OPENAI_KEY });

  // send a message and wait for the response
  let res = await api.sendMessage('What is OpenAI?');
  console.log(res);
})();

// If you want to track the conversation, you'll need to pass the parentMessageid and conversationid:
// See example in models/Message.js

/*
// You can add streaming via the onProgress handler:
// timeout after 2 minutes (which will also abort the underlying HTTP request)
const res = await api.sendMessage('Write a 500 word essay on frogs.', {
  // print the partial response as the AI is "typing"
  onProgress: (partialResponse) => console.log(partialResponse.text)
})

// print the full text at the end
console.log(res.text)
*/