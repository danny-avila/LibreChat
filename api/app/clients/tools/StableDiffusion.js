// Generates image using stable diffusion webui's api (automatic1111)
const fs = require('fs');
const { Tool } = require('langchain/tools');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

class StableDiffusionAPI extends Tool {
  constructor(fields) {
    super();
    this.name = 'stable-diffusion';
    this.url = fields.SD_WEBUI_URL || this.getServerURL();
    this.description = `You can generate images with 'stable-diffusion'. This tool is exclusively for visual content.
Guidelines:
- Visually describe the moods, details, structures, styles, and/or proportions of the image. Remember, the focus is on visual attributes.
- Craft your input by "showing" and not "telling" the imagery. Think in terms of what you'd want to see in a photograph or a painting.
- It's best to follow this format for image creation:
"detailed keywords to describe the subject, separated by comma | keywords we want to exclude from the final image"
- Here's an example prompt for generating a realistic portrait photo of a man:
"photo of a man in black clothes, half body, high detailed skin, coastline, overcast weather, wind, waves, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3 | semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, out of frame, low quality, ugly, mutation, deformed"
- Generate images only once per human query unless explicitly requested by the user`;
  }

  replaceNewLinesWithSpaces(inputString) {
    return inputString.replace(/\r\n|\r|\n/g, ' ');
  }

  getMarkdownImageUrl(imageName) {
    const imageUrl = path.join(this.relativeImageUrl, imageName).replace(/\\/g, '/').replace('public/', '');
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
    const url = this.url;
    const payload = {
      prompt: input.split('|')[0],
      negative_prompt: input.split('|')[1],
      steps: 20
    };
    const response = await axios.post(`${url}/sdapi/v1/txt2img`, payload);
    const image = response.data.images[0];

    const pngPayload = { image: `data:image/png;base64,${image}` };
    const response2 = await axios.post(`${url}/sdapi/v1/png-info`, pngPayload);
    const info = response2.data.info;

    // Generate unique name
    const imageName = `${Date.now()}.png`;
    this.outputPath = path.resolve(__dirname, '..', '..', '..', '..', 'client', 'public', 'images');
    const appRoot = path.resolve(__dirname, '..', '..', '..', '..', 'client');
    this.relativeImageUrl = path.relative(appRoot, this.outputPath);

    // Check if directory exists, if not create it
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }

    try {
      const buffer = Buffer.from(image.split(',', 1)[0], 'base64');
      await sharp(buffer)
        .withMetadata({
          iptcpng: {
            parameters: info
          }
        })
        .toFile(this.outputPath + '/' + imageName);
      this.result = this.getMarkdownImageUrl(imageName);
    } catch (error) {
      console.error('Error while saving the image:', error);
      // this.result = theImageUrl;
    }

    return this.result;
  }
}

module.exports = StableDiffusionAPI;
