// Generates image using stable diffusion webui's api (automatic1111)
const { Tool } = require('langchain/tools');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

class StableDiffusionApi extends Tool {
  constructor() {
    super();
    this.name = 'stable-diffusion';
    this.description = `You can generate images with 'stable-diffusion'.
    Guidelines:
    - Visually describe the moods, details, structures, styles, and/or proportions of the image
    - It's best to follow this format for image creation:
    "[detailed keywords to describe the subject, separated by comma] | [keywords that tool should avoid]"
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

  getServerURL() {
    const url = process.env.SD_WEBUI_URL || '';
    if (!url) {
      throw new Error('Missing SD_WEBUI_URL environment variable.');
    }
    return url;
  }

  async _call(input) {
    const url = this.getServerURL();
    const payload = {
      prompt: input.split('|')[0],
      negative_prompt: input.split('|')[1],
      steps: 20,
    };
    const response = await axios.post(`${url}/sdapi/v1/txt2img`, payload);
    const image = response.data.images[0];

    const pngPayload = { image: `data:image/png;base64,${image}` };
    const response2 = await axios.post(`${url}/sdapi/v1/png-info`, pngPayload);
    const info = response2.data.info;

    // Generate unique name
    const imageName = `${Date.now()}.png`;
    this.outputPath = path.resolve(__dirname, '..', '..', '..', '..', 'client', 'dist', 'images');
    const appRoot = path.resolve(__dirname, '..', '..', '..', '..', 'client');
    this.relativeImageUrl = path.relative(appRoot, this.outputPath);

    try {
      const buffer = Buffer.from(image.split(',', 1)[0], 'base64');
      await sharp(buffer)
        .withMetadata({
          iptcpng: {
            parameters: info,
          },
        })
        .toFile(this.outputPath + '/' + imageName);
      this.result = this.getMarkdownImageUrl(imageName);
    } catch (error) {
      console.error('Error while saving the image:', error);
      this.result = theImageUrl;
    }

    return this.result;
  }
}

module.exports = StableDiffusionApi;
