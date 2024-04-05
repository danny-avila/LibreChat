const BaseClient = require('./BaseClient');
const { default: axios } = require('axios');
const uuid = require('uuid');
const fs = require('fs');
const sharp = require('sharp');
const { putObjectToR2 } = require('~/utils/r2Client');

class SdImageClient extends BaseClient {
  static runpodApi;
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    // console.log('--- SdImageClient', apiKey, options);

    SdImageClient.runpodApi = axios.create({
      baseURL: 'https://api.runpod.ai/v2/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    this.modelOptions = options.modelOptions;
    this.setOptions(options);
  }

  // Baseclass required methods
  getSaveOptions() {
    return {
      ...this.modelOptions,
    };
  }

  async buildMessages(messages) {
    // console.log('=== SdImageClient -> buildMessages ===', messages);
    return {
      prompt: messages[messages.length - 1].text,
      // promptTokens: 0,
    };
  }

  getBuildMessagesOptions(messages = [], parentMessageId) {
    console.log('--- getBuildMessageOptions ---', messages, parentMessageId);
  }

  setOptions(options) {
    this.options = {
      inputOptions: {
        prompt: '',
        negative_prompt: '',
        seed: -1,
        cfg_scale: 7.5,
        sampler_index: 'DDIM',
        num_inference_steps: 35,
        email: 'melodyxpot@gmail.com',
      },
      filePath: process.env.SDIMAGE_UPLOAD ?? 'uploads/sdimages',
      ...options,
      modelOptions: options.modelOptions ? options.modelOptions : {},
    };
  }

  async sendCompletion(payload) {
    // console.log('=== SdImageClient -> sendCompletion ===', payload);
    const result = await this.getCompletion(payload);
    // return {
    //   files: [{ filepath: `${this.options.fileLinkPrefix}${result.filename}` }],
    //   text: this.wrapInMarkdown(`${this.options.fileLinkPrefix}${result.filename}`),
    // };
    return this.wrapInMarkdown(`${this.options.fileLinkPrefix}${result.filename}`);
  }

  wrapInMarkdown(imageUrl) {
    return `![generated image](${imageUrl})`;
  }

  // Runpod API Methods
  async getCompletion(text) {
    this.checkAndCreateFolder(this.options.filePath);

    const imageData = await this.generateSdImage(this.options.modelOptions.model, text);
    const imageBuffer = Buffer.from(imageData, 'base64');
    const filename = `sdimage-${uuid.v4()}.png`;
    const filePath = `${this.options.filePath}/${filename}`;

    await sharp(imageBuffer).toFile(filePath);
    const fileStream = fs.readFileSync(filePath);
    // Upload the image to Cloudflare R2
    const result = await putObjectToR2(
      filename,
      fileStream,
      fs.statSync(filePath).size,
      'image/png',
    );
    fs.unlinkSync(filePath);

    return { filename, result };
  }

  splitPrompt(prompt) {
    const promptParts = prompt.split('--no', 2);

    if (!promptParts[0]) {
      throw new Error('You must input at least prompt to generate the image');
    }

    return {
      prompt: promptParts[0],
      negative_prompt: promptParts[1] ? promptParts[0] : '',
    };
  }

  /**
   *
   * @param {string} model
   * @param {string} text
   * @description Generate the image using runpod with async
   * @returns
   */
  async generateSdImage(model, message) {
    const { prompt, negative_prompt } = this.splitPrompt(message);
    console.log('=== SdImageClient - generateSdImage ===', prompt, negative_prompt);
    let intervalId;

    try {
      const axiosResponse = await SdImageClient.runpodApi({
        url: `/${SdImageClient.getSdApiId(model)}/run`,
        data: {
          input: {
            ...this.options.inputOptions,
            prompt,
            negative_prompt,
          },
        },
      });
      console.log('Runpod QUEUE Procced => ', axiosResponse.data.id);

      return new Promise((resolve, reject) => {
        try {
          intervalId = setInterval(async function () {
            const response = await SdImageClient.runpodApi({
              url: `/${SdImageClient.getSdApiId(model)}/status/${axiosResponse.data.id}/`,
            });

            if (response.data.status === 'FAILED') {
              reject(response.data.error);
            }

            if (response.data.status == 'COMPLETED') {
              clearInterval(intervalId);
              console.log('queue completed');

              const imageData = response.data.output.images[0];
              if (!imageData) {
                reject(response.data.output);
              }

              resolve(imageData);
            }
          }, 1000);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      clearInterval(intervalId);
      throw new Error(`[SdImage Error] ${error}`);
    }
  }

  static getSdApiId(model) {
    let apiId = '';
    switch (model) {
      case 'Automatic1111':
        apiId = process.env.SD_AUTOMATIC1111_ID;
        break;
      case 'Stable Diffusion XL':
        apiId = process.env.SD_XL_ID;
        break;
      case 'SD Open Journey':
        apiId = process.env.SD_OPEN_JOURNEY_ID;
        break;
      case 'SD Anything V5':
        apiId = process.env.SD_ANYTHING_V5_ID;
        break;
      case 'SD Realistic Vision':
        apiId = process.env.SD_REALISTIC_VERSION_ID;
    }
    return apiId;
  }

  checkAndCreateFolder(folderPath) {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }
  }
}

module.exports = SdImageClient;
