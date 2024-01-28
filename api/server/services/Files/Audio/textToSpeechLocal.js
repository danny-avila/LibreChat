// const { Buffer }  = require('buffer');

async function textToSpeechLocal(req, res) {
  const response = 'Test response';

  console.log(req);

  res.send('Test response');

  // const mp3Buffer = Buffer.from(await response.arrayBuffer());

  return response;
}

module.exports = textToSpeechLocal;
