// From https://platform.openai.com/docs/api-reference/images/create
// To use this tool, you must pass in a configured OpenAIApi object.
const { Configuration, OpenAIApi } = require('openai');
const { Tool } = require('langchain/tools');
const saveImageFromUrl = require('./saveImageFromUrl');
const path = require('path');

class OpenAICreateImage extends Tool {
  constructor() {
    super();
    this.openaiApi = new OpenAIApi(
      new Configuration({
        apiKey: process.env.OPENAI_API_KEY
      })
    );
    this.name = 'dall-e';
    this.description = `You can generate images with 'dall-e'.
    Guidelines:
    - Visually describe the moods, details, structures, styles, and/or proportions of the image
    - It's best to follow this format for image creation. Come up with the optional inputs yourself if none are given:
    "Subject: [subject], Style: [style], Color: [color], Details: [details], Emotion: [emotion]"
    - Generate images only once per human query unless explicitly requested by the user`;
  }
  // "Subject": "Mona Lisa",
  // "Style": "Chinese traditional painting",
  // "Color": "Mainly wash tones of ink, with small color blocks in some parts",
  // "Details": "Mona Lisa should have long hair, a silk dress, holding a fan. The background should have mountains and trees.",
  // "Emotion": "Serene and elegant"

  replaceNewLinesWithSpaces(inputString) {
    return inputString.replace(/\r\n|\r|\n/g, ' ');
  }

  getMarkdownImageUrl(imageName) {
    const imageUrl = path.join(this.relativeImageUrl, imageName).replace(/\\/g, '/');
    return `![generated image](/${imageUrl})`;
  }
  
  async _call(input) {
    const resp = await this.openaiApi.createImage({
      prompt: this.replaceNewLinesWithSpaces(input),
      // TODO: Future idea -- could we ask an LLM to extract these arguments from an input that might contain them?
      n: 1,
      // size: '1024x1024'
      size: '512x512'
    });

    const theImageUrl = resp.data.data[0].url;

    if (!theImageUrl) {
      throw new Error(`No image URL returned from OpenAI API.`);
    }

    const regex = /img-[\w\d]+.png/;
    const match = theImageUrl.match(regex);
    let imageName = '1.png';

    if (match) {
      imageName = match[0];
      console.log(imageName); // Output: img-lgCf7ppcbhqQrz6a5ear6FOb.png
    } else {
      console.log('No image name found in the string.');
    }

    this.outputPath = path.resolve(__dirname, '..', '..', '..', '..', 'client', 'dist', 'images');
    const appRoot = path.resolve(__dirname, '..', '..', '..', '..','client');
    this.relativeImageUrl = path.relative(appRoot, this.outputPath);

    try {
      await saveImageFromUrl(theImageUrl, this.outputPath, imageName);
      this.result = this.getMarkdownImageUrl(imageName);
    } catch (error) {
      console.error('Error while saving the image:', error);
      this.result = theImageUrl;
    }

    return this.result;
  }
}

module.exports = OpenAICreateImage;
