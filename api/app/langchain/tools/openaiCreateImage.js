// From https://platform.openai.com/docs/api-reference/images/create
// To use this tool, you must pass in a configured OpenAIApi object.
const { Configuration, OpenAIApi } = require("openai");
const { Tool } = require('langchain/tools');

class OpenAICreateImage extends Tool {
  constructor() {
    super();
    this.openaiApi = new OpenAIApi(new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    }));
    this.name = 'dall-e';
    this.description = `You can generate images with 'dall-e'. Any requested visual output expects your use of this tool. Your input should visually describe the detail of the image you would like to generate. You can describe moods, define structures or proportions, and reproduce styles`;
  }

  replaceNewLinesWithSpaces(inputString) {
    return inputString.replace(/\r\n|\r|\n/g, ' ');
  }

  async _call(input) {
    const resp = await this.openaiApi.createImage({
      prompt: this.replaceNewLinesWithSpaces(input),
      // TODO: Future idea -- could we ask an LLM to extract these arguments from an input that might contain them?
      n: 1,
      size: "1024x1024",
    });

    const theImageUrl = resp.data.data[0].url;

    if (!theImageUrl) {
      throw new Error(`No image URL returned from OpenAI API.`);
    }

    // return `![${input.replace(/\n/g, '')}](${theImageUrl})`;
    return `![generated-image](${theImageUrl})`;
  }
}

module.exports = OpenAICreateImage;